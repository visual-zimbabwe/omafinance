const test = require("node:test")
const assert = require("node:assert/strict")

const Model = require("../src/Model.js")

test("missing numeric values stay missing", () => {
  assert.equal(Model.formatPrice(null, "USD", 2), "-")
  assert.equal(Model.formatPrice(undefined, "USD", 2), "-")
  assert.equal(Model.formatPercent(null), "-")
  assert.equal(Model.formatCompact(""), "-")
  assert.equal(Model.formatCompact("   "), "-")
  assert.equal(Model.changeTone(null), "flat")
  assert.deepEqual(Model.buildDetailStats({}, { beta: null }, {}), [])
})

test("zero remains a valid numeric value", () => {
  assert.equal(Model.formatPrice(0, "USD", 2), "$0.00")
  assert.equal(Model.formatPercent(0), "0.00%")
  assert.equal(Model.formatCompact(0), "0")
  assert.equal(Model.changeTone(0), "flat")
})

test("detail changes show amount then parenthesized percent", () => {
  assert.equal(Model.formatChangePair(1.25, 2.5, 100, "USD", 2), "+$2.50 (+1.25%)")
  assert.equal(Model.formatChangePair(-1.25, -2.5, 100, "USD", 2), "-$2.50 (-1.25%)")
  assert.equal(Model.formatChangePair(0, 0, 100, "USD", 2), "$0.00 (0.00%)")
  assert.equal(Model.formatChangePair(null, 2.5, null, "USD", 2), "+$2.50")
})

test("delayed loader stays hidden until the wait elapses while still loading", () => {
  assert.equal(Model.delayedLoaderDelayMs(), 100)
  assert.equal(Model.shouldShowDelayedLoader(false, 1, 200, 100), false)
  assert.equal(Model.shouldShowDelayedLoader(true, 0, 200, 100), false)
  assert.equal(Model.shouldShowDelayedLoader(true, 100, 199, 100), false)
  assert.equal(Model.shouldShowDelayedLoader(true, 100, 200, 100), true)
  assert.equal(Model.shouldShowDelayedLoader(true, 100, 150, 100), false)
})

test("retry delay backs off exponentially and respects its ceiling", () => {
  assert.equal(Model.backoffDelay(5000, 0, 60000), 5000)
  assert.equal(Model.backoffDelay(5000, 1, 60000), 10000)
  assert.equal(Model.backoffDelay(5000, 4, 60000), 60000)
  assert.equal(Model.backoffDelay(5000, 20, 60000), 60000)
})

test("insights response validation rejects transport payloads and API errors", () => {
  assert.equal(Model.isInsightsResponse(""), false)
  assert.equal(Model.isInsightsResponse("not json"), false)
  assert.equal(Model.isInsightsResponse(JSON.stringify({
    finance: { result: null, error: { code: "Unavailable" } }
  })), false)
  assert.equal(Model.isInsightsResponse(JSON.stringify({
    finance: { result: { recommendation: {} }, error: null }
  })), true)
})

test("search includes commodity futures while excluding options", () => {
  const raw = JSON.stringify({
    quotes: [
      {
        symbol: "SI=F",
        shortname: "Silver Futures",
        quoteType: "FUTURE",
        exchange: "CMX",
        exchDisp: "New York Commodity Exchange"
      },
      {
        symbol: "AAPL",
        shortname: "Apple Inc.",
        quoteType: "EQUITY",
        exchange: "NMS",
        exchDisp: "NasdaqGS"
      },
      {
        symbol: "AAPL260918C00200000",
        shortname: "AAPL Call",
        quoteType: "OPTION",
        exchange: "OPR",
        exchDisp: "Options"
      }
    ]
  })

  assert.deepEqual(Model.parseSearch(raw), [
    {
      symbol: "SI=F",
      name: "Silver Futures",
      type: "FUTURE",
      exchange: "New York Commodity Exchange"
    },
    {
      symbol: "AAPL",
      name: "Apple Inc.",
      type: "EQUITY",
      exchange: "NasdaqGS"
    }
  ])
})

test("chart parser does not turn missing quote fields into zero", () => {
  const raw = JSON.stringify({
    chart: {
      result: [{
        meta: {
          symbol: "TEST",
          regularMarketPrice: null,
          regularMarketChangePercent: null,
          fulldayPrice: null,
          fulldayChangePercent: null
        },
        indicators: { quote: [{ close: [null, 10, undefined, 11] }] }
      }]
    }
  })

  const quote = Model.parseChart(raw)
  assert.equal(quote.price, null)
  assert.equal(quote.changePercent, null)
  assert.equal(quote.regularPrice, null)
  assert.equal(quote.regularChangePercent, null)
  assert.equal(quote.extendedPrice, null)
  assert.deepEqual(quote.closes, [10, 11])
})

test("chart parser calculates change when Yahoo omits the percentage", () => {
  const raw = JSON.stringify({
    chart: {
      result: [{
        meta: {
          symbol: "TEST",
          regularMarketPrice: 105,
          chartPreviousClose: 100,
          regularMarketChangePercent: null,
          currency: "USD"
        },
        indicators: { quote: [{ close: [100, 105] }] }
      }]
    }
  })

  const quote = Model.parseChart(raw)
  assert.equal(quote.price, 105)
  assert.equal(quote.changePercent, 5)
})

test("bar fields can be shown independently", () => {
  const quote = { price: 241.6, currency: "USD", priceHint: 2, change: 2.94, changePercent: 1.234 }
  assert.equal(Model.barLabel("AAPL", quote, false, true, true, true), "AAPL  $241.60  +1.23%")
  assert.equal(Model.barLabel("AAPL", quote, false, false, true, true), "$241.60  +1.23%")
  assert.equal(Model.barLabel("AAPL", quote, false, true, false, true), "AAPL  +1.23%")
  assert.equal(Model.barLabel("AAPL", quote, false, true, true, false), "AAPL  $241.60")
  assert.equal(Model.barLabel("AAPL", quote, false, false, false, false), "$")
  assert.equal(Model.barLabel("AAPL", quote, false, true, true, true, "dollars"), "AAPL  $241.60  +$2.94")
  assert.equal(Model.barLabelTone(quote, true, false, false), "up")
  assert.equal(Model.barLabelTone(quote, false, true, false), "up")
  assert.equal(Model.barLabelTone(quote, false, false, true), "up")
  assert.equal(Model.barLabelTone(quote, false, false, false), "flat")
  assert.equal(Model.barLabelTone(null, true, true, true), "flat")
  assert.equal(Model.barLabelTone({ change: -2.94, changePercent: null }, true, false, false, "dollars"), "down")
})

test("detail quote refresh targets only the active symbol", () => {
  assert.deepEqual(Model.quoteSymbolsForView(["AAPL", "MSFT"], " nvda ", "detail"), ["NVDA"])
  assert.deepEqual(Model.quoteSymbolsForView(["AAPL", "MSFT"], "NVDA", "list"), ["AAPL", "MSFT"])
  assert.deepEqual(Model.quoteSymbolsForView(["AAPL"], "", "detail"), ["AAPL"])
})

test("state parsing normalizes symbols and removes invalid pins", () => {
  const state = Model.parseState(JSON.stringify({
    watchlist: [" aapl ", "AAPL", "msft"],
    pinned: ["MSFT", "missing"],
    detailRange: "1Y"
  }))

  assert.deepEqual(state, {
    watchlist: ["AAPL", "MSFT"],
    pinned: ["MSFT"],
    detailRange: "1Y"
  })
})

test("parseCandles extracts and sanitizes OHLCV candle structures and forward-fills nulls", () => {
  const timestamps = [1699999700, 1700000000, 1700000300, 1700000600]
  const indicators = {
    quote: [{
      open: [null, 150.0, null, null],
      high: [null, 155.0, 154.0, null],
      low: [null, 149.0, 150.0, null],
      close: [null, 152.0, 151.0, null],
      volume: [null, 1000, null, 2000]
    }]
  }

  const candles = Model.parseCandles(timestamps, indicators)
  // Leading null bar at 1699999700 is dropped, remaining 3 bars are kept (bar 3 is forward-filled)
  assert.equal(candles.length, 3)
  assert.deepEqual(candles[0], {
    timestamp: 1700000000,
    open: 150.0,
    high: 155.0,
    low: 149.0,
    close: 152.0,
    volume: 1000
  })
  assert.deepEqual(candles[1], {
    timestamp: 1700000300,
    open: 151.0,
    high: 154.0,
    low: 150.0,
    close: 151.0,
    volume: 0
  })
  assert.deepEqual(candles[2], {
    timestamp: 1700000600,
    open: 151.0,
    high: 151.0,
    low: 151.0,
    close: 151.0,
    volume: 2000
  })
})

test("formatCandleTime formats timestamps per timeframe range", () => {
  const ts = 1725548400 // specific unix timestamp (Fri Sep 5 2024 / 2026)
  const dt = new Date(ts * 1000)
  assert.ok(Model.formatCandleTime(ts, "60").includes(String(dt.getFullYear())))
  assert.ok(Model.formatCandleTime(ts, "60").includes("M")) // AM or PM
  assert.ok(Model.formatCandleTime(ts, "1D").length > 0)
  assert.ok(Model.formatCandleTime(ts, "1W").length > 0)
  assert.ok(Model.formatCandleTime(ts, "1M").length > 0)
  assert.ok(Model.formatCandleTime(ts, "1Y").length > 0)
  assert.equal(Model.formatCandleTime(null, "60"), "")
})

test("formatTimeAxisLabel formats compact date labels for bottom time scale", () => {
  const tsDay1Hour1 = 1725548400 // Day 1 15:00
  const tsDay1Hour2 = 1725548400 + 3600 // Day 1 16:00
  const tsDay2Hour1 = 1725548400 + 86400 // Day 2 15:00

  // 60m intraday: first tick of session shows day/date
  const day1Label = Model.formatTimeAxisLabel(tsDay1Hour1, "60", null)
  assert.ok(day1Label.length > 0)

  // 60m intraday: subsequent tick on same day shows time
  const hour2Label = Model.formatTimeAxisLabel(tsDay1Hour2, "60", tsDay1Hour1)
  assert.ok(hour2Label.includes(":") || hour2Label.includes("M"))

  // 60m intraday: tick on new day shows day/date
  const day2Label = Model.formatTimeAxisLabel(tsDay2Hour1, "60", tsDay1Hour2)
  assert.notEqual(day2Label, hour2Label)

  assert.ok(Model.formatTimeAxisLabel(tsDay1Hour1, "1D").length > 0)
  assert.ok(Model.formatTimeAxisLabel(tsDay1Hour1, "1W").length > 0)
  assert.ok(Model.formatTimeAxisLabel(tsDay1Hour1, "1M").length > 0)
  assert.ok(Model.formatTimeAxisLabel(tsDay1Hour1, "1Y").length > 0)
  assert.equal(Model.formatTimeAxisLabel(null, "1D"), "")
})

test("stratScenario accurately identifies 1, 2u, 2d, and 3 scenarios", () => {
  const prev = { high: 100, low: 90 }

  // 1: Inside bar (high <= prev.high && low >= prev.low)
  assert.equal(Model.stratScenario({ high: 99, low: 91 }, prev), "1")
  assert.equal(Model.stratScenario({ high: 100, low: 90 }, prev), "1")

  // 2u: Directional Up (high > prev.high && low >= prev.low)
  assert.equal(Model.stratScenario({ high: 105, low: 90 }, prev), "2u")
  assert.equal(Model.stratScenario({ high: 105, low: 95 }, prev), "2u")

  // 2d: Directional Down (low < prev.low && high <= prev.high)
  assert.equal(Model.stratScenario({ high: 100, low: 85 }, prev), "2d")
  assert.equal(Model.stratScenario({ high: 95, low: 85 }, prev), "2d")

  // 3: Outside bar (high > prev.high && low < prev.low)
  assert.equal(Model.stratScenario({ high: 105, low: 85 }, prev), "3")

  // Missing or invalid data
  assert.equal(Model.stratScenario(null, prev), "-")
  assert.equal(Model.stratScenario({ high: 100, low: 90 }, null), "-")
})

test("mergePeriodCandles merges trailing duplicate period snapshots", () => {
  // Weekly test: Mon Aug 31 (1788148800) and Fri Sep 4 (1788552001)
  const weeklyCandles = [
    { timestamp: 1787544000, open: 310, high: 315, low: 305, close: 312, volume: 1000 },
    { timestamp: 1788148800, open: 319, high: 325, low: 318, close: 320, volume: 2000 },
    { timestamp: 1788552001, open: 325, high: 328, low: 317, close: 328, volume: 500 }
  ]
  const mergedWeekly = Model.mergePeriodCandles(weeklyCandles, "1W")
  assert.equal(mergedWeekly.length, 2)
  assert.deepEqual(mergedWeekly[1], {
    timestamp: 1788148800,
    open: 319,
    high: 328, // max(325, 328)
    low: 317,  // min(318, 317)
    close: 328, // updated to latest close
    volume: 2500
  })

  // Monthly test: Sep 1 (1788235200) and Sep 4 (1788552001)
  const monthlyCandles = [
    { timestamp: 1780286400, open: 300, high: 310, low: 295, close: 305, volume: 5000 },
    { timestamp: 1788235200, open: 305, high: 315, low: 302, close: 310, volume: 3000 },
    { timestamp: 1788552001, open: 310, high: 320, low: 308, close: 319, volume: 1000 }
  ]
  const mergedMonthly = Model.mergePeriodCandles(monthlyCandles, "1M")
  assert.equal(mergedMonthly.length, 2)
  assert.deepEqual(mergedMonthly[1], {
    timestamp: 1788235200,
    open: 305,
    high: 320,
    low: 302,
    close: 319,
    volume: 4000
  })

  // 60-Minute test: 19:30 UTC (1788550200) and 20:00 UTC market close snapshot (1788552000)
  const hourlyCandles = [
    { timestamp: 1788546600, open: 320, high: 322, low: 320, close: 321, volume: 2000 },
    { timestamp: 1788550200, open: 321, high: 322, low: 319, close: 320, volume: 4000 },
    { timestamp: 1788552000, open: 319.5, high: 320, low: 319.5, close: 319.5, volume: 0 }
  ]
  const mergedHourly = Model.mergePeriodCandles(hourlyCandles, "60")
  assert.equal(mergedHourly.length, 2)
  assert.deepEqual(mergedHourly[1], {
    timestamp: 1788550200,
    open: 321,
    high: 322,
    low: 319,
    close: 319.5,
    volume: 4000
  })
})

test("extractFTFC accurately extracts multi-timeframe continuity", () => {
  // Construct timestamps:
  // Mon Aug 31, 2026: 1788148800 (Week open)
  // Tue Sep 1, 2026: 1788235200 (Month open)
  // Fri Sep 4, 2026 14:00 UTC: 1788530400 (Day open)
  // Fri Sep 4, 2026 15:00 UTC: 1788534000 (Prev hour close / 60m open)
  // Fri Sep 4, 2026 16:00 UTC: 1788537600 (Current bar)
  const timestamps = [1788148800, 1788235200, 1788530400, 1788534000, 1788537600]
  const indicators = {
    quote: [{
      close: [100, 105, 110, 115, 120]
    }]
  }

  // Case 1: Bullish across all (price 125 >= 115, 110, 100, 105)
  const ftfcBull = Model.extractFTFC(timestamps, indicators, 125, { regularMarketOpen: 110 })
  assert.deepEqual(ftfcBull, {
    "60": "up",
    "D": "up",
    "W": "up",
    "M": "up"
  })

  // Case 2: Mixed (price 112 -> 60m down vs 115, D up vs 110, W up vs 100, M up vs 105)
  const ftfcMixed = Model.extractFTFC(timestamps, indicators, 112, { regularMarketOpen: 110 })
  assert.deepEqual(ftfcMixed, {
    "60": "down",
    "D": "up",
    "W": "up",
    "M": "up"
  })

  // Case 3: Bearish across all (price 95)
  const ftfcBear = Model.extractFTFC(timestamps, indicators, 95, { regularMarketOpen: 110 })
  assert.deepEqual(ftfcBear, {
    "60": "down",
    "D": "down",
    "W": "down",
    "M": "down"
  })

  // Case 4: GOOGL multi-timeframe scenario (Spark without open array)
  // Aug 28 (prior week close: 346.59), Aug 31 (Mon close: 337.525), Sep 1 (Month close: 336.66),
  // Sep 3 (Thu close: 342.48), Sep 4 14:00 (Fri 10:30am close: 337.99), Sep 4 15:00 (prev hr close: 338.50), Sep 4 16:00 (cur close: 338.46)
  const googlTimestamps = [1787976000, 1788148800, 1788235200, 1788448800, 1788530400, 1788534000, 1788537600]
  const googlSparkIndicators = {
    quote: [{
      close: [346.59, 337.525, 336.66, 342.48, 337.99, 338.50, 338.46]
    }]
  }
  const ftfcGooglSpark = Model.extractFTFC(googlTimestamps, googlSparkIndicators, 338.46, {
    regularMarketOpen: 342.47,
    previousClose: 342.48
  })
  assert.deepEqual(ftfcGooglSpark, {
    "60": "down",
    "D": "down",
    "W": "down",
    "M": "up"
  })

  // Case 5: Explicit open array (Chart payload)
  const googlChartIndicators = {
    quote: [{
      open: [345.00, 343.83, 336.00, 340.00, 342.47, 338.50, 338.50],
      close: [346.59, 337.525, 336.66, 342.48, 337.99, 338.50, 338.46]
    }]
  }
  const ftfcGooglChart = Model.extractFTFC(googlTimestamps, googlChartIndicators, 338.46, {
    regularMarketOpen: 342.47,
    previousClose: 342.48
  })
  assert.deepEqual(ftfcGooglChart, {
    "60": "down",
    "D": "down",
    "W": "down",
    "M": "up"
  })

  // Case 6: Missing data returns flat fallback
  assert.deepEqual(Model.extractFTFC([], {}, null, null), {
    "60": "flat",
    "D": "flat",
    "W": "flat",
    "M": "flat"
  })
})

