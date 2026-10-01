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





