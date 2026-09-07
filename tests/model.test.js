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