test("timeframeColor maps FTFC continuity tone to color", () => {
  const quote = {
    ftfc: { "60": "up", "D": "down", "W": "flat", "M": "up" }
  }
  assert.equal(Model.timeframeColor(quote, "60", "green", "red", "gray"), "green")
  assert.equal(Model.timeframeColor(quote, "D", "green", "red", "gray"), "red")
  assert.equal(Model.timeframeColor(quote, "W", "green", "red", "gray"), "gray")
  assert.equal(Model.timeframeColor(quote, "M", "green", "red", "gray"), "green")
  assert.equal(Model.timeframeColor(null, "60", "green", "red", "gray"), "gray")
})

test("grid state parsing and serialization preserves grid configuration", () => {
  const customSplits = {
    "2x2": { rowRatio: 0.6, colTopRatio: 0.4, colBotRatio: 0.5 },
    "2+3": { rowRatio: 0.45, colTopRatio: 0.5, colBotRatios: [0.3, 0.35, 0.35] }
  }
  const serialized = Model.serializeState(
    ["AAPL", "TSLA"],
    ["AAPL"],
    "1D",
    "2+3",
    { symbol: false, timeframe: true, crosshair: true, time: true },
    ["AAPL", "NVDA", "MSFT", "AMZN", "GOOGL"],
    customSplits
  )
  const parsed = Model.parseState(serialized)

  assert.equal(parsed.gridMode, "2+3")
  assert.deepEqual(parsed.gridSync, { symbol: false, timeframe: true, crosshair: true, time: true })
  assert.deepEqual(parsed.gridSymbols, ["AAPL", "NVDA", "MSFT", "AMZN", "GOOGL"])
  assert.deepEqual(parsed.gridSplits, customSplits)
})

test("gridTimeframes returns expected timeframes per layout", () => {
  assert.deepEqual(Model.gridTimeframes("2x2"), ["60", "1D", "1W", "1M"])
  assert.deepEqual(Model.gridTimeframes("2+3"), ["60", "1D", "1W", "1M", "1Y"])
  assert.deepEqual(Model.gridTimeframes("1x1"), ["1D"])
})

test("parseInterval parses TradingView-style interval keystrokes and shorthands", () => {
  assert.equal(Model.parseInterval("60"), "60")
  assert.equal(Model.parseInterval("60m"), "60")
  assert.equal(Model.parseInterval("60min"), "60")
  assert.equal(Model.parseInterval("1h"), "60")
  assert.equal(Model.parseInterval("1hr"), "60")
  assert.equal(Model.parseInterval("H"), "60")
  assert.equal(Model.parseInterval("hour"), "60")
  assert.equal(Model.parseInterval("1D"), "1D")
  assert.equal(Model.parseInterval("d"), "1D")
  assert.equal(Model.parseInterval("1"), "1D")
  assert.equal(Model.parseInterval("day"), "1D")
  assert.equal(Model.parseInterval("daily"), "1D")
  assert.equal(Model.parseInterval("1W"), "1W")
  assert.equal(Model.parseInterval("w"), "1W")
  assert.equal(Model.parseInterval("week"), "1W")
  assert.equal(Model.parseInterval("weekly"), "1W")
  assert.equal(Model.parseInterval("1M"), "1M")
  assert.equal(Model.parseInterval("m"), "1M")
  assert.equal(Model.parseInterval("mo"), "1M")
  assert.equal(Model.parseInterval("month"), "1M")
  assert.equal(Model.parseInterval("monthly"), "1M")
  assert.equal(Model.parseInterval("1Y"), "1Y")
  assert.equal(Model.parseInterval("y"), "1Y")
  assert.equal(Model.parseInterval("yr"), "1Y")
  assert.equal(Model.parseInterval("year"), "1Y")
  assert.equal(Model.parseInterval("yearly"), "1Y")
  // Leading / trailing punctuation or whitespace
  assert.equal(Model.parseInterval(",1M"), "1M")
  assert.equal(Model.parseInterval(" 60 "), "60")
  assert.equal(Model.parseInterval(",1D"), "1D")
  assert.equal(Model.parseInterval("invalid"), null)
  assert.equal(Model.parseInterval(""), null)
  assert.equal(Model.parseInterval(null), null)
})

test("isCryptoSymbol detects cryptocurrency pairs", () => {
  assert.equal(Model.isCryptoSymbol("BTC-USD"), true)
  assert.equal(Model.isCryptoSymbol("ETH-USD"), true)
  assert.equal(Model.isCryptoSymbol("SOL-USDT"), true)
  assert.equal(Model.isCryptoSymbol("AAPL"), false)
  assert.equal(Model.isCryptoSymbol("MSFT"), false)
  assert.equal(Model.isCryptoSymbol("NVDA"), false)
})

test("chartUrl routes crypto 60, 1D, and 1W to Coinbase exchange and equities to Yahoo", () => {
  assert.ok(Model.chartUrl("BTC-USD", "60").includes("api.exchange.coinbase.com"))
  assert.ok(Model.chartUrl("BTC-USD", "60").includes("granularity=3600"))
  assert.ok(Model.chartUrl("BTC-USD", "1D").includes("api.exchange.coinbase.com"))
  assert.ok(Model.chartUrl("BTC-USD", "1D").includes("granularity=86400"))
  assert.ok(Model.chartUrl("BTC-USD", "1W").includes("api.exchange.coinbase.com"))
  assert.ok(Model.chartUrl("BTC-USD", "1W").includes("granularity=86400"))
  assert.ok(Model.chartUrl("AAPL", "60").includes("finance.yahoo.com"))
  assert.ok(Model.chartUrl("AAPL", "1D").includes("finance.yahoo.com"))
  assert.ok(Model.chartUrl("AAPL", "1W").includes("finance.yahoo.com"))
})

test("parseChart parses Coinbase candles array and generates valid quote and FTFC", () => {
  // [ time, low, high, open, close, volume ]
  const mockCb = [
    [1788739200, 80050, 80462, 80339, 80195, 150],
    [1788735600, 80010, 80564, 80048, 80339, 120],
    [1788732000, 79632, 80092, 79945, 80048, 110]
  ]
  const parsed = Model.parseChart(mockCb, "60", "BTC-USD")
  assert.ok(parsed)
  assert.equal(parsed.symbol, "BTC-USD")
  assert.equal(parsed.price, 80195)
  assert.equal(parsed.candles.length, 3)
  assert.deepEqual(parsed.candles[2], {
    timestamp: 1788739200,
    open: 80339,
    high: 80462,
    low: 80050,
    close: 80195,
    volume: 150
  })
})

test("chartCommand routes Hyperliquid tokens to Hyperliquid API and Coinbase/Yahoo appropriately", () => {
  const hlCmd60 = Model.chartCommand("HYPE32196-USD", "60")
  assert.ok(hlCmd60.some(arg => arg.includes("api.hyperliquid.xyz")))
  assert.ok(hlCmd60.some(arg => arg.includes("HYPE")))
  assert.ok(hlCmd60.some(arg => arg.includes("1h")))

  const hlCmd1D = Model.chartCommand("HYPE32196-USD", "1D")
  assert.ok(hlCmd1D.some(arg => arg.includes("api.hyperliquid.xyz")))
  assert.ok(hlCmd1D.some(arg => arg.includes("1d")))

  const hlCmd1W = Model.chartCommand("HYPE32196-USD", "1W")
  assert.ok(hlCmd1W.some(arg => arg.includes("api.hyperliquid.xyz")))
  assert.ok(hlCmd1W.some(arg => arg.includes("1d")))

  const btcCmd60 = Model.chartCommand("BTC-USD", "60")
  assert.ok(btcCmd60.some(arg => arg.includes("api.exchange.coinbase.com")))

  const aaplCmd = Model.chartCommand("AAPL", "1D")
  assert.ok(aaplCmd.some(arg => arg.includes("finance.yahoo.com")))
})

test("parseChart parses Hyperliquid candles array and generates valid quote and candles", () => {
  const mockHl = [
    { t: 1788732000000, o: "87.74", c: "87.36", h: "87.82", l: "86.52", v: "304626" },
    { t: 1788735600000, o: "87.36", c: "87.94", h: "88.03", l: "87.26", v: "129525" },
    { t: 1788739200000, o: "87.95", c: "87.77", h: "88.06", l: "87.60", v: "33955" }
  ]
  const parsed = Model.parseChart(mockHl, "60", "HYPE32196-USD")
  assert.ok(parsed)
  assert.equal(parsed.symbol, "HYPE32196-USD")
  assert.equal(parsed.price, 87.77)
  assert.equal(parsed.candles.length, 3)
  assert.deepEqual(parsed.candles[2], {
    timestamp: 1788739200,
    open: 87.95,
    high: 88.06,
    low: 87.60,
    close: 87.77,
    volume: 33955
  })
})

test("aggregateYearlyCandles groups monthly/daily candles by UTC year with correct OHLCV", () => {
  // 2024 monthly candles (Jan, Jun, Dec) and 2025 monthly candle (Jan)
  const jan2024Ts = Math.floor(Date.UTC(2024, 0, 1) / 1000)
  const jun2024Ts = Math.floor(Date.UTC(2024, 5, 1) / 1000)
  const dec2024Ts = Math.floor(Date.UTC(2024, 11, 1) / 1000)
  const jan2025Ts = Math.floor(Date.UTC(2025, 0, 1) / 1000)

  const inputCandles = [
    { timestamp: jan2024Ts, open: 100, high: 120, low: 95, close: 110, volume: 10000 },
    { timestamp: jun2024Ts, open: 110, high: 140, low: 105, close: 135, volume: 15000 },
    { timestamp: dec2024Ts, open: 135, high: 138, low: 125, close: 130, volume: 12000 },
    { timestamp: jan2025Ts, open: 130, high: 150, low: 128, close: 145, volume: 8000 }
  ]

  const yearly = Model.aggregateYearlyCandles(inputCandles)
  assert.equal(yearly.length, 2)

  // 2024 aggregated candle
  assert.deepEqual(yearly[0], {
    timestamp: jan2024Ts,
    open: 100,
    high: 140, // max(120, 140, 138)
    low: 95,   // min(95, 105, 125)
    close: 130, // latest close in 2024
    volume: 37000 // 10000 + 15000 + 12000
  })

  // 2025 aggregated candle
  assert.deepEqual(yearly[1], {
    timestamp: jan2025Ts,
    open: 130,
    high: 150,
    low: 128,
    close: 145,
    volume: 8000
  })

  // Also verify mergePeriodCandles with "1Y" delegates properly
  const merged1Y = Model.mergePeriodCandles(inputCandles, "1Y")
  assert.deepEqual(merged1Y, yearly)
})

test("mergePeriodCandles for 60m enforces RTH session-relative alignment and does not bleed across days", () => {
  // Fri Sep 4 2026 EDT (UTC-4):
  // 09:30 EDT = 13:30 UTC = 1788530400
  // 10:30 EDT = 14:30 UTC = 1788534000
  // 11:30 EDT = 15:30 UTC = 1788537600
  // 14:30 EDT = 18:30 UTC = 1788546600
  // 15:00 EDT (tick within 14:30 bar) = 19:00 UTC = 1788548400
  // 15:30 EDT = 19:30 UTC = 1788550200
  // 16:00 EDT (market close tick) = 20:00 UTC = 1788552000
  // Mon Sep 7 2026 EDT 09:30 EDT = 13:30 UTC = 1788789000

  const candles = [
    { timestamp: 1788530400, open: 100, high: 102, low: 99, close: 101, volume: 1000 },
    { timestamp: 1788534000, open: 101, high: 103, low: 100, close: 102, volume: 1200 },
    { timestamp: 1788537600, open: 102, high: 104, low: 101, close: 103, volume: 1100 },
    { timestamp: 1788546600, open: 103, high: 105, low: 102, close: 104, volume: 1500 },
    { timestamp: 1788548400, open: 104, high: 106, low: 103.5, close: 105, volume: 500 }, // Intraday tick -> merges into 14:30 bar
    { timestamp: 1788550200, open: 105, high: 107, low: 104.5, close: 106, volume: 2000 },
    { timestamp: 1788552000, open: 106, high: 106.5, low: 105.8, close: 106.2, volume: 300 }, // 16:00 close tick -> merges into 15:30 bar
    { timestamp: 1788789000, open: 106.5, high: 108, low: 106, close: 107.5, volume: 1800 } // Next session
  ]

  const merged = Model.mergePeriodCandles(candles, "60")
  assert.equal(merged.length, 6)

  // Bar 1: 09:30
  assert.equal(merged[0].timestamp, 1788530400)
  assert.equal(merged[0].close, 101)

  // Bar 2: 10:30
  assert.equal(merged[1].timestamp, 1788534000)
  assert.equal(merged[1].close, 102)

  // Bar 3: 11:30
  assert.equal(merged[2].timestamp, 1788537600)
  assert.equal(merged[2].close, 103)

  // Bar 4: 14:30 merged with 15:00 tick
  assert.equal(merged[3].timestamp, 1788546600)
  assert.equal(merged[3].open, 103)
  assert.equal(merged[3].high, 106)
  assert.equal(merged[3].low, 102)
  assert.equal(merged[3].close, 105)
  assert.equal(merged[3].volume, 2000)

  // Bar 5: 15:30 (30m bar) merged with 16:00 close snapshot
  assert.equal(merged[4].timestamp, 1788550200)
  assert.equal(merged[4].open, 105)
  assert.equal(merged[4].high, 107)
  assert.equal(merged[4].low, 104.5)
  assert.equal(merged[4].close, 106.2)
  assert.equal(merged[4].volume, 2300)

  // Bar 6: Next session 09:30
  assert.equal(merged[5].timestamp, 1788789000)
  assert.equal(merged[5].close, 107.5)
})

test("quoteFromChart updates developing candle High, Low, and Close with latest price tick and day high/low", () => {
  const mockChartPayload = {
    meta: {
      symbol: "NVDA",
      regularMarketPrice: 125.50,
      regularMarketDayHigh: 126.00,
      regularMarketDayLow: 122.00,
      regularMarketOpen: 123.00,
      previousClose: 121.00
    },
    timestamp: [1788530400, 1788534000],
    indicators: {
      quote: [{
        open: [123.00, 124.00],
        high: [124.50, 125.00],
        low: [122.50, 123.50],
        close: [124.00, 124.80],
        volume: [50000, 45000]
      }]
    }
  }

  // 1D test: developing candle expands to dayHigh/dayLow and latest price
  const quote1D = Model.quoteFromChart(mockChartPayload, "NVDA", "1D")
  assert.ok(quote1D)
  assert.equal(quote1D.price, 125.50)
  const last1D = quote1D.candles[quote1D.candles.length - 1]
  assert.equal(last1D.close, 125.50)
  assert.equal(last1D.high, 126.00) // Expanded to meta.regularMarketDayHigh
  assert.equal(last1D.low, 122.00)  // Expanded to meta.regularMarketDayLow

  // 60m test: developing candle updates close and expands high with real-time price tick
  const quote60 = Model.quoteFromChart(mockChartPayload, "NVDA", "60")
  assert.ok(quote60)
  const last60 = quote60.candles[quote60.candles.length - 1]
  assert.equal(last60.close, 125.50)
  assert.equal(last60.high, 125.50) // max(125.00, 125.50)
  assert.equal(last60.low, 123.50)  // min(123.50, 125.50)
})

test("formatCandleTime and formatTimeAxisLabel are resilient to UTC timezone boundaries", () => {
  const tsJan1 = Math.floor(Date.UTC(2025, 0, 1, 0, 0, 0) / 1000)
  assert.equal(Model.formatCandleTime(tsJan1, "1Y"), "2025")
  assert.equal(Model.formatCandleTime(tsJan1, "1M"), "Jan 2025")
  assert.equal(Model.formatCandleTime(tsJan1, "1D"), "Jan 1, 2025")

  assert.equal(Model.formatTimeAxisLabel(tsJan1, "1Y"), "2025")
  assert.equal(Model.formatTimeAxisLabel(tsJan1, "1M"), "Jan '25")
  assert.equal(Model.formatTimeAxisLabel(tsJan1, "1D"), "Jan 1")
})

test("quoteFromChart preserves pure RTH candles when extended hours (pre/post market) price is present", () => {
  const nowSec = Math.floor(Date.now() / 1000)
  const mockExtendedPayload = {
    meta: {
      symbol: "GOOGL",
      regularMarketPrice: 338.36,
      regularMarketDayHigh: 340.00,
      regularMarketDayLow: 335.00,
      regularMarketOpen: 336.00,
      previousClose: 335.00,
      fulldayPrice: 325.00, // Significant pre-market drop
      fulldayChangePercent: -3.95,
      hasPrePostMarketData: true,
      currentTradingPeriod: {
        pre: { start: nowSec - 300, end: nowSec + 300 },
        regular: { start: nowSec + 300, end: nowSec + 20000 },
        post: { start: nowSec + 20000, end: nowSec + 30000 }
      }
    },
    timestamp: [nowSec - 86400, nowSec - 43200],
    indicators: {
      quote: [{
        open: [336.00, 337.00],
        high: [338.00, 339.00],
        low: [335.00, 336.50],
        close: [337.50, 338.36],
        volume: [10000, 15000]
      }]
    }
  }

  const quote = Model.quoteFromChart(mockExtendedPayload, "GOOGL", "60")
  assert.ok(quote)
  // quote.price reflects extended market price for quote header / badges
  assert.equal(quote.price, 325.00)
  assert.equal(quote.regularPrice, 338.36)
  assert.equal(quote.extendedPrice, 325.00)

  // But chart candles MUST remain pure RTH data and not distorted by 325.00
  const lastCandle = quote.candles[quote.candles.length - 1]
  assert.equal(lastCandle.close, 338.36)
  assert.equal(lastCandle.low, 336.50)
  assert.equal(lastCandle.high, 339.00)
})

test("layout management: saveLayout, deleteLayout, and state persistence with layouts", () => {
  const initialLayouts = {}
  const saved1 = Model.saveLayout(initialLayouts, "Morning 6-Pack", [
    { symbol: "SPY", workspace: 2 },
    { symbol: "QQQ", workspace: 2 },
    { symbol: "DIA", workspace: 2 },
    { symbol: "IWM", workspace: 2 },
    { symbol: "XLC", workspace: 2 },
    { symbol: "GOOGL", workspace: 2 }
  ], 2)

  assert.ok(saved1["Morning 6-Pack"])
  assert.equal(saved1["Morning 6-Pack"].workspace, 2)
  assert.equal(saved1["Morning 6-Pack"].windows.length, 6)
  assert.equal(saved1["Morning 6-Pack"].windows[0].symbol, "SPY")

  const saved2 = Model.saveLayout(saved1, "Tech 2", ["AAPL", "MSFT"], 3)
  assert.equal(saved2["Tech 2"].workspace, 3)
  assert.equal(saved2["Tech 2"].windows.length, 2)

  const serialized = Model.serializeState(["SPY"], ["SPY"], "1D", "2x2", {}, [], {}, saved2)
  const parsed = Model.parseState(serialized)

  assert.ok(parsed.layouts)
  assert.equal(Object.keys(parsed.layouts).length, 2)
  assert.deepEqual(parsed.layouts["Morning 6-Pack"].windows, [
    { symbol: "SPY", workspace: 2 },
    { symbol: "QQQ", workspace: 2 },
    { symbol: "DIA", workspace: 2 },
    { symbol: "IWM", workspace: 2 },
    { symbol: "XLC", workspace: 2 },
    { symbol: "GOOGL", workspace: 2 }
  ])

  const deleted = Model.deleteLayout(parsed.layouts, "Tech 2")
  assert.equal(Object.keys(deleted).length, 1)
  assert.equal(deleted["Tech 2"], undefined)
  assert.ok(deleted["Morning 6-Pack"])
})

test("isSpdrSector accurately identifies all 11 GICS sector ETFs", () => {
  const sectors = ["XLC", "XLY", "XLP", "XLE", "XLF", "XLV", "XLI", "XLB", "XLRE", "XLK", "XLU"]
  for (const sym of sectors) {
    assert.equal(Model.isSpdrSector(sym), true)
    assert.equal(Model.isSpdrSector(sym.toLowerCase()), true)
    const info = Model.spdrSectorInfo(sym)
    assert.ok(info)
    assert.ok(info.seriesId.startsWith("S0000"))
    assert.equal(info.cik, "0001064641")
    assert.ok(Model.holdingsUrl(sym).includes("sec.gov/Archives/edgar/data/1064641/"))
  }
  assert.equal(Model.isSpdrSector("AAPL"), false)
  assert.equal(Model.isSpdrSector("SPY"), false)
  assert.equal(Model.isSpdrSector("BTC-USD"), false)
  assert.equal(Model.isSpdrSector(null), false)
  assert.equal(Model.isSpdrSector(""), false)
})

test("parseNportXml extracts equities, computes relative bar scales, and filters non-ticker holdings", () => {
  const sampleXml = `
<nportSubmission xmlns="http://www.sec.gov/edgar/nport">
  <formData>
    <genInfo>
      <repPdEnd>2026-06-30</repPdEnd>
    </genInfo>
    <invstOrSecs>
      <invstOrSec>
        <name>Meta Platforms Inc</name>
        <cusip>30303M102</cusip>
        <valUSD>2000000000.00</valUSD>
        <pctVal>20.0</pctVal>
        <assetCat>EC</assetCat>
      </invstOrSec>
      <invstOrSec>
        <name>Alphabet Inc</name>
        <cusip>02079K305</cusip>
        <valUSD>1000000000.00</valUSD>
        <pctVal>10.0</pctVal>
        <assetCat>EC</assetCat>
      </invstOrSec>
      <invstOrSec>
        <name>Cash Collateral / Repo Sweep</name>
        <cusip>000000000</cusip>
        <valUSD>50000000.00</valUSD>
        <pctVal>0.5</pctVal>
        <assetCat>CR</assetCat>
      </invstOrSec>
      <invstOrSec>
        <name>Unmapped Private Derivative</name>
        <cusip>999999999</cusip>
        <valUSD>20000000.00</valUSD>
        <pctVal>0.2</pctVal>
        <assetCat>EC</assetCat>
      </invstOrSec>
    </invstOrSecs>
  </formData>
</nportSubmission>`

  const parsed = Model.parseNportXml(sampleXml, "XLC")
  assert.ok(parsed)
  assert.equal(parsed.symbol, "XLC")
  assert.equal(parsed.reportDate, "2026-06-30")
  assert.equal(parsed.holdings.length, 2) // Cash sweep and unmapped non-ticker excluded
  assert.equal(parsed.holdings[0].symbol, "META")
  assert.equal(parsed.holdings[0].pctVal, 20.0)
  assert.equal(parsed.holdings[0].relativeRatio, 1.0) // Top holding fills 100%

  assert.equal(parsed.holdings[1].symbol, "GOOGL")
  assert.equal(parsed.holdings[1].pctVal, 10.0)
  assert.equal(parsed.holdings[1].relativeRatio, 0.5) // 10% / 20% = 0.5
})

test("parseNportXml handles empty or invalid xml gracefully", () => {
  assert.equal(Model.parseNportXml("", "XLC"), null)
  assert.equal(Model.parseNportXml(null, "XLC"), null)
  assert.equal(Model.parseNportXml("<invalid></invalid>", "XLC"), null)
})

test("sortHoldings correctly sorts holdings by weight, ticker, and name", () => {
  const holdings = [
    { symbol: "GOOGL", name: "Alphabet Inc", pctVal: 10.0 },
    { symbol: "META", name: "Meta Platforms Inc", pctVal: 20.0 },
    { symbol: "AAPL", name: "Apple Inc", pctVal: 15.0 }
  ]

  const byWeightDesc = Model.sortHoldings(holdings, "weight", false)
  assert.deepEqual(byWeightDesc.map(h => h.symbol), ["META", "AAPL", "GOOGL"])

  const byWeightAsc = Model.sortHoldings(holdings, "weight", true)
  assert.deepEqual(byWeightAsc.map(h => h.symbol), ["GOOGL", "AAPL", "META"])

  const byTickerAsc = Model.sortHoldings(holdings, "ticker", true)
  assert.deepEqual(byTickerAsc.map(h => h.symbol), ["AAPL", "GOOGL", "META"])

  const byTickerDesc = Model.sortHoldings(holdings, "ticker", false)
  assert.deepEqual(byTickerDesc.map(h => h.symbol), ["META", "GOOGL", "AAPL"])
})

test("parseNportXml handles dual-class shares (NWSA vs NWS) and delisted tickers (EA)", () => {
  const sampleXml = `
<nportSubmission xmlns="http://www.sec.gov/edgar/nport">
  <formData>
    <genInfo>
      <repPdEnd>2026-06-30</repPdEnd>
    </genInfo>
    <invstOrSecs>
      <invstOrSec>
        <name>News Corp Class A</name>
        <cusip>65249B109</cusip>
        <valUSD>1000000.00</valUSD>
        <pctVal>1.0</pctVal>
        <assetCat>EC</assetCat>
      </invstOrSec>
      <invstOrSec>
        <name>News Corp Class B</name>
        <cusip>65249B208</cusip>
        <valUSD>500000.00</valUSD>
        <pctVal>0.5</pctVal>
        <assetCat>EC</assetCat>
      </invstOrSec>
      <invstOrSec>
        <name>Electronic Arts Inc</name>
        <cusip>285512109</cusip>
        <valUSD>4000000.00</valUSD>
        <pctVal>4.0</pctVal>
        <assetCat>EC</assetCat>
      </invstOrSec>
    </invstOrSecs>
  </formData>
</nportSubmission>`

  const parsed = Model.parseNportXml(sampleXml, "XLC")
  assert.ok(parsed)
  assert.equal(parsed.holdings.length, 3)

  const ea = parsed.holdings.find(h => h.symbol === "EA")
  assert.ok(ea)
  assert.equal(ea.delisted, true)
  assert.equal(ea.symbol, "EA")

  const nwsa = parsed.holdings.find(h => h.symbol === "NWSA")
  assert.ok(nwsa)
  assert.equal(nwsa.delisted, false)

  const nws = parsed.holdings.find(h => h.symbol === "NWS")
  assert.ok(nws)
  assert.equal(nws.delisted, false)
})

test("allSpdrSectorsList returns all 11 GICS sector ETFs", () => {
  const sectors = Model.allSpdrSectorsList()
  assert.equal(sectors.length, 11)
  const symbols = sectors.map(s => s.symbol)
  assert.ok(symbols.includes("XLC"))
  assert.ok(symbols.includes("XLY"))
  assert.ok(symbols.includes("XLP"))
  assert.ok(symbols.includes("XLE"))
  assert.ok(symbols.includes("XLF"))
  assert.ok(symbols.includes("XLV"))
  assert.ok(symbols.includes("XLI"))
  assert.ok(symbols.includes("XLB"))
  assert.ok(symbols.includes("XLK"))
  assert.ok(symbols.includes("XLU"))
  assert.ok(symbols.includes("XLRE"))
})

test("sparkCandlesUrl generates valid URLs and filters duplicates", () => {
  const url1 = Model.sparkCandlesUrl(["AAPL", "msft", "AAPL"], "1d", "2y")
  assert.equal(url1, "https://query1.finance.yahoo.com/v7/finance/spark?symbols=AAPL,MSFT&range=2y&interval=1d&includePrePost=false")

  const url2 = Model.sparkCandlesUrl("NVDA", "60m", "1mo")
  assert.equal(url2, "https://query1.finance.yahoo.com/v7/finance/spark?symbols=NVDA&range=1mo&interval=60m&includePrePost=false")
})

test("computeSectorBreadthMetrics computes equal weight and cap weight strat breadth", () => {
  const holdings = [
    { symbol: "SYM1", pctVal: 50.0, delisted: false }, // 2u
    { symbol: "SYM2", pctVal: 30.0, delisted: false }, // 2d
    { symbol: "SYM3", pctVal: 20.0, delisted: false }, // 1 (inside)
    { symbol: "EA", pctVal: 10.0, delisted: true }      // delisted -> skipped
  ]

  // Daily candles:
  // SYM1: prev [100, 90], curr [105, 95] -> 2u
  // SYM2: prev [100, 90], curr [95, 85] -> 2d
  // SYM3: prev [100, 90], curr [98, 92] -> 1
  const dailyMap = {
    "SYM1": [
      { timestamp: 1704067200, open: 95, high: 100, low: 90, close: 98, volume: 100 },
      { timestamp: 1704153600, open: 98, high: 105, low: 95, close: 102, volume: 100 }
    ],
    "SYM2": [
      { timestamp: 1704067200, open: 95, high: 100, low: 90, close: 98, volume: 100 },
      { timestamp: 1704153600, open: 90, high: 95, low: 85, close: 88, volume: 100 }
    ],
    "SYM3": [
      { timestamp: 1704067200, open: 95, high: 100, low: 90, close: 98, volume: 100 },
      { timestamp: 1704153600, open: 94, high: 98, low: 92, close: 96, volume: 100 }
    ]
  }

  // Equal Weight
  const eq = Model.computeSectorBreadthMetrics(holdings, {}, dailyMap, "equal")
  assert.ok(eq["1D"])
  assert.equal(eq["1D"].totalCount, 3)
  assert.equal(eq["1D"].count2u, 1)
  assert.equal(eq["1D"].count2d, 1)
  assert.equal(eq["1D"].countOther, 1)
  assert.equal(Math.round(eq["1D"].pct2u), 33)
  assert.equal(Math.round(eq["1D"].pct2d), 33)
  assert.equal(Math.round(eq["1D"].netDelta), 0)

  // Cap Weight (Total weight = 50 + 30 + 20 = 100)
  const cap = Model.computeSectorBreadthMetrics(holdings, {}, dailyMap, "cap")
  assert.ok(cap["1D"])
  assert.equal(cap["1D"].pct2u, 50)
  assert.equal(cap["1D"].pct2d, 30)
  assert.equal(cap["1D"].pctOther, 20)
  assert.equal(cap["1D"].netDelta, 20)
})

test("sortSectorBreadth sorts sectors by timeframe net buyer strength", () => {
  const sectors = [
    {
      symbol: "XLF",
      timeframes: {
        "1Y": { netDelta: 10.0 },
        "1D": { netDelta: -20.0 }
      }
    },
    {
      symbol: "XLK",
      timeframes: {
        "1Y": { netDelta: 45.0 },
        "1D": { netDelta: 15.0 }
      }
    },
    {
      symbol: "XLE",
      timeframes: {
        "1Y": { netDelta: -15.0 },
        "1D": { netDelta: 30.0 }
      }
    }
  ]

  // Default 1Y descending: XLK (45) -> XLF (10) -> XLE (-15)
  const sorted1YDesc = Model.sortSectorBreadth(sectors, "1Y", false)
  assert.deepEqual(sorted1YDesc.map(s => s.symbol), ["XLK", "XLF", "XLE"])

  // 1Y ascending: XLE (-15) -> XLF (10) -> XLK (45)
  const sorted1YAsc = Model.sortSectorBreadth(sectors, "1Y", true)
  assert.deepEqual(sorted1YAsc.map(s => s.symbol), ["XLE", "XLF", "XLK"])

  // 1D descending: XLE (30) -> XLK (15) -> XLF (-20)
  const sorted1DDesc = Model.sortSectorBreadth(sectors, "1D", false)
  assert.deepEqual(sorted1DDesc.map(s => s.symbol), ["XLE", "XLK", "XLF"])
})

test("formatNetDelta formats signed percent strings", () => {
  assert.equal(Model.formatNetDelta(25.46), "+25.5%")
  assert.equal(Model.formatNetDelta(-12.34), "-12.3%")
  assert.equal(Model.formatNetDelta(0), "0.0%")
  assert.equal(Model.formatNetDelta(null), "0.0%")
})

test("state persistence preserves breadth settings", () => {
  const serialized = Model.serializeState(
    ["AAPL"],
    [],
    "1D",
    "2x2",
    {},
    [],
    {},
    {},
    "cap",
    "1W",
    true
  )

  const parsed = Model.parseState(serialized)
  assert.equal(parsed.breadthWeightMode, "cap")
  assert.equal(parsed.breadthSortTimeframe, "1W")
  assert.equal(parsed.breadthSortAsc, true)
})

test("computeStratDetails computes bar, polarity, inForce, 3-bar sequence, and triggers", () => {
  // Candles:
  // c0: O:100 H:105 L:95 C:100
  // c1: O:100 H:110 L:98 C:108 (2u vs c0)
  // c2: O:108 H:109 L:99 C:105 (1 vs c1)
  // c3: O:105 H:112 L:104 C:111 (2u vs c2, price >= 109 -> In-Force, price >= 105 -> green)
  const candles = [
    { open: 100, high: 105, low: 95, close: 100 },
    { open: 100, high: 110, low: 98, close: 108 },
    { open: 108, high: 109, low: 99, close: 105 },
    { open: 105, high: 112, low: 104, close: 111 }
  ]

  const res = Model.computeStratDetails(candles)
  assert.equal(res.bar, "2U")
  assert.equal(res.polarity, "green")
  assert.equal(res.inForce, "In-Force")
  assert.equal(res.sequence, "2U-1-2U")
  assert.equal(res.triggerHigh, 109)
  assert.equal(res.triggerLow, 99)
  assert.equal(res.open, 105)
  assert.equal(res.high, 112)
  assert.equal(res.low, 104)
  assert.equal(res.close, 111)

  // Test 2u not in-force (price dropped below prev high)
  const res2 = Model.computeStratDetails(candles, { price: 107 })
  assert.equal(res2.bar, "2U")
  assert.equal(res2.polarity, "green") // 107 >= 105
  assert.equal(res2.inForce, "Not In-Force") // 107 < 109
  assert.equal(res2.close, 107)

  // Test 2d in-force
  const candles2d = [
    { open: 100, high: 105, low: 95, close: 100 },
    { open: 100, high: 96, low: 90, close: 92 }
  ]
  const res2d = Model.computeStratDetails(candles2d)
  assert.equal(res2d.bar, "2D")
  assert.equal(res2d.polarity, "red") // 92 < 100
  assert.equal(res2d.inForce, "In-Force") // 92 <= 95
  assert.equal(res2d.sequence, "2D")
  assert.equal(res2d.triggerHigh, 105)
  assert.equal(res2d.triggerLow, 95)
})

test("sortHoldings correctly sorts by timeframe Strat columns (Option B: 3 > 2U > 2D > 1, Green > Red)", () => {
  const holdings = [
    { symbol: "BAR1", pctVal: 10.0 }, // 1 Green
    { symbol: "BAR2U_RED", pctVal: 20.0 }, // 2U Red
    { symbol: "BAR3", pctVal: 15.0 }, // 3 Green
    { symbol: "BAR2U_GREEN", pctVal: 5.0 }, // 2U Green
    { symbol: "BAR2D", pctVal: 30.0 }  // 2D Red
  ]

  const stratMap = {
    "BAR1": { "1D": { bar: "1", polarity: "green" } },
    "BAR2U_RED": { "1D": { bar: "2U", polarity: "red" } },
    "BAR3": { "1D": { bar: "3", polarity: "green" } },
    "BAR2U_GREEN": { "1D": { bar: "2U", polarity: "green" } },
    "BAR2D": { "1D": { bar: "2D", polarity: "red" } }
  }

  // Descending sort on "1D": 3 (BAR3) -> 2U Green (BAR2U_GREEN) -> 2U Red (BAR2U_RED) -> 2D (BAR2D) -> 1 (BAR1)
  const desc = Model.sortHoldings(holdings, "1D", false, stratMap)
  assert.deepEqual(desc.map(h => h.symbol), ["BAR3", "BAR2U_GREEN", "BAR2U_RED", "BAR2D", "BAR1"])

  // Ascending sort on "D": 1 (BAR1) -> 2D (BAR2D) -> 2U Red (BAR2U_RED) -> 2U Green (BAR2U_GREEN) -> 3 (BAR3)
  const asc = Model.sortHoldings(holdings, "D", true, stratMap)
  assert.deepEqual(asc.map(h => h.symbol), ["BAR1", "BAR2D", "BAR2U_RED", "BAR2U_GREEN", "BAR3"])
})

test("stratRuleRationales provides rationales for all 9 rules without emojis", () => {
  const rat = Model.stratRuleRationales()
  assert.equal(Object.keys(rat).length, 9)
  for (let i = 1; i <= 9; i++) {
    assert.ok(typeof rat[i] === "string" && rat[i].length > 10)
    // Verify no emojis
    assert.ok(!/[\u{1F300}-\u{1F9FF}]/u.test(rat[i]))
  }
})

test("evaluateStratChecklist evaluates 9 rules correctly and produces max 5 char badge", () => {
  const hourly = [
    { open: 340, high: 345, low: 338, close: 344 }, // 2U
    { open: 344, high: 348, low: 342, close: 346 }, // 1
    { open: 346, high: 350, low: 345, close: 349 }  // 2U Triggered
  ]
  const daily = [
    { open: 330, high: 338, low: 325, close: 335 },
    { open: 335, high: 342, low: 332, close: 340 },
    { open: 340, high: 350, low: 338, close: 349 }
  ]
  const quote = { regularMarketPrice: 349 }

  const res = Model.evaluateStratChecklist("TEST", hourly, daily, quote)
  assert.equal(res.symbol, "TEST")
  assert.equal(res.totalRules, 9)
  assert.ok(res.badgeText.length <= 5)
  assert.equal(res.rules.length, 9)
  assert.equal(typeof res.isTradeable, "boolean")
})

test("discordAlertPayload builds valid Discord embed JSON", () => {
  const chk = {
    symbol: "NVDA",
    direction: "BULLISH",
    setupTimeframe: "65m",
    triggerPrice: 125.5,
    stopPrice: 120.0,
    targetPrice: 132.0,
    targetName: "1D High"
  }
  const payloadStr = Model.discordAlertPayload(chk)
  assert.ok(payloadStr)
  const parsed = JSON.parse(payloadStr)
  assert.ok(parsed.embeds && parsed.embeds.length === 1)
  assert.match(parsed.embeds[0].title, /NVDA/)
  assert.equal(parsed.embeds[0].color, 3066993)
})

test("state persistence preserves discordWebhook setting", () => {
  const webhookUrl = "https://discord.com/api/webhooks/123/abc"
  const serialized = Model.serializeState(
    ["AAPL"],
    [],
    "1D",
    "2x2",
    {},
    [],
    {},
    {},
    "cap",
    "1W",
    true,
    webhookUrl
  )

  const parsed = Model.parseState(serialized)
  assert.equal(parsed.discordWebhook, webhookUrl)
})

test("evaluateStratChecklist locks target at inception and detects target hit exhaustion", () => {
  const hourly = [
    { timestamp: 1000, open: 100, high: 105, low: 98, close: 104 },
    { timestamp: 2000, open: 104, high: 108, low: 102, close: 106 }, // Signal bar (high=108, low=102)
    { timestamp: 3000, open: 106, high: 109, low: 105, close: 109 }  // Triggered (currentPrice=109)
  ]
  const daily = [
    { timestamp: 100, open: 90, high: 100, low: 85, close: 95 },
    { timestamp: 200, open: 95, high: 112, low: 93, close: 108 }, // 1D High = 112 (Target 1)
    { timestamp: 300, open: 100, high: 110, low: 98, close: 109 }
  ]

  // Case 1: In flight, below target 112
  const activeRes = Model.evaluateStratChecklist("TEST", hourly, daily, { regularMarketPrice: 109 })
  assert.equal(activeRes.isTradeable, true)
  assert.equal(activeRes.isTargetHit, false)
  assert.equal(activeRes.isStoppedOut, false)
  assert.equal(activeRes.targetPrice, 112)
  assert.equal(activeRes.targetName, "1D High")
  assert.equal(activeRes.signalCandleTimestamp, 2000)

  // Case 2: Target 112 hit by currentPrice=113
  const targetHitRes = Model.evaluateStratChecklist("TEST", hourly, daily, { regularMarketPrice: 113 })
  assert.equal(targetHitRes.isTargetHit, true)
  assert.equal(targetHitRes.isTradeable, false) // Exhaustion risk prevents new trade entry
  assert.equal(targetHitRes.targetPrice, 112) // Target remains locked to 1D High, not mutated

  // Case 3: Stopped out below signal low 102
  const stoppedRes = Model.evaluateStratChecklist("TEST", hourly, daily, { regularMarketPrice: 101 })
  assert.equal(stoppedRes.isStoppedOut, true)
  assert.equal(stoppedRes.isTradeable, false)
})

test("discordAlertPayload formats TARGET_HIT and STOPPED events accurately", () => {
  const chk = {
    symbol: "XLC",
    direction: "LONG",
    setupTimeframe: "60",
    triggerPrice: 111.75,
    stopPrice: 111.45,
    targetPrice: 112.00,
    targetName: "1D High"
  }

  const tgtPayload = JSON.parse(Model.discordAlertPayload(chk, "TARGET_HIT"))
  assert.match(tgtPayload.embeds[0].title, /Target Hit/)
  assert.match(tgtPayload.embeds[0].description, /Exhaustion risk/)

  const stopPayload = JSON.parse(Model.discordAlertPayload(chk, "STOPPED"))
  assert.match(stopPayload.embeds[0].title, /Invalidated/)
  assert.match(stopPayload.embeds[0].description, /Stop-Loss Breached/)
})

test("resolveDominoHtfSignal correctly resolves HTF Strat signals across multi-bar patterns", () => {
  // 1. 2D -> 2U Bullish Reversal
  const dailyReversal = [
    { open: 780, high: 785, low: 775, close: 782 },
    { open: 782, high: 777.09, low: 765, close: 768 }, // 2D (high: 777.09)
    { open: 768, high: 775, low: 767, close: 774 }      // current bar
  ]
  const dRes = Model.resolveDominoHtfSignal("Daily", true, dailyReversal)
  assert.equal(dRes.signalName, "Daily 2d-2u Bullish Reversal")
  assert.equal(dRes.scenarioTriggered, "2u")
  assert.equal(dRes.isReversal, true)

  // 2. 2U -> 2D Bearish Reversal
  const dailyBearReversal = [
    { open: 765, high: 770, low: 760, close: 768 },
    { open: 768, high: 780, low: 772, close: 778 }, // 2U (low: 772)
    { open: 778, high: 779, low: 774, close: 775 }  // current bar
  ]
  const bearRes = Model.resolveDominoHtfSignal("Daily", false, dailyBearReversal)
  assert.equal(bearRes.signalName, "Daily 2u-2d Bearish Reversal")
  assert.equal(bearRes.scenarioTriggered, "2d")
  assert.equal(bearRes.isReversal, true)

  // 3. 2D -> 1 -> 2U (2-1-2 Bullish Reversal)
  const daily212 = [
    { open: 790, high: 795, low: 780, close: 782 },
    { open: 782, high: 778, low: 765, close: 768 }, // 2D
    { open: 768, high: 775, low: 770, close: 772 }, // 1 (inside 778 - 765)
    { open: 772, high: 776, low: 771, close: 774 }  // current
  ]
  const res212 = Model.resolveDominoHtfSignal("Daily", true, daily212)
  assert.equal(res212.signalName, "Daily 2-1-2 Bullish Reversal")
  assert.equal(res212.isReversal, true)
})

test("evaluateStratChecklist detects Domino Effect when LTF 60m target is HTF Daily 2d-2u trigger", () => {
  // Setup: SPY 60m 2-1-2 Bullish setup targeting Daily High 777.09
  // Day -3: 775 - 785
  // Day -2 (p1D): 765 - 777.09 (2D)
  // Day -1 (current): 769 - 775 (forming bar)
  const daily = [
    { timestamp: 100, open: 760, high: 780, low: 770, close: 778 },
    { timestamp: 200, open: 778, high: 777.09, low: 765, close: 768 }, // 1D High = 777.09 (2D bar)
    { timestamp: 300, open: 769, high: 775, low: 768, close: 774 }
  ]

  // Hourly: 2U -> 1 -> 2U
  const hourly = [
    { timestamp: 1000, open: 768, high: 772, low: 767, close: 771 }, // 2U
    { timestamp: 2000, open: 771, high: 773.50, low: 770, close: 772 }, // 1 (Signal bar: high 773.50, low 770)
    { timestamp: 3000, open: 772, high: 775, low: 771.50, close: 774.20 } // Triggered above 773.50
  ]

  const quote = { regularMarketPrice: 774.20 }
  const res = Model.evaluateStratChecklist("SPY", hourly, daily, quote)

  assert.equal(res.symbol, "SPY")
  assert.equal(res.direction, "LONG")
  assert.equal(res.setupTimeframe, "60")
  assert.equal(res.isTradeable, true)
  assert.equal(res.triggerPrice, 773.50)
  assert.equal(res.targetPrice, 777.09)
  assert.equal(res.targetName, "1D High")

  // Verify Domino Effect detection
  assert.ok(res.domino, "Domino object must be present")
  assert.equal(res.domino.hasDomino, true)
  assert.equal(res.domino.targetPrice, 777.09)
  assert.equal(res.domino.targetName, "1D High")
  assert.equal(res.domino.triggeredTimeframe, "1D")
  assert.equal(res.domino.triggeredSignal, "Daily 2d-2u Bullish Reversal")
  assert.equal(res.domino.isReversal, true)
  assert.match(res.domino.summary, /Daily 2d-2u Bullish Reversal/)

  // Verify enriched target list
  assert.ok(res.targets.length >= 1)
  assert.equal(res.targets[0].dominoSignal, "Daily 2d-2u Bullish Reversal")

  // Verify Discord alert payload with Domino Cascade & Strat wisdom
  const payloadJson = Model.discordAlertPayload(res, "TRIGGERED")
  assert.ok(payloadJson)
  const payload = JSON.parse(payloadJson)
  assert.equal(payload.embeds.length, 1)

  const embed = payload.embeds[0]
  assert.match(embed.title, /SPY/)
  assert.match(embed.description, /Throw the first punch/)
  
  // Check field presence: Entry Trigger, Structural Stop, Domino Cascade, FTFC, Guidelines
  const fieldNames = embed.fields.map(f => f.name)
  assert.ok(fieldNames.some(name => name.includes("Entry Trigger")))
  assert.ok(fieldNames.some(name => name.includes("Structural Stop")))
  assert.ok(fieldNames.some(name => name.includes("Domino Cascade")))
  assert.ok(fieldNames.some(name => name.includes("Timeframe Continuity")))
  assert.ok(fieldNames.some(name => name.includes("Strat Execution Guidelines")))

  // Verify domino cascade field content
  const dominoField = embed.fields.find(f => f.name.includes("Domino Cascade"))
  assert.match(dominoField.value, /777\.09/)
  assert.match(dominoField.value, /Daily 2d-2u Bullish Reversal/)

  // Verify no emojis in payload
  assert.ok(!/[\u{1F300}-\u{1F9FF}]/u.test(payloadJson), "Discord payload must contain no emojis")
})

test("stratBarState and stratEntryState classify bar states, failed 2 reversals, and live quote merging", () => {
  const prev = { open: 100, high: 105, low: 95, close: 102 }

  // 1. Inside bar (1 Red)
  const curInside = { open: 101, high: 103, low: 97, close: 99 }
  const barInside = Model.stratBarState(curInside, prev, 99)
  assert.equal(barInside.scenario, "1")
  assert.equal(barInside.color, "R")
  assert.equal(barInside.failed2u, false)
  const entryInsideShort = Model.stratEntryState(barInside, false) // SHORT
  assert.equal(entryInsideShort.state, "WAIT_INSIDE")
  assert.equal(entryInsideShort.passes, false)
  assert.match(entryInsideShort.detail, /continuity but no trigger/)

  // 2. In-Force 2d Red
  const cur2d = { open: 100, high: 101, low: 93, close: 94 }
  const bar2d = Model.stratBarState(cur2d, prev, 94)
  assert.equal(bar2d.scenario, "2d")
  assert.equal(bar2d.color, "R")
  const entry2dShort = Model.stratEntryState(bar2d, false)
  assert.equal(entry2dShort.state, "IN_FORCE")
  assert.equal(entry2dShort.passes, true)

  // 3. Failed 2u Reversal (Shooter / Bearish Reversal)
  // Took out prior high 105 with high 106, but dropped below open 103 to 99 (Red)
  const curFailed2u = { open: 103, high: 106, low: 98, close: 99 }
  const barFailed2u = Model.stratBarState(curFailed2u, prev, 99)
  assert.equal(barFailed2u.scenario, "2u")
  assert.equal(barFailed2u.color, "R")
  assert.equal(barFailed2u.failed2u, true)
  assert.equal(barFailed2u.code, "F2u")
  const entryFailed2uShort = Model.stratEntryState(barFailed2u, false)
  assert.equal(entryFailed2uShort.state, "FAILED_2_REVERSAL")
  assert.equal(entryFailed2uShort.passes, true)
  assert.match(entryFailed2uShort.detail, /Failed 2u reversal/)

  // 4. Counter-trend bar (2u Green against SHORT)
  const cur2uGreen = { open: 101, high: 107, low: 100, close: 106 }
  const bar2uGreen = Model.stratBarState(cur2uGreen, prev, 106)
  assert.equal(bar2uGreen.scenario, "2u")
  assert.equal(bar2uGreen.color, "G")
  const entryCounterShort = Model.stratEntryState(bar2uGreen, false)
  assert.equal(entryCounterShort.state, "COUNTER")
  assert.equal(entryCounterShort.passes, false)

  // 5. Live quote merges into candle eliminating lag
  // Developing candle stored with high 104, but live quote price pushes to 106.50
  const curLagging = { open: 101, high: 104, low: 99, close: 103 }
  const barLive = Model.stratBarState(curLagging, prev, 106.50)
  assert.equal(barLive.high, 106.50)
  assert.equal(barLive.liveMerged, true)
  assert.equal(barLive.scenario, "2u") // Now correctly reflects 2u break without waiting for chart refresh
})

test("evaluateStratChecklist blocks 1-Red inside chop despite full bearish FTFC", () => {
  // All timeframes Red with untagged target 170
  const daily = [
    { timestamp: 100, open: 200, high: 205, low: 180, close: 195 },
    { timestamp: 200, open: 195, high: 198, low: 170, close: 188 }, // 1D Low = 170 (Target)
    { timestamp: 300, open: 190, high: 191, low: 180, close: 182 }  // Red
  ]
  // Hourly: p60 is 185-180, current c60 is 184-181 (Inside 1), open 183, price 182 (Red)
  const hourly = [
    { timestamp: 1000, open: 188, high: 189, low: 182, close: 184 },
    { timestamp: 2000, open: 184, high: 185, low: 180, close: 181 },
    { timestamp: 3000, open: 183, high: 184, low: 181, close: 182 } // Inside bar, Red
  ]
  const quote = { regularMarketPrice: 182 }

  const res = Model.evaluateStratChecklist("TSLA", hourly, daily, quote)
  assert.equal(res.direction, "SHORT")
  // Rule 1: FTFC Polarity PASSES (all are Red)
  const r1 = res.rules.find(r => r.id === 1)
  assert.equal(r1.passed, true)
  // Rule 6: Avoid 1-Chop FAILS (continuity, but no trigger)
  const r6 = res.rules.find(r => r.id === 6)
  assert.equal(r6.passed, false)
  assert.match(r6.detail, /continuity but no trigger/)
  // Overall setup is BLOCKED from execution but ARMED waiting for break
  assert.equal(res.isTradeable, false)
  assert.equal(res.isArmed, true)
  assert.equal(res.statusTag, "ARMED - 60m Inside (Wait for Break)")
  assert.equal(res.badgeText, "ARMED")
  assert.equal(res.badgeTone, "amber")
})

test("evaluateStratChecklist executes tradeable short on 60m 2d-Red in-force", () => {
  const daily = [
    { timestamp: 100, open: 200, high: 205, low: 180, close: 195 },
    { timestamp: 200, open: 195, high: 198, low: 170, close: 188 }, // 1D Low = 170 (Target)
    { timestamp: 300, open: 190, high: 191, low: 175, close: 178 }  // Red
  ]
  // Hourly: p60 is 185-180, current c60 open 181, high 181.5, low 177, close 178 (2d Red)
  const hourly = [
    { timestamp: 1000, open: 188, high: 189, low: 182, close: 184 },
    { timestamp: 2000, open: 184, high: 185, low: 180, close: 181 }, // Signal candle (low 180)
    { timestamp: 3000, open: 181, high: 181.5, low: 177, close: 178 } // Broke 180 -> 2d Red
  ]
  const quote = { regularMarketPrice: 178 }

  const res = Model.evaluateStratChecklist("TSLA", hourly, daily, quote)
  assert.equal(res.direction, "SHORT")
  assert.equal(res.isTradeable, true)
  assert.equal(res.triggerPrice, 180)
  assert.equal(res.stopPrice, 185)

  const r6 = res.rules.find(r => r.id === 6)
  assert.equal(r6.passed, true)
  assert.match(r6.detail, /in force/)
})

test("evaluateStratChecklist triggers tradeable Failed 2u Reversal with tight stop on current candle high", () => {
  const daily = [
    { timestamp: 100, open: 200, high: 205, low: 180, close: 195 },
    { timestamp: 200, open: 195, high: 198, low: 170, close: 188 },
    { timestamp: 300, open: 190, high: 191, low: 181, close: 181 } // Day low 181 (target 180 untagged)
  ]
  // Hourly: p60 is 185-180.
  // Current c60 opened at 183, pushed above 185 to 186 (2u break), but failed and dropped back to 181 (Red).
  const hourly = [
    { timestamp: 1000, open: 188, high: 189, low: 182, close: 184 },
    { timestamp: 2000, open: 184, high: 185, low: 180, close: 182 }, // p60: high 185, low 180
    { timestamp: 3000, open: 183, high: 186, low: 181, close: 181 }  // 2u Red (Failed 2u)
  ]
  const quote = { regularMarketPrice: 181 }

  const res = Model.evaluateStratChecklist("AMD", hourly, daily, quote)
  assert.equal(res.direction, "SHORT")
  assert.equal(res.isTradeable, true)
  assert.equal(res.signalName, "60m Failed 2u Bearish Reversal")
  assert.equal(res.triggerPrice, 183) // Open of rejection candle
  assert.equal(res.stopPrice, 186)    // High of failed 2u push (ultra-tight structural stop!)
  assert.equal(res.targetPrice, 180)  // T1 is prior 60m low (turning bar into Scenario 3)
  assert.equal(res.targetName, "60m Low (Outside Bar Trigger)")

  const r5 = res.rules.find(r => r.id === 5)
  assert.equal(r5.passed, true)
  const r6 = res.rules.find(r => r.id === 6)
  assert.equal(r6.passed, true)
  assert.match(r6.detail, /Failed 2u reversal/)

  // Verify Discord alert includes Failed 2 Reversal execution mechanics
  const alertStr = Model.discordAlertPayload(res, "TRIGGERED")
  const alertJson = JSON.parse(alertStr)
  assert.ok(alertJson.embeds[0].fields.some(f => f.name.includes("Failed 2 Reversal")))
  assert.ok(!/[\u{1F300}-\u{1F9FF}]/u.test(alertStr), "Must contain no emojis")
})

test("evaluateStratChecklist blocks trade when 60m is green against red HTF (profit taking / pullback)", () => {
  const daily = [
    { timestamp: 100, open: 200, high: 205, low: 180, close: 195 },
    { timestamp: 200, open: 195, high: 198, low: 170, close: 188 }, // Target 170 untagged
    { timestamp: 300, open: 190, high: 191, low: 175, close: 181 }  // Red
  ]
  // Hourly: p60 is 185-180. Current c60 opened at 180, price is 183 (Green)
  const hourly = [
    { timestamp: 1000, open: 188, high: 189, low: 182, close: 184 },
    { timestamp: 2000, open: 184, high: 185, low: 180, close: 180.5 },
    { timestamp: 3000, open: 180, high: 183.5, low: 179.5, close: 183 } // Green
  ]
  const quote = { regularMarketPrice: 183 }

  const res = Model.evaluateStratChecklist("AMD", hourly, daily, quote)
  // Direction falls back to daily SHORT, but FTFC is broken
  const r1 = res.rules.find(r => r.id === 1)
  assert.equal(r1.passed, false)
  assert.match(r1.detail, /Conflict/)

  const r6 = res.rules.find(r => r.id === 6)
  assert.equal(r6.passed, false)
  assert.match(r6.detail, /against SHORT/)

  assert.equal(res.isTradeable, false)
  assert.equal(res.isArmed, true)
  assert.equal(res.statusTag, "ARMED - Waiting on 60m Flip to Red")
  assert.equal(res.badgeText, "ARMED")
  assert.equal(res.badgeTone, "amber")
})

test("evaluateStratChecklist prioritizes Macro Consensus (Month + Week) over opposing Day and arms on pullback", () => {
  // All in Sep 2026:
  // Sep 1 (Tue): open 200, close 190 (Month Open 200)
  // Sep 7 (Mon): open 195, close 182 (Week Open 195)
  // Sep 8 (Tue): open 180, price 184 (Day Open 180 -> Day Green, but Month & Week are Red)
  const t1 = Math.floor(new Date("2026-09-01T14:30:00Z").getTime() / 1000)
  const t2 = Math.floor(new Date("2026-09-07T14:30:00Z").getTime() / 1000)
  const t3 = Math.floor(new Date("2026-09-08T14:30:00Z").getTime() / 1000)
  const daily = [
    { timestamp: t1, open: 200, high: 205, low: 188, close: 190 },
    { timestamp: t2, open: 195, high: 196, low: 180, close: 182 },
    { timestamp: t3, open: 180, high: 186, low: 181, close: 184 }
  ]
  const hourly = [
    { timestamp: 1000, open: 180, high: 182, low: 179, close: 181 },
    { timestamp: 2000, open: 181, high: 185, low: 180, close: 183 },
    { timestamp: 3000, open: 183, high: 184.5, low: 182, close: 184 }
  ]
  const quote = { regularMarketPrice: 184 }

  const res = Model.evaluateStratChecklist("AAPL", hourly, daily, quote)
  // Macro Consensus (Month=R, Week=R) overrides Day=G, locking direction to SHORT
  assert.equal(res.direction, "SHORT")
  assert.equal(res.ftfcSummary.m, "R")
  assert.equal(res.ftfcSummary.w, "R")
  assert.equal(res.ftfcSummary.d, "G")
  assert.equal(res.ftfcSummary.h60, "G")
  assert.equal(res.ftfcSummary.isFTFC, false)

  // Status reflects armed macro trend with pullback in force
  assert.equal(res.isTradeable, false)
  assert.equal(res.isArmed, true)
  assert.equal(res.statusTag, "ARMED - Macro Trend SHORT (Day/60m Pullback)")
  assert.equal(res.badgeText, "ARMED")
  assert.equal(res.badgeTone, "amber")
})

test("evaluateStratChecklist detects run exhaustion when 3+ consecutive uncorrected 2-bars occur", () => {
  const daily = [
    { timestamp: 100, open: 100, high: 110, low: 98, close: 108 },
    { timestamp: 200, open: 108, high: 140, low: 105, close: 118 }, // Target 1D High = 140
    { timestamp: 300, open: 118, high: 125, low: 115, close: 123 }
  ]
  // 3 consecutive 2u bars in hourly before current bar
  const hourly = [
    { timestamp: 1000, open: 100, high: 105, low: 98, close: 104 },
    { timestamp: 2000, open: 104, high: 110, low: 103, close: 109 }, // 2u (high 110 > 105, low 103 >= 98)
    { timestamp: 3000, open: 109, high: 115, low: 108, close: 114 }, // 2u (high 115 > 110, low 108 >= 103)
    { timestamp: 4000, open: 114, high: 120, low: 113, close: 119 }, // 2u (high 120 > 115, low 113 >= 108)
    { timestamp: 5000, open: 119, high: 125, low: 118, close: 123 }  // current bar
  ]
  const quote = { regularMarketPrice: 123 }

  const res = Model.evaluateStratChecklist("NVDA", hourly, daily, quote)
  const r4 = res.rules.find(r => r.id === 4)
  assert.equal(r4.passed, false)
  assert.match(r4.detail, /Run exhaustion: 3 consecutive 2u bars/)
  assert.equal(res.isTradeable, false)
})

test("stratHtfQuality accurately evaluates Grade A+ Macro Expansion and Grade A Failed 2 traps", () => {
  // Case 1: Short Grade A+ Macro Expansion (Weekly 2d Red + Daily 2d Red)
  const barM_bear = { scenario: "2d", color: "R", code: "2d" }
  const barW_bear = { scenario: "2d", color: "R", code: "2d" }
  const barD_bear = { scenario: "2d", color: "R", code: "2d" }
  const qShortA_plus = Model.stratHtfQuality(barM_bear, barW_bear, barD_bear, false)
  assert.equal(qShortA_plus.grade, "A+")
  assert.equal(qShortA_plus.status, "MACRO_EXPANSION")
  assert.equal(qShortA_plus.label, "Grade A+ (Macro Expansion)")
  assert.equal(qShortA_plus.isTrending, true)
  assert.equal(qShortA_plus.inForceCount, 3)

  // Case 2: Long Grade A+ Macro Expansion (Weekly 2u Green + Daily 2u Green)
  const barW_bull = { scenario: "2u", color: "G", code: "2u" }
  const barD_bull = { scenario: "2u", color: "G", code: "2u" }
  const qLongA_plus = Model.stratHtfQuality(null, barW_bull, barD_bull, true)
  assert.equal(qLongA_plus.grade, "A+")
  assert.equal(qLongA_plus.status, "MACRO_EXPANSION")
  assert.equal(qLongA_plus.isTrending, true)
  assert.equal(qLongA_plus.inForceCount, 2)

  // Case 3: Weekly Failed 2u Reversal into Short (Grade A)
  const barW_failed2u = { scenario: "2u", color: "R", code: "F2u", failed2u: true }
  const barD_1 = { scenario: "1", color: "R", code: "1" }
  const qShortFailed2 = Model.stratHtfQuality(null, barW_failed2u, barD_1, false)
  assert.equal(qShortFailed2.grade, "A")
  assert.equal(qShortFailed2.status, "FAILED_2_REVERSAL")
  assert.equal(qShortFailed2.label, "Grade A (Weekly Failed 2u Reversal)")
  assert.equal(qShortFailed2.hasHtfFailed2, true)

  // Case 4: Daily Failed 2d Reversal into Long (Grade A)
  const barW_flat = { scenario: "1", color: "G", code: "1" }
  const barD_failed2d = { scenario: "2d", color: "G", code: "F2d", failed2d: true }
  const qLongFailed2 = Model.stratHtfQuality(null, barW_flat, barD_failed2d, true)
  assert.equal(qLongFailed2.grade, "A")
  assert.equal(qLongFailed2.status, "FAILED_2_REVERSAL")
  assert.equal(qLongFailed2.label, "Grade A (Daily Failed 2d Reversal)")
  assert.equal(qLongFailed2.hasHtfFailed2, true)
})

test("stratHtfQuality detects Breakout Catalyst, Inside Compression Chop, and Opposing In-Force", () => {
  // Case 1: Weekly in-force 2d with Daily Scenario 1 Inside Coiling (Breakout Catalyst)
  const barW_2d = { scenario: "2d", color: "R", code: "2d" }
  const barD_1 = { scenario: "1", color: "R", code: "1" }
  const qCat = Model.stratHtfQuality(null, barW_2d, barD_1, false)
  assert.equal(qCat.grade, "B")
  assert.equal(qCat.status, "COMPRESSION_BREAKOUT")
  assert.equal(qCat.label, "Grade B (Daily Inside Coiling / 1W In-Force)")
  assert.equal(qCat.isTrending, true)

  // Case 2: Multi-timeframe Inside Compression Chop (Both Weekly and Daily Scenario 1)
  const barW_1 = { scenario: "1", color: "R", code: "1" }
  const qChop = Model.stratHtfQuality(null, barW_1, barD_1, false)
  assert.equal(qChop.grade, "C")
  assert.equal(qChop.status, "COMPRESSION_CHOP")
  assert.equal(qChop.label, "Grade C (HTF Inside Compression)")
  assert.equal(qChop.isTrending, false)

  // Case 3: Opposing HTF In-Force (Daily in-force 2u Green against Short trade)
  const barD_opp = { scenario: "2u", color: "G", code: "2u" }
  const qOpp = Model.stratHtfQuality(null, barW_2d, barD_opp, false)
  assert.equal(qOpp.grade, "D")
  assert.equal(qOpp.status, "OPPOSING_IN_FORCE")
  assert.equal(qOpp.label, "Grade D (Opposing HTF In-Force)")
  assert.equal(qOpp.isTrending, false)
})

test("evaluateStratChecklist enriches Rule 1 and checklist with HTF scenario verification and setup grade", () => {
  // August 2026: Prior Month low = 150 (Untagged Macro Target)
  const tM1 = Math.floor(new Date("2026-08-15T14:30:00Z").getTime() / 1000)

  // September 2026:
  // Week 1: Sep 1 (high 215, low 185) -> Prior Week low = 185
  // Week 2: Sep 7 (Day 3: high 182, low 178) -> Prior Day low = 178
  //         Sep 8 (Day 4: open 177, high 177, low 170, cur 174) -> Weekly 2d (<185) & Daily 2d (<178)
  const tW1 = Math.floor(new Date("2026-09-01T14:30:00Z").getTime() / 1000)
  const tW2_1 = Math.floor(new Date("2026-09-07T14:30:00Z").getTime() / 1000)
  const tW2_2 = Math.floor(new Date("2026-09-08T14:30:00Z").getTime() / 1000)

  const daily = [
    { timestamp: tM1, open: 220, high: 225, low: 150, close: 200 },    // Prior Month (low 150)
    { timestamp: tW1, open: 200, high: 215, low: 185, close: 190 },    // Prior Week (low 185)
    { timestamp: tW2_1, open: 182, high: 182, low: 178, close: 180 },  // Prior Day (low 178)
    { timestamp: tW2_2, open: 177, high: 177, low: 170, close: 174 }   // Current Day (Weekly 2d Red, Daily 2d Red)
  ]

  // Hourly 60m 2d-Red in-force targeting Prior Month Low 150
  // p60: high 179, low 175 (trigger 175)
  // c60: open 175, high 176, low 172, cur=174 -> 2d in-force
  const hourly = [
    { timestamp: tW2_2 - 7200, open: 180, high: 181, low: 176, close: 178 },
    { timestamp: tW2_2 - 3600, open: 178, high: 179, low: 175, close: 177 },
    { timestamp: tW2_2, open: 175, high: 176, low: 172, close: 174 }
  ]

  const quote = { regularMarketPrice: 174 }
  const res = Model.evaluateStratChecklist("TSLA", hourly, daily, quote)

  assert.equal(res.direction, "SHORT")
  assert.equal(res.bar1D.scenario, "2d")
  assert.equal(res.bar1D.color, "R")
  assert.equal(res.bar1W.scenario, "2d")
  assert.equal(res.bar1W.color, "R")

  // HTF Quality Grade is A+ (Macro Expansion: both Weekly and Daily actively in-force 2d)
  assert.equal(res.htfQuality.grade, "A+")
  assert.equal(res.htfQuality.status, "MACRO_EXPANSION")
  assert.equal(res.htfQuality.isTrending, true)

  // Target locked to Prior Month Low 150 with room to run
  assert.equal(res.targetName, "1M Low")
  assert.equal(res.targetPrice, 150)
  assert.equal(res.isTargetHit, false)

  // Rule 1 details include timeframe scenarios and setup grade
  const r1 = res.rules.find(r => r.id === 1)
  assert.equal(r1.passed, true)
  assert.match(r1.detail, /1W\(2d R\)/)
  assert.match(r1.detail, /1D\(2d R\)/)
  assert.match(r1.detail, /60m\(2d R\)/)
  assert.match(r1.detail, /Grade A\+ \(Macro Expansion\)/)

  // Status tag reflects Grade A+ tradeable
  assert.match(res.statusTag, /TRADEABLE \(Grade A\+\)/)
  assert.equal(res.isTradeable, true)
})

test("30m timeframe is supported across chartSpec, parseInterval, mergePeriodCandles, and formatCandleTime", () => {
  assert.ok(Model.chartRanges().includes("30"))
  assert.deepEqual(Model.chartSpec("30"), { range: "1mo", interval: "30m" })
  assert.equal(Model.parseInterval("30"), "30")
  assert.equal(Model.parseInterval("30m"), "30")
  assert.equal(Model.parseInterval("30min"), "30")
  assert.equal(Model.rangeCaption("30"), "30-Minute Candles (1 Month)")

  // Verify 30m mergePeriodCandles merges trailing intra-bar snapshot tick without crossing 1800s boundaries
  const baseTs = 1776864600 // 09:30 EDT
  const raw30 = [
    { timestamp: baseTs, open: 277.0, high: 278.2, low: 276.8, close: 278.0, volume: 120000 },
    { timestamp: baseTs + 1800, open: 278.0, high: 279.0, low: 277.9, close: 278.5, volume: 95000 },
    { timestamp: baseTs + 2400, open: 278.8, high: 278.8, low: 278.8, close: 278.8, volume: 0 }
  ]
  const merged = Model.mergePeriodCandles(raw30, "30")
  assert.equal(merged.length, 2)
  assert.equal(merged[1].timestamp, baseTs + 1800)
  assert.equal(merged[1].close, 278.8)
  assert.equal(merged[1].high, 279.0)

  const formatted = Model.formatCandleTime(baseTs, "30")
  assert.ok(formatted.includes(":30"))
})

test("HTF price levels cascade to LTF and anchor to the exact LTF bar that printed the HTF OHLC", () => {
  // Visibility hierarchy: HTF shows on same and LTF, but not on higher TF
  const lvl1D = { sourceTf: "1D", anchorTs: 1776864600, ohlcField: "high", price: 280.5 }
  assert.equal(Model.isLevelVisibleOnTimeframe(lvl1D, "1W"), false)
  assert.equal(Model.isLevelVisibleOnTimeframe(lvl1D, "1D"), true)
  assert.equal(Model.isLevelVisibleOnTimeframe(lvl1D, "60"), true)
  assert.equal(Model.isLevelVisibleOnTimeframe(lvl1D, "30"), true)

  const lvl60 = { sourceTf: "60", anchorTs: 1776864600, ohlcField: "low", price: 276.2 }
  assert.equal(Model.isLevelVisibleOnTimeframe(lvl60, "1D"), false)
  assert.equal(Model.isLevelVisibleOnTimeframe(lvl60, "60"), true)
  assert.equal(Model.isLevelVisibleOnTimeframe(lvl60, "30"), true)

  // 30m bars across two hours of the same session (baseTs = 09:30 EDT)
  const baseTs = 1776864600
  const candles30 = [
    { timestamp: baseTs - 86400, open: 274.0, high: 275.0, low: 273.5, close: 274.5 }, // [0] prior day
    { timestamp: baseTs, open: 277.0, high: 278.2, low: 276.8, close: 278.0 },         // [1] 09:30 (1D Open)
    { timestamp: baseTs + 1800, open: 278.0, high: 279.4, low: 276.2, close: 278.9 },  // [2] 10:00 (09:30 60m Low & High)
    { timestamp: baseTs + 3600, open: 278.9, high: 280.5, low: 278.5, close: 280.1 },  // [3] 10:30 (1D High = 280.5)
    { timestamp: baseTs + 5400, open: 280.1, high: 280.2, low: 279.0, close: 279.8 }   // [4] 11:00 (1D Close)
  ]

  // 1D High (280.5) was printed on 30m bar index 3 (10:30)
  assert.equal(Model.resolveLevelAnchorIndex(lvl1D, candles30, "30"), 3)

  // 1D Open was printed on 30m bar index 1 (09:30, first bar of session)
  assert.equal(Model.resolveLevelAnchorIndex({ sourceTf: "1D", anchorTs: baseTs, ohlcField: "open", price: 277.0 }, candles30, "30"), 1)

  // 1D Close was printed on 30m bar index 4 (11:00, last bar of session)
  assert.equal(Model.resolveLevelAnchorIndex({ sourceTf: "1D", anchorTs: baseTs, ohlcField: "close", price: 279.8 }, candles30, "30"), 4)

  // 60m bar at 09:30 (baseTs) spans [1] (09:30) and [2] (10:00); its Low (276.2) was printed on [2] (10:00)
  assert.equal(Model.resolveLevelAnchorIndex(lvl60, candles30, "30"), 2)
})

test("parseState, serializeState, parseLayouts, and saveLayout persist rearranged cell timeframes and gridMode", () => {
  const customTfs = ["30", "60", "1D", "1W", "1M"]
  const layouts = Model.saveLayout({}, "morning-strat", [
    { symbol: "IWM", workspace: 2, timeframes: customTfs, gridMode: "2+3" },
    { symbol: "SPY", workspace: 2 }
  ], 2)

  assert.deepEqual(layouts["morning-strat"].windows[0], {
    symbol: "IWM",
    workspace: 2,
    timeframes: customTfs,
    gridMode: "2+3"
  })
  assert.deepEqual(layouts["morning-strat"].windows[1], {
    symbol: "SPY",
    workspace: 2
  })

  const rawState = Model.serializeState(
    ["IWM", "SPY"],
    ["IWM"],
    "1D",
    "2+3",
    { symbol: true, timeframe: false, crosshair: true, time: true },
    ["IWM", "IWM", "IWM", "IWM", "IWM"],
    {},
    layouts,
    "equal",
    "1Y",
    false,
    "",
    customTfs
  )
  const parsed = Model.parseState(rawState)
  assert.deepEqual(parsed.gridTimeframes, customTfs)
  assert.deepEqual(parsed.layouts["morning-strat"].windows[0].timeframes, customTfs)
  assert.equal(parsed.layouts["morning-strat"].windows[0].gridMode, "2+3")
})

test("buildReplayCandles, buildReplayQuote, and stepReplayCutoff exclude cutoff bar and reconstruct HTF bars", () => {
  // Simulate IWM intraday session:
  // Prior day: 2026-04-21 (1776778200 = 13:30 UTC / 06:30 PT)
  // Current day: 2026-04-22 (1776864600 = 13:30 UTC / 06:30 PT)
  const day1Open = 1776778200
  const day2Open = 1776864600
  const t0730 = day2Open + 3600   // 07:30 PT
  const t0800 = day2Open + 5400   // 08:00 PT
  const t0830 = day2Open + 7200   // 08:30 PT (cutoff: exclude 08:30 and later, leaving 08:00 at close)
  const t0900 = day2Open + 9000   // 09:00 PT
  const t0930 = day2Open + 10800  // 09:30 PT

  const candles30 = [
    { timestamp: day1Open, open: 274.0, high: 275.5, low: 273.5, close: 275.0, volume: 1000 },
    { timestamp: day2Open, open: 276.0, high: 276.8, low: 275.8, close: 276.5, volume: 1200 }, // 06:30
    { timestamp: day2Open + 1800, open: 276.5, high: 277.0, low: 276.0, close: 276.2, volume: 1100 }, // 07:00
    { timestamp: t0730, open: 276.2, high: 277.5, low: 276.1, close: 277.4, volume: 1500 },    // 07:30
    { timestamp: t0800, open: 277.4, high: 278.2, low: 277.2, close: 278.0, volume: 1800 },    // 08:00 (last included before 08:30)
    { timestamp: t0830, open: 278.0, high: 279.6, low: 277.9, close: 279.4, volume: 2200 },    // 08:30 (excluded!)
    { timestamp: t0900, open: 279.4, high: 280.5, low: 279.1, close: 280.2, volume: 2500 },    // 09:00 (excluded!)
    { timestamp: t0930, open: 280.2, high: 281.0, low: 280.0, close: 280.8, volume: 1900 }     // 09:30 (excluded!)
  ]

  // 60m bars aligned on the hour (08:00 covers 08:00 and 08:30 30m bars)
  const candles60 = [
    { timestamp: day1Open, open: 274.0, high: 275.5, low: 273.5, close: 275.0, volume: 1000 },
    { timestamp: day2Open, open: 276.0, high: 277.0, low: 275.8, close: 276.2, volume: 2300 },
    { timestamp: t0730, open: 276.2, high: 277.5, low: 276.1, close: 277.4, volume: 1500 },
    { timestamp: t0800, open: 277.4, high: 279.6, low: 277.2, close: 279.4, volume: 4000 }, // includes 08:30 spike to 279.6
    { timestamp: t0900, open: 279.4, high: 281.0, low: 279.1, close: 280.8, volume: 4400 }
  ]

  const candles1D = [
    { timestamp: day1Open, open: 274.0, high: 275.5, low: 273.5, close: 275.0, volume: 1000 },
    { timestamp: day2Open, open: 276.0, high: 281.0, low: 275.8, close: 280.8, volume: 12200 } // full day high 281.0, close 280.8
  ]

  const candles1W = [
    { timestamp: day1Open, open: 274.0, high: 281.0, low: 273.5, close: 280.8, volume: 13200 }
  ]

  // 1. 30m replay at cutoff = t0830 excludes t0830, t0900, t0930 and leaves t0800 at close (278.0)
  const replay30 = Model.buildReplayCandles("30", candles30, candles30, candles60, candles1D, t0830)
  assert.equal(replay30.length, 5)
  assert.equal(replay30[replay30.length - 1].timestamp, t0800)
  assert.equal(replay30[replay30.length - 1].close, 278.0)

  // 2. 60m replay at cutoff = t0830 excludes t0900 and reconstructs t0800 60m bar using only the 08:00 30m bar
  const replay60 = Model.buildReplayCandles("60", candles60, candles30, candles60, candles1D, t0830)
  assert.equal(replay60.length, 4)
  assert.equal(replay60[replay60.length - 1].timestamp, t0800)
  assert.equal(replay60[replay60.length - 1].high, 278.2) // 08:30 spike to 279.6 excluded
  assert.equal(replay60[replay60.length - 1].close, 278.0)

  // 3. 1D replay at cutoff = t0830 reconstructs today's 1D bar up to 08:00 close (278.0, high 278.2)
  const replay1D = Model.buildReplayCandles("1D", candles1D, candles30, candles60, candles1D, t0830)
  assert.equal(replay1D.length, 2)
  assert.equal(replay1D[1].open, 276.0)
  assert.equal(replay1D[1].high, 278.2)
  assert.equal(replay1D[1].low, 275.8)
  assert.equal(replay1D[1].close, 278.0)

  // 4. 1W replay at cutoff = t0830 combines Day 1 completed 1D bar + Day 2 pre-08:30 30m bars
  const replay1W = Model.buildReplayCandles("1W", candles1W, candles30, candles60, candles1D, t0830)
  assert.equal(replay1W.length, 1)
  assert.equal(replay1W[0].open, 274.0)
  assert.equal(replay1W[0].high, 278.2)
  assert.equal(replay1W[0].low, 273.5)
  assert.equal(replay1W[0].close, 278.0)

  // 5. Synthetic replay quote reflects 08:00 close (278.0) and suppresses extended hours
  const liveQuote = { symbol: "IWM", price: 280.8, regularPrice: 280.8, dayHigh: 281.0, dayLow: 275.8, hasExtended: true, extendedPrice: 281.5, session: "post" }
  const replayQuote = Model.buildReplayQuote(liveQuote, candles30, candles60, candles1D, t0830)
  assert.equal(replayQuote.price, 278.0)
  assert.equal(replayQuote.regularPrice, 278.0)
  assert.equal(replayQuote.hasExtended, false)
  assert.equal(replayQuote.session, "regular")

  // 6. Stepping backward (-1) from t0830 moves cutoff to t0800; stepping forward (+1) moves to t0900
  assert.equal(Model.stepReplayCutoff(candles30, t0830, -1), t0800)
  assert.equal(Model.stepReplayCutoff(candles30, t0830, 1), t0900)
  assert.equal(Model.stepReplayCutoff(candles30, t0930, 1), 0) // stepping past last bar exits replay
})

test("parseState, serializeState, parseLayouts, and saveLayout persist per-cell zoom counts", () => {
  const customTfs = ["30", "60", "1D", "1W", "1M"]
  const customZooms = [8, 8, 16, 11, 8]
  const layouts = Model.saveLayout({}, "Main", [
    { symbol: "SPY", workspace: 2, timeframes: customTfs, zooms: customZooms, gridMode: "2+3" },
    { symbol: "QQQ", workspace: 2, timeframes: customTfs, zooms: [8, 8, 8, 8, 8], gridMode: "2+3" }
  ], 2)

  const raw = Model.serializeState(
    ["SPY", "QQQ"],
    ["SPY"],
    "1D",
    "2+3",
    { symbol: true, timeframe: false, crosshair: true, time: true },
    ["SPY", "SPY", "SPY", "SPY", "SPY"],
    {},
    layouts,
    "equal",
    "1Y",
    false,
    "",
    customTfs,
    [8, 8, 8, 8, 8]
  )
  const parsed = Model.parseState(raw)
  assert.deepEqual(parsed.gridZooms, [8, 8, 8, 8, 8])
  assert.deepEqual(parsed.layouts.Main.windows[0].zooms, [8, 8, 16, 11, 8])
  assert.deepEqual(parsed.layouts.Main.windows[1].zooms, [8, 8, 8, 8, 8])
})

test("computeStratBinaryDetails detects 1-2-2 RevStrats with T1 inside and T2 mother targets while excluding 2-2 continuations", () => {
  // Bullish 1-2d-2u RevStrat (modeled on IWM Oct 29, 2026 07:00 PT 5m Trade 4):
  // p3 (Mother): H 284.33, L 283.15
  // p2 (Inside 1): H 284.26, L 283.79
  // p1 (2d): H 284.24, L 283.64
  // cur (2u): triggers above 284.24, T1 = 284.26 (Inside), T2 = 284.33 (Mother governs mBit)
  const bullRevCandles = [
    { open: 283.30, high: 284.33, low: 283.15, close: 284.10 }, // p3 Mother
    { open: 284.10, high: 284.26, low: 283.79, close: 283.95 }, // p2 Inside (1)
    { open: 283.95, high: 284.24, low: 283.64, close: 283.80 }, // p1 2d
    { open: 283.82, high: 284.28, low: 283.80, close: 284.28 }  // cur 2u (T1 284.26 hit, T2 284.33 open)
  ]

  const bullOpen = Model.computeStratBinaryDetails(bullRevCandles)
  assert.equal(bullOpen.signalType, "1-2d-2u Bullish RevStrat")
  assert.equal(bullOpen.bits, "111111")
  assert.equal(bullOpen.color, "green")
  assert.equal(bullOpen.isBullish, true)
  assert.equal(bullOpen.t1Price, 284.26)
  assert.equal(bullOpen.targetPrice, 284.33)
  assert.match(bullOpen.tooltip, /T1 \(Inside\): \$284\.26 \(Hit\)/)
  assert.match(bullOpen.tooltip, /T2 \(Mother\): \$284\.33 \(Open\)/)

  // Once T2 Mother bar high (284.33) is reached, mBit flips to 0 (amber / exhausted)
  const bullHit = Model.computeStratBinaryDetails(bullRevCandles, { price: 284.72 })
  assert.equal(bullHit.signalType, "1-2d-2u Bullish RevStrat")
  assert.equal(bullHit.bits, "111110")
  assert.equal(bullHit.color, "amber")
  assert.match(bullHit.tooltip, /T2 \(Mother\): \$284\.33 \(Hit\)/)

  // Bearish 1-2u-2d RevStrat:
  // p3 (Mother): H 110, L 100
  // p2 (Inside 1): H 108, L 103
  // p1 (2u): H 109, L 104
  // cur (2d): triggers below 104, T1 = 103 (Inside), T2 = 100 (Mother governs mBit)
  const bearRevCandles = [
    { open: 109, high: 110, low: 100, close: 105 }, // p3 Mother
    { open: 105, high: 108, low: 103, close: 106 }, // p2 Inside (1)
    { open: 106, high: 109, low: 104, close: 108 }, // p1 2u
    { open: 107, high: 107.5, low: 102.5, close: 102.5 } // cur 2d (T1 103 hit, T2 100 open)
  ]

  const bearOpen = Model.computeStratBinaryDetails(bearRevCandles)
  assert.equal(bearOpen.signalType, "1-2u-2d Bearish RevStrat")
  assert.equal(bearOpen.bits, "001111")
  assert.equal(bearOpen.color, "red")
  assert.equal(bearOpen.isBullish, false)
  assert.equal(bearOpen.t1Price, 103)
  assert.equal(bearOpen.targetPrice, 100)
  assert.match(bearOpen.tooltip, /T1 \(Inside\): \$103\.00 \(Hit\)/)
  assert.match(bearOpen.tooltip, /T2 \(Mother\): \$100\.00 \(Open\)/)

  const bearHit = Model.computeStratBinaryDetails(bearRevCandles, { price: 99.5 })
  assert.equal(bearHit.bits, "001110")
  assert.equal(bearHit.color, "amber")
  assert.match(bearHit.tooltip, /T2 \(Mother\): \$100\.00 \(Hit\)/)

  // Plain 2d-2u (when p2 is NOT an inside bar) remains "2d-2u Bullish Reversal" targeting p2.high
  const plain22Candles = [
    { open: 105, high: 106, low: 100, close: 104 },
    { open: 104, high: 108, low: 101, close: 107 }, // p2 is 2u (not 1)
    { open: 107, high: 107.5, low: 100.5, close: 101 }, // p1 is 2d
    { open: 101.5, high: 107.8, low: 101.2, close: 107.8 } // cur is 2u
  ]
  const plain22 = Model.computeStratBinaryDetails(plain22Candles)
  assert.equal(plain22.signalType, "2d-2u Bullish Reversal")
  assert.equal(plain22.t1Price, null)
  assert.equal(plain22.targetPrice, 108)

  // 2-2 Continuations (2u-2u and 2d-2d) remain excluded (sBit = "0", signalType = null, color = "muted")
  const cont2u2u = Model.computeStratBinaryDetails([
    { open: 100, high: 104, low: 99, close: 103 },
    { open: 103, high: 106, low: 101, close: 105 }, // p1 2u
    { open: 105, high: 109, low: 104, close: 108 }  // cur 2u
  ])
  assert.equal(cont2u2u.signalType, null)
  assert.equal(cont2u2u.bits, "110000")
  assert.equal(cont2u2u.color, "muted")

  const cont2d2d = Model.computeStratBinaryDetails([
    { open: 108, high: 109, low: 104, close: 105 },
    { open: 105, high: 106, low: 101, close: 102 }, // p1 2d
    { open: 102, high: 103, low: 98, close: 99 }    // cur 2d
  ])
  assert.equal(cont2d2d.signalType, null)
  assert.equal(cont2d2d.bits, "000000")
  assert.equal(cont2d2d.color, "muted")
})

test("evaluateStratChecklist and resolveUntaggedHtfTargets scan lookback 1D/1W swing pivots and WTD/MTD extremes on gap opens", () => {
  const ts = (iso) => Math.floor(new Date(iso).getTime() / 1000)

  // Bullish gap-up scenario modeled on IWM Oct 29, 2026:
  // - Sep 2026 macro high: 296.18 (1M High)
  // - Sep 22 swing pivot high: 288.94 (left neighbor Sep 21 high 285.10 <= 288.94 -> true pivot)
  // - Sep 23 step-down cascade bar: 286.18 (left neighbor Sep 22 high 288.94 > 286.18 -> NOT a pivot, filtered out!)
  // - Oct 6 swing pivot high: 284.64 (confluent 1D Pivot + Oct 5 1W Pivot + Oct MTD High)
  // - Prior week (Oct 19-23) high: 277.70 (1W High — gapped over)
  // - Prior day (Oct 28) high: 281.48 (1D High — gapped over)
  // - Today (Oct 29) gaps open at 282.41; 07:00 PT 60m opens at 283.82 and trades at 284.34 before tagging 284.64
  const daily = [
    { timestamp: ts("2026-09-15T13:30:00Z"), open: 290.00, high: 296.18, low: 287.00, close: 292.00 },
    { timestamp: ts("2026-09-21T13:30:00Z"), open: 283.00, high: 285.10, low: 281.00, close: 284.50 },
    { timestamp: ts("2026-09-22T13:30:00Z"), open: 284.50, high: 288.94, low: 284.00, close: 287.80 },
    { timestamp: ts("2026-09-23T13:30:00Z"), open: 287.00, high: 286.18, low: 280.00, close: 281.00 },
    { timestamp: ts("2026-09-29T13:30:00Z"), open: 280.50, high: 281.50, low: 277.00, close: 279.50 },
    { timestamp: ts("2026-10-05T13:30:00Z"), open: 280.00, high: 282.50, low: 278.00, close: 282.00 },
    { timestamp: ts("2026-10-06T13:30:00Z"), open: 282.00, high: 284.64, low: 279.00, close: 280.50 },
    { timestamp: ts("2026-10-07T13:30:00Z"), open: 280.50, high: 281.20, low: 276.00, close: 277.00 },
    { timestamp: ts("2026-10-20T13:30:00Z"), open: 274.00, high: 277.70, low: 272.00, close: 276.00 },
    { timestamp: ts("2026-10-27T13:30:00Z"), open: 276.50, high: 279.80, low: 275.50, close: 279.00 },
    { timestamp: ts("2026-10-28T13:30:00Z"), open: 279.00, high: 281.48, low: 278.10, close: 281.10 },
    { timestamp: ts("2026-10-29T13:30:00Z"), open: 282.41, high: 284.36, low: 282.20, close: 284.34 }
  ]

  const hourlyAt0701 = [
    { timestamp: ts("2026-10-28T19:30:00Z"), open: 280.20, high: 281.39, low: 279.90, close: 281.10 },
    { timestamp: ts("2026-10-29T13:30:00Z"), open: 282.41, high: 284.33, low: 282.20, close: 283.80 }, // 06:30 PT 60m
    { timestamp: ts("2026-10-29T14:00:00Z"), open: 283.82, high: 284.36, low: 283.80, close: 284.34 }  // 07:00 PT 60m
  ]

  // 1. Before 284.64 is tagged: locks 284.64 ("1D/1W Pivot High"), skips gapped-over 281.48 & non-pivot 286.18
  const preHit = Model.evaluateStratChecklist(
    "IWM",
    hourlyAt0701,
    daily,
    { regularMarketPrice: 284.34, dayHigh: 284.36, dayLow: 282.20 },
    new Date("2026-10-29T14:01:00Z")
  )
  assert.equal(preHit.direction, "LONG")
  assert.equal(preHit.targetName, "1D/1W Pivot High")
  assert.equal(preHit.targetPrice, 284.64)
  assert.equal(preHit.isTargetHit, false)
  assert.equal(preHit.isTradeable, true)
  assert.deepEqual(
    preHit.targets.map(t => `${t.name}: $${t.price.toFixed(2)}`),
    [
      "1D/1W Pivot High: $284.64",
      "1D Pivot High: $288.94",
      "1M High: $296.18"
    ]
  )

  // 2. Mid-candle when price surges through 284.64 to 284.72: target stays locked on 284.64 and flips isTargetHit = true
  const midCandleHit = Model.evaluateStratChecklist(
    "IWM",
    hourlyAt0701,
    daily,
    { regularMarketPrice: 284.72, dayHigh: 284.76, dayLow: 282.20 },
    new Date("2026-10-29T14:04:00Z")
  )
  assert.equal(midCandleHit.targetName, "1D/1W Pivot High")
  assert.equal(midCandleHit.targetPrice, 284.64)
  assert.equal(midCandleHit.isTargetHit, true)
  assert.equal(midCandleHit.isTradeable, false)
  assert.match(midCandleHit.statusTag, /TARGET HIT \(1D\/1W Pivot High\)/)

  // 3. Next 60m bar after prior closed 60m bar swept 284.91: retires 284.64 and advances T1 to 288.94
  const hourlyNextBar = [
    hourlyAt0701[1],
    { timestamp: ts("2026-10-29T14:00:00Z"), open: 283.82, high: 284.91, low: 283.80, close: 284.80 },
    { timestamp: ts("2026-10-29T15:00:00Z"), open: 284.80, high: 285.10, low: 284.70, close: 285.05 }
  ]
  const dailyUpdated = daily.slice(0, -1).concat([
    { timestamp: ts("2026-10-29T13:30:00Z"), open: 282.41, high: 285.10, low: 282.20, close: 285.05 }
  ])
  const nextBarRes = Model.evaluateStratChecklist(
    "IWM",
    hourlyNextBar,
    dailyUpdated,
    { regularMarketPrice: 285.05, dayHigh: 285.10, dayLow: 282.20 },
    new Date("2026-10-29T15:05:00Z")
  )
  assert.equal(nextBarRes.targetName, "1D Pivot High")
  assert.equal(nextBarRes.targetPrice, 288.94)
  assert.equal(nextBarRes.isTargetHit, false)

  // 4. Bearish gap-down mirror via resolveUntaggedHtfTargets: resolves lookback 1D & 1D/1W Pivot Lows + WTD Low
  const bearDaily = [
    { timestamp: ts("2026-09-14T13:30:00Z"), open: 105, high: 108, low: 92.50, close: 96 }, // 1M Low 92.50
    { timestamp: ts("2026-09-28T13:30:00Z"), open: 101, high: 103, low: 99.00, close: 100 }, // Prior week neighbor (low 99.00 >= 96.25)
    { timestamp: ts("2026-10-05T13:30:00Z"), open: 104, high: 106, low: 101.00, close: 102 },
    { timestamp: ts("2026-10-06T13:30:00Z"), open: 102, high: 103, low: 96.25, close: 99 },  // 1D/1W Pivot Low 96.25
    { timestamp: ts("2026-10-20T13:30:00Z"), open: 105, high: 107, low: 102.00, close: 104 }, // Prior 1W Low 102.00 (gapped below)
    { timestamp: ts("2026-10-27T13:30:00Z"), open: 103, high: 104, low: 98.40, close: 101 },  // Current week Tue 1D Pivot / WTD Low 98.40
    { timestamp: ts("2026-10-28T13:30:00Z"), open: 101, high: 102, low: 100.20, close: 100.5 }, // Prior 1D Low 100.20 (gapped below)
    { timestamp: ts("2026-10-29T13:30:00Z"), open: 99.50, high: 99.60, low: 99.10, close: 99.20 }
  ]
  const bearWeekly = Model.mergePeriodCandles(bearDaily, "1W")
  const bearMonthly = Model.mergePeriodCandles(bearDaily, "1M")
  const bearTargets = Model.resolveUntaggedHtfTargets(false, "60", bearDaily, bearWeekly, bearMonthly, 99.50, null)
  assert.deepEqual(
    bearTargets.map(t => ({ name: t.name, price: t.price })),
    [
      { name: "1D Pivot Low", price: 98.40 },
      { name: "1D/1W Pivot Low", price: 96.25 },
      { name: "1M Low", price: 92.50 }
    ]
  )
})

test("replay step interval mapping, chartSpec, and custom timeframes", () => {
  assert.equal(Model.mapReplayStepInterval("Auto"), "")
  assert.equal(Model.mapReplayStepInterval("1m"), "1")
  assert.equal(Model.mapReplayStepInterval("5m"), "5")
  assert.equal(Model.mapReplayStepInterval("15m"), "15")
  assert.equal(Model.mapReplayStepInterval("30m"), "30")
  assert.equal(Model.mapReplayStepInterval("60m"), "60")
  assert.equal(Model.mapReplayStepInterval("1D"), "1D")

  assert.deepEqual(Model.chartSpec("1"), { range: "5d", interval: "1m" })
  assert.deepEqual(Model.chartSpec("5"), { range: "1mo", interval: "5m" })
  assert.deepEqual(Model.chartSpec("15"), { range: "1mo", interval: "15m" })

  assert.equal(Model.parseInterval("5"), "5")
  assert.equal(Model.parseInterval("5m"), "5")
  assert.equal(Model.parseInterval("15"), "15")
  assert.equal(Model.parseInterval("15m"), "15")
  assert.equal(Model.parseInterval("1min"), "1")

  const raw5m = [
    { timestamp: 1000 },
    { timestamp: 1300 },
    { timestamp: 1600 },
    { timestamp: 1900 }
  ]
  assert.equal(Model.stepReplayCutoff(raw5m, 0, -1), 1900)
  assert.equal(Model.stepReplayCutoff(raw5m, 1900, -1), 1600)
  assert.equal(Model.stepReplayCutoff(raw5m, 1600, 1), 1900)
  assert.equal(Model.stepReplayCutoff(raw5m, 1900, 1), 0)
})

test("nodeCommand wraps script execution in bash with mise and local bin PATH", () => {
  const cmd = Model.nodeCommand("/path/to/script.js", ["arg1", "arg2"])
  assert.equal(cmd[0], "bash")
  assert.equal(cmd[1], "-c")
  assert.match(cmd[2], /mise\/shims/)
  assert.match(cmd[2], /exec node "\$@"/)
  assert.equal(cmd[3], "--")
  assert.equal(cmd[4], "/path/to/script.js")
  assert.equal(cmd[5], "arg1")
  assert.equal(cmd[6], "arg2")
})

test("formatCandleTime and formatReplayBadgeTime format active intraday bar with clock time", () => {
  const ts = 1776864600 // 2026-04-22 13:30 UTC
  const formatted5m = Model.formatCandleTime(ts, "5")
  const formatted15m = Model.formatCandleTime(ts, "15")
  const formatted1m = Model.formatCandleTime(ts, "1")
  assert.match(formatted5m, /(AM|PM)/)
  assert.match(formatted15m, /(AM|PM)/)
  assert.match(formatted1m, /(AM|PM)/)

  const candles5m = [
    { timestamp: ts, open: 100, close: 101 },
    { timestamp: ts + 300, open: 101, close: 102 },
    { timestamp: ts + 600, open: 102, close: 103 }
  ]
  // Cutoff at ts + 600: active visible 5m bar is ts + 300
  const badge = Model.formatReplayBadgeTime(ts + 600, candles5m, [], [], [])
  assert.match(badge, /(AM|PM)/)
  assert.equal(badge, Model.formatCandleTime(ts + 300, "5"))
})

test("buildReplayCandles reconstructs developing 30m, 60m, and 1D bars from 5m sub-bars up to cutoff", () => {
  const dayOpen = 1776864600 // 13:30 UTC (09:30 market open)
  const bar30 = [
    { timestamp: dayOpen, open: 500, high: 510, low: 495, close: 508, volume: 6000 }
  ]
  const bar60 = [
    { timestamp: dayOpen, open: 500, high: 515, low: 495, close: 512, volume: 12000 }
  ]
  const bar1D = [
    { timestamp: dayOpen, open: 500, high: 520, low: 490, close: 518, volume: 50000 }
  ]

  // First three 5m bars of the day (09:30, 09:35, 09:40)
  const sub5m = [
    { timestamp: dayOpen, open: 500, high: 503, low: 498, close: 502, volume: 1000 },
    { timestamp: dayOpen + 300, open: 502, high: 506, low: 501, close: 505, volume: 1200 },
    { timestamp: dayOpen + 600, open: 505, high: 507, low: 503, close: 504, volume: 1100 }
  ]

  // Replay cutoff at 09:40 (dayOpen + 600) -> excludes 09:40, includes 09:30 and 09:35 bars
  const cutoff = dayOpen + 600

  // 1. 30m developing candle reflects only 09:30 and 09:35 5m bars
  const rep30 = Model.buildReplayCandles("30", bar30, [], [], [], cutoff, sub5m)
  assert.equal(rep30.length, 1)
  assert.equal(rep30[0].open, 500)
  assert.equal(rep30[0].high, 506)
  assert.equal(rep30[0].low, 498)
  assert.equal(rep30[0].close, 505)
  assert.equal(rep30[0].volume, 2200)

  // 2. 60m developing candle reflects only 09:30 and 09:35 5m bars
  const rep60 = Model.buildReplayCandles("60", bar60, [], [], [], cutoff, sub5m)
  assert.equal(rep60.length, 1)
  assert.equal(rep60[0].open, 500)
  assert.equal(rep60[0].high, 506)
  assert.equal(rep60[0].low, 498)
  assert.equal(rep60[0].close, 505)
  assert.equal(rep60[0].volume, 2200)

  // 3. 1D developing candle reflects only 09:30 and 09:35 5m bars
  const rep1D = Model.buildReplayCandles("1D", bar1D, [], [], [], cutoff, sub5m)
  assert.equal(rep1D.length, 1)
  assert.equal(rep1D[0].open, 500)
  assert.equal(rep1D[0].high, 506)
  assert.equal(rep1D[0].low, 498)
  assert.equal(rep1D[0].close, 505)
  assert.equal(rep1D[0].volume, 2200)

  // 4. Synthetic replay quote reflects latest 5m close (505)
  const repQuote = Model.buildReplayQuote({ symbol: "SMH", price: 518 }, [], [], [], cutoff, sub5m)
  assert.equal(repQuote.price, 505)
})

test("isEtfSymbol accurately classifies SPDR sectors, ETF quotes, and non-ETF assets", () => {
  assert.equal(Model.isEtfSymbol("XLC"), true)
  assert.equal(Model.isEtfSymbol("XLK"), true)
  assert.equal(Model.isEtfSymbol("SMH", { instrumentType: "ETF" }), true)
  assert.equal(Model.isEtfSymbol("QQQ", { type: "ETF" }), true)
  assert.equal(Model.isEtfSymbol("AAPL", { instrumentType: "EQUITY" }), false)
  assert.equal(Model.isEtfSymbol("BTC-USD"), false)
  assert.equal(Model.isEtfSymbol(null), false)
})

test("resolveCusipToTicker resolves customMap, ignores zero placeholders, and maps ADR titles", () => {
  assert.equal(Model.resolveCusipToTicker("000000000", "Unknown Holding"), null)
  assert.equal(Model.resolveCusipToTicker(null, "ASML Holding NV"), "ASML")
  assert.equal(Model.resolveCusipToTicker(null, "Taiwan Semiconductor Manufacturing Co Ltd"), "TSM")
  assert.equal(Model.resolveCusipToTicker(null, "NXP Semiconductors NV"), "NXPI")
  assert.equal(Model.resolveCusipToTicker(null, "ARM Holdings PLC"), "ARM")
  assert.equal(Model.resolveCusipToTicker("874039100", "Custom Co", { "874039100": "TSM" }), "TSM")
})

test("parseNportXml resolves international holdings via ISIN and custom mappings (ASML, TSM, NXPI)", () => {
  const sampleXml = `
<nportSubmission xmlns="http://www.sec.gov/edgar/nport">
  <formData>
    <genInfo>
      <repPdEnd>2026-06-30</repPdEnd>
    </genInfo>
    <invstOrSecs>
      <invstOrSec>
        <name>NVIDIA Corp</name>
        <cusip>67066G104</cusip>
        <valUSD>10000000.00</valUSD>
        <pctVal>20.0</pctVal>
        <assetCat>EC</assetCat>
      </invstOrSec>
      <invstOrSec>
        <name>ASML Holding NV</name>
        <cusip>000000000</cusip>
        <identifiers>
          <isin value="USN070592100"/>
        </identifiers>
        <valUSD>5000000.00</valUSD>
        <pctVal>10.0</pctVal>
        <assetCat>EC</assetCat>
      </invstOrSec>
      <invstOrSec>
        <name>Taiwan Semiconductor Manufacturing Co Ltd</name>
        <cusip>874039100</cusip>
        <identifiers>
          <isin value="US8740391003"/>
        </identifiers>
        <valUSD>4000000.00</valUSD>
        <pctVal>8.0</pctVal>
        <assetCat>EC</assetCat>
      </invstOrSec>
      <invstOrSec>
        <name>NXP Semiconductors NV</name>
        <cusip>000000000</cusip>
        <identifiers>
          <isin value="NL0009538784"/>
        </identifiers>
        <valUSD>1000000.00</valUSD>
        <pctVal>2.0</pctVal>
        <assetCat>EC</assetCat>
      </invstOrSec>
    </invstOrSecs>
  </formData>
</nportSubmission>`

  const parsed = Model.parseNportXml(sampleXml, "SMH")
  assert.ok(parsed)
  assert.equal(parsed.symbol, "SMH")
  assert.equal(parsed.holdings.length, 4)
  assert.equal(parsed.holdings[0].symbol, "NVDA")
  assert.equal(parsed.holdings[1].symbol, "ASML")
  assert.equal(parsed.holdings[2].symbol, "TSM")
  assert.equal(parsed.holdings[3].symbol, "NXPI")
  assert.equal(parsed.holdings[0].relativeRatio, 1.0)
  assert.equal(parsed.holdings[1].relativeRatio, 0.5)
})

test("detectStratAttack detects 2u-2u, 2u-2u-2u, 2d-2d, 2d-2d-2d and in-force vs confirmed states", () => {
  assert.equal(Model.detectStratAttack([]).attackType, "none")
  assert.equal(Model.detectStratAttack([{ open: 10, high: 12, low: 9, close: 11 }]).attackType, "none")

  // Setup candles for 2u-2u bullish attack:
  const c2 = { open: 100, high: 105, low: 95, close: 102 }
  const c1 = { open: 101, high: 110, low: 98, close: 108 }
  const c0 = { open: 109, high: 115, low: 107, close: 114 }

  const res2u = Model.detectStratAttack([c2, c1, c0])
  assert.equal(res2u.attackType, "2u-2u")
  assert.equal(res2u.direction, "bullish")
  assert.equal(res2u.consecutiveCount, 2)
  assert.equal(res2u.triggerPrice, 110)
  assert.equal(res2u.label, "2u-2u Attack")

  // Setup candles for 2u-2u-2u triple bullish attack:
  const c3 = { open: 90, high: 95, low: 88, close: 92 }
  const c2Triple = { open: 93, high: 102, low: 91, close: 100 }
  const c1Triple = { open: 101, high: 110, low: 99, close: 108 }
  const c0Triple = { open: 109, high: 116, low: 107, close: 115 }

  const resTriple = Model.detectStratAttack([c3, c2Triple, c1Triple, c0Triple])
  assert.equal(resTriple.attackType, "2u-2u-2u")
  assert.equal(resTriple.direction, "bullish")
  assert.equal(resTriple.consecutiveCount, 3)
  assert.equal(resTriple.triggerPrice, 110)

  // Setup candles for 2d-2d bearish attack:
  const c2Bear = { open: 100, high: 105, low: 95, close: 98 }
  const c1Bear = { open: 97, high: 99, low: 88, close: 90 }
  const c0Bear = { open: 89, high: 91, low: 82, close: 84 }

  const res2d = Model.detectStratAttack([c2Bear, c1Bear, c0Bear])
  assert.equal(res2d.attackType, "2d-2d")
  assert.equal(res2d.direction, "bearish")
  assert.equal(res2d.consecutiveCount, 2)
  assert.equal(res2d.triggerPrice, 88)
  assert.equal(res2d.label, "2d-2d Attack")

  // In-force detection via live quote:
  const liveQuoteInForce = { regularMarketPrice: 112 }
  const resInForce = Model.detectStratAttack([c2, c1, c0], liveQuoteInForce)
  assert.equal(resInForce.state, "in-force")

  const liveQuotePullback = { regularMarketPrice: 109.5 }
  const resPullback = Model.detectStratAttack([c2, c1, c0], liveQuotePullback)
  assert.equal(resPullback.state, "confirmed")
})

test("allAttackBasketsList returns core indices, sectors, and thematic ETFs", () => {
  const baskets = Model.allAttackBasketsList()
  assert.ok(Array.isArray(baskets))
  assert.equal(baskets.length, 25)

  const symbols = baskets.map(b => b.symbol)
  assert.ok(symbols.includes("SPY"))
  assert.ok(symbols.includes("QQQ"))
  assert.ok(symbols.includes("XLK"))
  assert.ok(symbols.includes("SMH"))
  assert.ok(symbols.includes("XBI"))
})

test("computeBasketAttackMetrics and sortAttackBaskets evaluate group attacks and laggards", () => {
  const holdings = [
    { symbol: "AAA", name: "Alpha Inc", pctVal: 40 },
    { symbol: "BBB", name: "Beta Corp", pctVal: 30 },
    { symbol: "CCC", name: "Gamma Ltd", pctVal: 20 },
    { symbol: "DDD", name: "Delta Co", pctVal: 10 }
  ]

  const c2Bull = { open: 100, high: 105, low: 95, close: 102 }
  const c1Bull = { open: 101, high: 110, low: 98, close: 108 }
  const c0Bull = { open: 109, high: 115, low: 107, close: 114 }

  const c1CCC = { open: 92, high: 100, low: 90, close: 97 }
  const c0CCC = { open: 96, high: 99, low: 95, close: 98.5 }

  const c1DDD = { open: 100, high: 105, low: 95, close: 98 }
  const c0DDD = { open: 96, high: 97, low: 88, close: 90 }

  const dailyMap = {
    "AAA": [c2Bull, c1Bull, c0Bull],
    "BBB": [c2Bull, c1Bull, c0Bull],
    "CCC": [c1CCC, c0CCC],
    "DDD": [c1DDD, c0DDD]
  }

  const liveQuotes = {
    "AAA": { regularMarketPrice: 114 },
    "BBB": { regularMarketPrice: 114 },
    "CCC": { regularMarketPrice: 98.5 },
    "DDD": { regularMarketPrice: 90 }
  }

  const metrics = Model.computeBasketAttackMetrics("MOCK", "Mock ETF", "Sector", holdings, dailyMap, liveQuotes)

  assert.equal(metrics.symbol, "MOCK")
  assert.equal(metrics.totalHoldings, 4)
  assert.equal(metrics.count2u, 2)
  assert.equal(metrics.countAttack2u, 2)
  assert.equal(metrics.pctAttack2u, 50)
  assert.equal(metrics.count2d, 1)
  assert.equal(metrics.pctAttack2d, 0)
  assert.equal(metrics.netAttackDelta, 50)
  assert.equal(metrics.attackConstituents.length, 2)
  assert.equal(metrics.attackConstituents[0].symbol, "AAA")
  assert.ok(metrics.attackConstituents[0].wtd)
  assert.ok(Array.isArray(metrics.attackConstituents[0].wtd.candles))

  assert.equal(metrics.laggards.length, 1)
  assert.equal(metrics.laggards[0].symbol, "CCC")
  assert.equal(metrics.laggards[0].direction, "bullish")
  assert.ok(metrics.laggards[0].distToTriggerPct > 0 && metrics.laggards[0].distToTriggerPct < 3.5)
  assert.ok(metrics.laggards[0].wtd)
  assert.ok(Array.isArray(metrics.laggards[0].wtd.candles))

  const b1 = { symbol: "B1", netAttackDelta: 80, pctAttack2u: 80, pctAttack2d: 0, pct2u: 90, pct2d: 10 }
  const b2 = { symbol: "B2", netAttackDelta: -50, pctAttack2u: 10, pctAttack2d: 60, pct2u: 20, pct2d: 80 }
  const sortedDesc = Model.sortAttackBaskets([b2, b1], "attack", false)
  assert.equal(sortedDesc[0].symbol, "B1")
  assert.equal(sortedDesc[1].symbol, "B2")

  const sortedAsc = Model.sortAttackBaskets([b2, b1], "attack", true)
  assert.equal(sortedAsc[0].symbol, "B2")
  assert.equal(sortedAsc[1].symbol, "B1")
})

test("extractWtdDailyCandles extracts Week-To-Date daily bars, scenarios, and week extremes", () => {
  assert.equal(Model.extractWtdDailyCandles([]).candles.length, 0)

  const cFri = { timestamp: 1792762200, open: 100, high: 102, low: 99, close: 101 }
  const cMon = { timestamp: 1793021400, open: 101, high: 105, low: 100, close: 104 }
  const cTue = { timestamp: 1793107800, open: 104, high: 110, low: 103, close: 109 }

  const resTue = Model.extractWtdDailyCandles([cFri, cMon, cTue], null, 105, "bullish")
  assert.equal(resTue.candles.length, 2, "Tuesday should have exactly 2 WTD bars (Mon, Tue)")
  assert.equal(resTue.candles[0].day, "M")
  assert.equal(resTue.candles[1].day, "T")
  assert.equal(resTue.candles[0].scenario, "2u")
  assert.equal(resTue.candles[1].scenario, "2u")
  assert.equal(resTue.candles[0].color, "G")
  assert.equal(resTue.candles[1].color, "G")
  assert.equal(resTue.weekHigh, 110)
  assert.equal(resTue.weekLow, 100)
  assert.equal(resTue.triggerPrice, 105)
  assert.equal(resTue.triggerDirection, "bullish")

  const liveQuote = { regularMarketPrice: 112 }
  const resLive = Model.extractWtdDailyCandles([cFri, cMon, cTue], liveQuote, 105, "bullish")
  assert.equal(resLive.candles[1].close, 112)
  assert.equal(resLive.candles[1].high, 112)
  assert.equal(resLive.weekHigh, 112)
})



