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
  const ts = 1725548400 // specific unix timestamp
  const dt = new Date(ts * 1000)
  assert.ok(Model.formatCandleTime(ts, "60").includes(String(dt.getFullYear())))
  assert.ok(Model.formatCandleTime(ts, "60").includes("M")) // AM or PM
  assert.match(Model.formatCandleTime(ts, "60"), /^[A-Z][a-z]{2},\s/)
  assert.match(Model.formatCandleTime(ts, "30"), /^[A-Z][a-z]{2},\s/)
  assert.match(Model.formatCandleTime(ts, "1D"), /^[A-Z][a-z]{2},\s/)
  assert.doesNotMatch(Model.formatCandleTime(ts, "1W"), /^[A-Z][a-z]{2},\s/)
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
  assert.equal(Model.formatCandleTime(tsJan1, "1D"), "Wed, Jan 1, 2025")

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

  // Test 2u in-force even on pullback below prev high (Pure Canon: 2u triggered and is in-force)
  const res2 = Model.computeStratDetails(candles, { price: 107 })
  assert.equal(res2.bar, "2U")
  assert.equal(res2.polarity, "green") // 107 >= 105
  assert.equal(res2.inForce, "In-Force") // Pure Canon
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
  assert.equal(Object.keys(rat).length, 11)
  for (let i = 1; i <= 11; i++) {
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
  assert.equal(res.totalRules, 11)
  assert.ok(res.badgeText.length <= 5)
  assert.equal(res.rules.length, 11)
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
  assert.equal(barFailed2u.code, "2u")
  assert.equal(barFailed2u.failedCode, "F2u")
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
  // Question 3: Direction of Control PASSES (all are Red)
  const r3 = res.rules.find(r => r.id === 3)
  assert.equal(r3.passed, true)
  // Question 1: Actionable Signals FAILS (inside chop, continuity but no trigger)
  const r1 = res.rules.find(r => r.id === 1)
  assert.equal(r1.passed, false)
  assert.match(r1.detail, /continuity but no trigger/)
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

  const r1 = res.rules.find(r => r.id === 1)
  assert.equal(r1.passed, true)
  const r9 = res.rules.find(r => r.id === 9)
  assert.equal(r9.passed, true)
  assert.match(r9.detail, /In-Force/)
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

  const r9 = res.rules.find(r => r.id === 9)
  assert.equal(r9.passed, true)
  const r1 = res.rules.find(r => r.id === 1)
  assert.equal(r1.passed, true)
  assert.match(res.entryState.detail, /Failed 2u reversal/)

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
  const r3 = res.rules.find(r => r.id === 3)
  assert.equal(r3.passed, false)
  assert.match(r3.detail, /Conflict/)

  const r1 = res.rules.find(r => r.id === 1)
  assert.equal(r1.passed, false)
  assert.match(r1.detail, /against SHORT/)

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
  // Macro Consensus (Month=R, Week=R) with Day=G inside -> CONFLICT
  assert.equal(res.direction, "CONFLICT")
  assert.equal(res.ftfcSummary.m, "R")
  assert.equal(res.ftfcSummary.w, "R")
  assert.equal(res.ftfcSummary.d, "G")
  assert.equal(res.ftfcSummary.h60, "G")
  assert.equal(res.ftfcSummary.isFTFC, false)
  assert.equal(res.ftfcSummary.isConflict, true)

  // Status reflects armed macro trend with pullback in force
  assert.equal(res.isTradeable, false)
  assert.equal(res.isArmed, true)
  assert.equal(res.statusTag, "ARMED - Macro Trend SHORT (Day Inside Pullback)")
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
  const r7 = res.rules.find(r => r.id === 7)
  assert.equal(r7.passed, false)
  assert.match(r7.detail, /Run exhaustion: 3 consecutive 2u bars/)
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

  // Question 3 details include timeframe scenarios and setup grade
  const r3 = res.rules.find(r => r.id === 3)
  assert.equal(r3.passed, true)
  assert.match(r3.detail, /1W\(2d R\)/)
  assert.match(r3.detail, /1D\(2d R\)/)
  assert.match(r3.detail, /60m\(2d R\)/)
  assert.match(r3.detail, /Grade A\+ \(Macro Expansion\)/)

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

test("60m timeframe supports 1-month range and weekly Broadening Formations anchoring", () => {
  assert.ok(Model.chartRanges().includes("60"))
  assert.deepEqual(Model.chartSpec("60"), { range: "1mo", interval: "60m" })
  assert.deepEqual(Model.chartSpec("60m"), { range: "1mo", interval: "60m" })
  assert.equal(Model.rangeCaption("60"), "60-Minute Candles (1 Month)")
  assert.equal(Model.rangeCaption("60m"), "60-Minute Candles (1 Month)")

  // Weekly anchoring key on Monday
  const monBar = { timestamp: 1793021400 } // Monday 2026-10-26 13:30 UTC
  const wedBar = { timestamp: 1793194200 } // Wednesday 2026-10-28 13:30 UTC
  assert.equal(Model.candleWeekKey(monBar), "2026-10-26")
  assert.equal(Model.candleWeekKey(wedBar), "2026-10-26")
  assert.deepEqual(Model.bfWeekStarts([monBar, wedBar], 0, 2), [0])
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

test("computeBasketAttackMetrics evaluates group attacks and breakout metrics", () => {
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
  assert.equal(metrics.count1, 1)
  assert.equal(metrics.pct1, 25)
  assert.equal(metrics.count3, 0)
  assert.equal(metrics.pct3, 0)
  assert.equal(metrics.countF2u, 0)
  assert.equal(metrics.pctF2u, 0)
  assert.equal(metrics.countF2d, 0)
  assert.equal(metrics.pctF2d, 0)
  assert.equal(metrics.netAttackDelta, 50)
  assert.equal(metrics.status, "BULLISH ATTACK")
})

test("focusBasketPairs and focusPairForSymbol map focus tickers and hide non-focus tickers", () => {
  const pairs = Model.focusBasketPairs()
  assert.ok(pairs.GOOGL)
  assert.equal(pairs.GOOGL.basket, "XLC")
  assert.equal(pairs.GOOGL.peer, "META")

  assert.ok(pairs.NVDA)
  assert.equal(pairs.NVDA.basket, "SMH")
  assert.equal(pairs.NVDA.peer, "TSM")

  assert.equal(Model.focusPairForSymbol("googl").basket, "XLC")
  assert.equal(Model.focusPairForSymbol("NVDA").peer, "TSM")
  assert.equal(Model.focusPairForSymbol("SPY"), null)
  assert.equal(Model.focusPairForSymbol("QQQ"), null)
  assert.equal(Model.focusPairForSymbol(""), null)
})

test("computeFocusBasketSupport computes 3-tier sizing, Option 3C macro direction, and tokens without emojis", () => {
  // Non-focus ticker returns hidden
  const nonFocus = Model.computeFocusBasketSupport("SPY", "60", [], null, null, null, null)
  assert.equal(nonFocus.hasSupport, false)
  assert.equal(nonFocus.visible, false)

  // Mock attackScanResult with multi-timeframe focus pairs
  const mockScan = {
    focusPairs: {
      "GOOGL": {
        symbol: "GOOGL",
        basket: "XLC",
        peer: "META",
        timeframes: {
          "60": {
            basket: "XLC",
            timeframe: "60",
            status: "BULLISH ATTACK",
            pct2u: 74,
            pct2d: 18,
            pctAttack2u: 26,
            pctAttack2d: 4,
            peer: { symbol: "META", scenario: "2u", color: "G", price: 584.20, inForce: "In-Force" }
          },
          "1D": {
            basket: "XLC",
            timeframe: "1D",
            status: "BULLISH ATTACK",
            pct2u: 70,
            pct2d: 20,
            pctAttack2u: 22,
            pctAttack2d: 5,
            peer: { symbol: "META", scenario: "2u", color: "G", price: 584.20, inForce: "In-Force" }
          }
        }
      }
    }
  }

  // Case 1: GOOGL active 2u breakout aligned with XLC Bullish Attack & META 2U -> FULL SIZE (1.0x)
  const googl2uCandles = [
    { open: 170, high: 172, low: 169, close: 171 },
    { open: 171, high: 175, low: 170.5, close: 174.5 } // 2u breakout
  ]
  const resFull = Model.computeFocusBasketSupport("GOOGL", "60", googl2uCandles, null, null, null, mockScan)
  assert.equal(resFull.hasSupport, true)
  assert.equal(resFull.visible, true)
  assert.equal(resFull.attackToken, "ATK")
  assert.equal(resFull.attackColor, "green")
  assert.equal(resFull.peerToken, "META 2U")
  assert.equal(resFull.peerColor, "green")
  assert.equal(resFull.supportToken, "SUP 74%")
  assert.equal(resFull.supportColor, "green")
  assert.equal(resFull.sizingTier, "full")
  assert.equal(resFull.positionSizing, "FULL (1.0x)")
  assert.equal(resFull.sizingColor, "green")
  assert.match(resFull.sizingReason, /Strong basket support/)
  assert.doesNotMatch(resFull.attackTooltip, /[\u{1F300}-\u{1F6FF}]/u, "Zero emojis in tooltips")
  assert.doesNotMatch(resFull.positionSizing, /[\u{1F300}-\u{1F6FF}]/u, "Zero emojis in sizing")

  // Case 2: GOOGL inside bar (1) with Option 3C inheriting daily green -> assumes Long, measures pct2u
  const googlInsideCandles = [
    { open: 170, high: 175, low: 169, close: 174 },
    { open: 172, high: 173, low: 171, close: 172.5 } // 1 inside bar
  ]
  const dailyGreen = [{ open: 168, high: 176, low: 167, close: 174 }] // daily close > open (Green)
  const resInsideGreen = Model.computeFocusBasketSupport("GOOGL", "60", googlInsideCandles, null, dailyGreen, null, mockScan)
  assert.equal(resInsideGreen.direction, "bullish")
  assert.equal(resInsideGreen.supportPct, 74)
  assert.equal(resInsideGreen.supportToken, "SUP 74%")

  // Case 3: GOOGL inside bar (1) with Option 3C inheriting daily red -> assumes Short, measures pct2d
  const dailyRed = [{ open: 176, high: 177, low: 168, close: 170 }] // daily close < open (Red)
  const resInsideRed = Model.computeFocusBasketSupport("GOOGL", "60", googlInsideCandles, null, dailyRed, null, mockScan)
  assert.equal(resInsideRed.direction, "bearish")
  assert.equal(resInsideRed.supportPct, 18) // pct2d from mockScan

  // Case 4: Opposing sector pressure (XLC Bearish Attack while GOOGL is long 2u) -> STAND DOWN (0x)
  const opposingScan = {
    focusPairs: {
      "GOOGL": {
        symbol: "GOOGL",
        basket: "XLC",
        peer: "META",
        timeframes: {
          "60": {
            basket: "XLC",
            timeframe: "60",
            status: "BEARISH ATTACK",
            pct2u: 15,
            pct2d: 72,
            pctAttack2u: 2,
            pctAttack2d: 25,
            peer: { symbol: "META", scenario: "2d", color: "R", price: 570.00, inForce: "In-Force" }
          }
        }
      }
    }
  }
  const resPass = Model.computeFocusBasketSupport("GOOGL", "60", googl2uCandles, null, null, null, opposingScan)
  assert.equal(resPass.sizingTier, "pass")
  assert.equal(resPass.positionSizing, "STAND DOWN (0x)")
  assert.equal(resPass.sizingColor, "red")
  assert.match(resPass.sizingReason, /Opposing sector pressure/)
})

test("sliceCandlesBefore binary search slices correctly before cutoff", () => {
  const candles = [
    { timestamp: 100, close: 10 },
    { timestamp: 200, close: 20 },
    { timestamp: 300, close: 30 }
  ]
  assert.deepEqual(Model.sliceCandlesBefore(candles, 250), [
    { timestamp: 100, close: 10 },
    { timestamp: 200, close: 20 }
  ])
  assert.deepEqual(Model.sliceCandlesBefore(candles, 200), [
    { timestamp: 100, close: 10 }
  ])
  assert.deepEqual(Model.sliceCandlesBefore(candles, 100), [])
  assert.deepEqual(Model.sliceCandlesBefore(candles, 350), candles)
  assert.deepEqual(Model.sliceCandlesBefore([], 200), [])
})

test("computeFocusBasketSupport dynamically evaluates point-in-time replay at replayCutoffTs", () => {
  const mockScanWithCandles = {
    focusHoldings: {
      "SMH": [
        { symbol: "NVDA", name: "NVIDIA Corp" },
        { symbol: "TSM", name: "Taiwan Semiconductor" },
        { symbol: "AMD", name: "Advanced Micro Devices" }
      ]
    },
    focusCandles: {
      "30": {},
      "60": {},
      "1D": {
        "NVDA": [
          { timestamp: 100, open: 120, high: 125, low: 118, close: 122 },
          { timestamp: 200, open: 122, high: 132, low: 121, close: 130 }, // 2u (ts 200)
          { timestamp: 300, open: 130, high: 131, low: 115, close: 117 }  // 2d (ts 300)
        ],
        "TSM": [
          { timestamp: 100, open: 150, high: 155, low: 148, close: 152 },
          { timestamp: 200, open: 152, high: 162, low: 151, close: 160 }, // 2u Green
          { timestamp: 300, open: 160, high: 161, low: 140, close: 142 }  // 2d Red
        ],
        "AMD": [
          { timestamp: 100, open: 100, high: 105, low: 98, close: 102 },
          { timestamp: 200, open: 102, high: 112, low: 101, close: 110 }, // 2u Green
          { timestamp: 300, open: 110, high: 111, low: 90, close: 92 }   // 2d Red
        ]
      },
      "1W": {},
      "1M": {}
    }
  }

  // Moment 1: Replay at cutoffTs = 250 (Includes ts 100 & 200, excludes ts 300)
  // NVDA candles sliced to ts 250:
  const nvdaAt250 = [
    { timestamp: 100, open: 120, high: 125, low: 118, close: 122 },
    { timestamp: 200, open: 122, high: 132, low: 121, close: 130 }
  ]
  const resAt250 = Model.computeFocusBasketSupport("NVDA", "1D", nvdaAt250, null, null, null, mockScanWithCandles, 250)
  assert.equal(resAt250.direction, "bullish")
  assert.equal(resAt250.supportPct, 100) // All 3 constituents breaking 2u at ts 200
  assert.equal(resAt250.supportToken, "SUP 100%")
  assert.equal(resAt250.peerToken, "TSM 2U")
  assert.equal(resAt250.peerColor, "green")
  assert.equal(resAt250.sizingTier, "full")
  assert.equal(resAt250.positionSizing, "FULL (1.0x)")

  // Moment 2: Replay at cutoffTs = 350 (Includes ts 100, 200 & 300)
  // NVDA candles sliced to ts 350:
  const nvdaAt350 = [
    { timestamp: 100, open: 120, high: 125, low: 118, close: 122 },
    { timestamp: 200, open: 122, high: 132, low: 121, close: 130 },
    { timestamp: 300, open: 130, high: 131, low: 115, close: 117 }
  ]
  const resAt350 = Model.computeFocusBasketSupport("NVDA", "1D", nvdaAt350, null, null, null, mockScanWithCandles, 350)
  assert.equal(resAt350.direction, "bearish")
  assert.equal(resAt350.supportPct, 100) // All 3 constituents breaking 2d at ts 300
  assert.equal(resAt350.supportToken, "SUP 100%")
  assert.equal(resAt350.peerToken, "TSM 2D")
  assert.equal(resAt350.peerColor, "red")
  assert.equal(resAt350.sizingTier, "full")
  assert.equal(resAt350.positionSizing, "FULL (1.0x)")
})

test("mergePeriodCandles collapses Yahoo intraday live ticks preventing false inside bars on 30m and 60m", () => {
  // Scenario: 60m candle starts at 14:30 UTC. Active bar has H: 621.69, L: 610.
  // Yahoo appends live tick at 15:19 UTC with O=H=L=C=619.40.
  // Without mergePeriodCandles, tick inside active bar falsely evaluates to "1".
  const prevBar60 = { timestamp: 1793388600, open: 612.67, high: 616.36, low: 612.31, close: 614.98, volume: 2680785 }
  const activeBar60 = { timestamp: 1793629800, open: 614.44, high: 621.69, low: 610.00, close: 618.98, volume: 4360146 }
  const liveTick60 = { timestamp: 1793632753, open: 619.40, high: 619.40, low: 619.40, close: 619.40, volume: 0 }

  const rawCandles = [prevBar60, activeBar60, liveTick60]
  // Unmerged: falsely produces scenario "1"
  assert.equal(Model.stratScenario(rawCandles[2], rawCandles[1]), "1")

  // Merged: correctly produces scenario "3" (Outside bar) against prevBar60
  const merged = Model.mergePeriodCandles(rawCandles, "60")
  assert.equal(merged.length, 2)
  assert.equal(merged[1].timestamp, 1793629800)
  assert.equal(merged[1].high, 621.69)
  assert.equal(merged[1].low, 610.00)
  assert.equal(merged[1].close, 619.40)
  assert.equal(Model.stratScenario(merged[1], merged[0]), "3")
})

test("isUsMarketOpen and isAlertSessionOpen enforce RTH market session gating for equities and 24/7 for crypto", () => {
  // Wednesday 15:00 UTC in summer (11:00 AM EDT) -> Open
  const openRthDate = new Date("2026-07-15T15:00:00Z")
  assert.equal(Model.isUsMarketOpen(openRthDate, false), true)
  assert.equal(Model.isAlertSessionOpen("AAPL", null, false, openRthDate), true)

  // Wednesday 21:00 UTC in summer (5:00 PM EDT) -> Closed for RTH
  const afterHoursDate = new Date("2026-07-15T21:00:00Z")
  assert.equal(Model.isUsMarketOpen(afterHoursDate, false), false)
  assert.equal(Model.isUsMarketOpen(afterHoursDate, true), true)
  assert.equal(Model.isAlertSessionOpen("AAPL", null, false, afterHoursDate), false)

  // Saturday -> Closed
  const weekendDate = new Date("2026-07-18T15:00:00Z")
  assert.equal(Model.isUsMarketOpen(weekendDate, false), false)
  assert.equal(Model.isAlertSessionOpen("AAPL", { session: "closed" }, false, openRthDate), false)

  // Crypto is always open 24/7
  assert.equal(Model.isAlertSessionOpen("BTC-USD", { session: "closed" }, false, weekendDate), true)
})

test("evaluateStratAlertTransition blocks closed-market alerts, silently seeds initial chart-open state, and fires on live edge crossing", () => {
  const openRthDate = new Date("2026-07-15T15:00:00Z")
  const closedDate = new Date("2026-07-15T22:00:00Z")
  const openSec = Math.floor(openRthDate.getTime() / 1000)
  const baseChk = {
    symbol: "NVDA",
    direction: "BULLISH",
    setupTimeframe: "60",
    signalCandleTimestamp: openSec - 4500,
    activeCandleTimestamp: openSec - 900,
    triggerPrice: 130.00,
    stopPrice: 128.50,
    targetPrice: 132.50,
    targetName: "Prior 60m High",
    currentPrice: 130.40,
    isTradeable: true,
    isArmed: false,
    isTargetHit: false,
    isStoppedOut: false,
    status: "TRADEABLE"
  }

  // 1. Market closed -> never fires
  const closedRes = Model.evaluateStratAlertTransition(
    baseChk,
    { session: "closed", price: 130.40 },
    {},
    {},
    { nowDate: closedDate }
  )
  assert.equal(closedRes.shouldNotify, false)
  assert.equal(closedRes.reason, "MARKET_CLOSED")

  // 2. Opening chart when setup is ALREADY triggered (prevPrice is null) -> silently seeds TRIGGERED without firing!
  const openChartAlreadyTriggered = Model.evaluateStratAlertTransition(
    baseChk,
    { session: "regular", price: 130.40 },
    {},
    {},
    { nowDate: openRthDate }
  )
  assert.equal(openChartAlreadyTriggered.shouldNotify, false)
  assert.equal(openChartAlreadyTriggered.reason, "INITIAL_STATE_SEEDED")
  assert.equal(openChartAlreadyTriggered.stateUpdated, true)

  // Subsequent evaluation with seeded state also does not fire
  const secondEval = Model.evaluateStratAlertTransition(
    baseChk,
    { session: "regular", price: 130.55 },
    openChartAlreadyTriggered.nextStates,
    openChartAlreadyTriggered.nextPriceMemory,
    { nowDate: openRthDate }
  )
  assert.equal(secondEval.shouldNotify, false)

  // 3. Opening chart BEFORE trigger (price = 129.80 < 130.00), then live tick crosses to 130.10 -> FIRES!
  const preTriggerChk = Object.assign({}, baseChk, {
    currentPrice: 129.80,
    isTradeable: false,
    isArmed: true,
    status: "ARMED"
  })
  const firstTick = Model.evaluateStratAlertTransition(
    preTriggerChk,
    { session: "regular", price: 129.80 },
    {},
    {},
    { nowDate: openRthDate, enableArmedAlerts: true }
  )
  // 129.80 is within 0.35% of 130.00 -> fires ARMED proximity alert once
  assert.equal(firstTick.shouldNotify, true)
  assert.equal(firstTick.eventType, "ARMED")

  // Next tick crosses above 130.00 -> fires TRIGGERED entry alert!
  const crossTick = Model.evaluateStratAlertTransition(
    Object.assign({}, baseChk, { currentPrice: 130.10, isTradeable: true, status: "TRADEABLE" }),
    { session: "regular", price: 130.10 },
    firstTick.nextStates,
    firstTick.nextPriceMemory,
    { nowDate: openRthDate }
  )
  assert.equal(crossTick.shouldNotify, true)
  assert.equal(crossTick.eventType, "TRIGGERED")
  assert.ok(crossTick.logEntry)
})

test("evaluatePriceLevelAlerts triggers only on live crossover during open session and persists state", () => {
  const openRthDate = new Date("2026-07-15T15:00:00Z")
  const levels = [
    { price: 200.0, sourceTf: "60", anchorTs: 1752500000, text: "Breakout", tone: "up", alertEnabled: true, alertCondition: "CROSSES_ABOVE", alertTriggered: false }
  ]

  // Initial quote snapshot (prevPrice = null) does not fire
  const initRes = Model.evaluatePriceLevelAlerts("AAPL", levels, null, 200.5, { session: "regular" }, openRthDate)
  assert.equal(initRes.triggered.length, 0)

  // Live crossover from 199.80 to 200.10 fires alert and marks level alertTriggered = true
  const crossRes = Model.evaluatePriceLevelAlerts("AAPL", levels, 199.80, 200.10, { session: "regular" }, openRthDate)
  assert.equal(crossRes.triggered.length, 1)
  assert.equal(crossRes.triggered[0].direction, "ABOVE")
  assert.equal(crossRes.nextLevels[0].alertTriggered, true)

  // Subsequent tick above 200 does not re-fire once alertTriggered is true
  const repeatRes = Model.evaluatePriceLevelAlerts("AAPL", crossRes.nextLevels, 200.10, 200.40, { session: "regular" }, openRthDate)
  assert.equal(repeatRes.triggered.length, 0)

  // State serialization & parsing preserves symbolLevels, signalStates, and alertLog
  const serialized = Model.serializeState(
    ["AAPL"],
    ["AAPL"],
    "1D",
    "2x2",
    { symbol: true, timeframe: false, crosshair: true, time: true },
    ["AAPL"],
    {},
    {},
    "",
    ["60", "1D", "1W", "1M"],
    [-1, -1, -1, -1, -1],
    {
      symbolLevels: { AAPL: crossRes.nextLevels },
      signalStates: { "AAPL:60:123:BULLISH": { state: "TRIGGERED", updatedAt: Date.now() } },
      alertLog: [crossRes.triggered[0].logEntry]
    }
  )
  const parsedState = Model.parseState(serialized)
  assert.ok(parsedState.symbolLevels && Array.isArray(parsedState.symbolLevels.AAPL))
  assert.equal(parsedState.symbolLevels.AAPL[0].alertEnabled, true)
  assert.equal(parsedState.symbolLevels.AAPL[0].alertTriggered, true)
  assert.equal(parsedState.signalStates["AAPL:60:123:BULLISH"], "TRIGGERED")
  assert.equal(parsedState.alertLog.length, 1)
})

test("Update 1: evaluateStratChecklist allows 1D + 60m active in-force override over opposing 1M/1W", () => {
  const t1 = Math.floor(new Date("2026-09-01T14:30:00Z").getTime() / 1000)
  const t2 = Math.floor(new Date("2026-09-07T14:30:00Z").getTime() / 1000)
  const t3 = Math.floor(new Date("2026-09-08T14:30:00Z").getTime() / 1000)
  // Month Open = 210, Week Open = 200 (both Red at 192), but Day (t3) broke prior day high 190 -> 2u Green at 192
  const daily = [
    { timestamp: t1, open: 210, high: 212, low: 195, close: 198 },
    { timestamp: t2, open: 200, high: 190, low: 180, close: 182 }, // Prior day high = 190
    { timestamp: t3, open: 185, high: 193, low: 184, close: 192 }  // 1D 2u Green (broke 190, target 1M High 212)
  ]
  const hourly = [
    { timestamp: t3 - 7200, open: 185, high: 190.5, low: 184, close: 190 },
    { timestamp: t3 - 3600, open: 190, high: 191, low: 189, close: 190.5 }, // 60m signal high 191 (above 190)
    { timestamp: t3, open: 190.5, high: 193, low: 190, close: 192 }         // 60m 2u Green in-force toward 1W High 212
  ]
  const res = Model.evaluateStratChecklist("NVDA", hourly, daily, { regularMarketPrice: 192 })
  assert.equal(res.direction, "LONG")
  assert.equal(res.ftfcSummary.isFTFC, false)
  assert.equal(res.ftfcSummary.isOverride, true)
  const r3 = res.rules.find(r => r.id === 3)
  assert.equal(r3.passed, true)
  assert.match(r3.detail, /1D\+60m Override/)
  assert.equal(res.isTradeable, true)
})

test("Update 2: detectMotherbarProblem and Rule 6 block Compound 1 Motherbar traps until broken", () => {
  const daily = [
    { timestamp: 100, open: 195, high: 205, low: 190, close: 202 },
    { timestamp: 200, open: 202, high: 220, low: 198, close: 210 }, // 1D High = 220
    { timestamp: 300, open: 200, high: 209, low: 199, close: 207.8 }
  ]
  // Motherbar M: 200 - 210 (first 60m bar)
  // Bar 1 inside M: 202 - 208 (1)
  // Bar 2 inside M: 201 - 207 (2d relative to Bar 1, but still inside M 200-210!)
  // Current Bar 3: triggers 2d-2u above 207 at 207.8, still trapped inside M (200-210)
  const hourlyTrapped = [
    { timestamp: 1000, open: 201, high: 210, low: 200, close: 208 },
    { timestamp: 2000, open: 207, high: 208, low: 202, close: 205 },
    { timestamp: 3000, open: 205, high: 207, low: 201, close: 203 },
    { timestamp: 4000, open: 203, high: 208, low: 202.5, close: 207.8 }
  ]
  const mb = Model.detectMotherbarProblem(hourlyTrapped, true, 207, 207.8)
  assert.equal(mb.isMotherbarProblem, true)
  assert.equal(mb.motherHigh, 210)
  assert.equal(mb.motherLow, 200)
  assert.equal(mb.containedBars, 2)

  const resTrapped = Model.evaluateStratChecklist("NVDA", hourlyTrapped, daily, { regularMarketPrice: 207.8 })
  const r1 = resTrapped.rules.find(r => r.id === 1)
  assert.equal(r1.passed, false)
  assert.match(r1.detail, /Compound 1 Motherbar trap/)
  assert.equal(resTrapped.isTradeable, false)

  // Once price breaks above Motherbar high 210 -> Motherbar trap clears!
  const mbCleared = Model.detectMotherbarProblem(hourlyTrapped, true, 207, 210.5)
  assert.equal(mbCleared.isMotherbarProblem, false)
})

test("Update 3: computeBasketAttackMetrics classifies all 2u bars under Truth #1 while distinguishing green vs failed red 2u bars", () => {
  const holdings = [
    { symbol: "AAA", name: "Alpha", pctVal: 50 },
    { symbol: "BBB", name: "Beta", pctVal: 50 }
  ]
  const candlesMap = {
    // AAA: genuine Green 2u
    "AAA": [
      { open: 100, high: 105, low: 98, close: 104 },
      { open: 104, high: 108, low: 103, close: 107 }
    ],
    // BBB: Failed Red 2u (broke 105 high to 106, but closed at 101 below open 104)
    "BBB": [
      { open: 100, high: 105, low: 98, close: 104 },
      { open: 104, high: 106, low: 100, close: 101 }
    ]
  }
  const metrics = Model.computeBasketAttackMetrics("SMH", "Semis", "Sector", holdings, candlesMap, null, "60")
  assert.equal(metrics.count2u, 2) // Both AAA and BBB took out prior high -> Truth #1 Scenario 2u
  assert.equal(metrics.pct2u, 100)
  assert.equal(metrics.count2uGreen, 1)
  assert.equal(metrics.pct2uGreen, 50)
  assert.equal(metrics.countF2u, 1)
  assert.equal(metrics.pctF2u, 50)
  assert.equal(metrics.countF2d, 0)
  assert.equal(metrics.pctF2d, 0)
  assert.equal(metrics.isSimultaneousBreak, false)

  // 70% support without Attack status -> HALF (0.5x), whereas 82% (>=80% Sim Break) -> FULL (1.0x)
  const nvdaCandles = [
    { open: 200, high: 205, low: 199, close: 204 },
    { open: 204, high: 208, low: 203, close: 207 }
  ]
  const scan70 = {
    focusPairs: {
      "NVDA": {
        symbol: "NVDA", basket: "SMH", peer: "TSM",
        timeframes: {
          "60": {
            basket: "SMH", timeframe: "60", status: "DEVELOPING BUY",
            pct2u: 70, pct2d: 15, pctAttack2u: 10, pctAttack2d: 0,
            peer: { symbol: "TSM", scenario: "2u", color: "G", price: 190, inForce: "In-Force" }
          }
        }
      }
    }
  }
  const sup70 = Model.computeFocusBasketSupport("NVDA", "60", nvdaCandles, null, null, null, scan70)
  assert.equal(sup70.isSimultaneousBreak, false)
  assert.equal(sup70.sizingTier, "half")
  assert.equal(sup70.positionSizing, "HALF (0.5x)")

  scan70.focusPairs.NVDA.timeframes["60"].pct2u = 82
  const sup82 = Model.computeFocusBasketSupport("NVDA", "60", nvdaCandles, null, null, null, scan70)
  assert.equal(sup82.isSimultaneousBreak, true)
  assert.equal(sup82.sizingTier, "full")
  assert.equal(sup82.positionSizing, "FULL (1.0x)")
})

test("Update 4: evaluateStratChecklist exposes 3-tier stopLevels and caps Scenario 3 signal bar stops to entry extreme", () => {
  const daily = [
    { timestamp: 100, open: 100, high: 110, low: 95, close: 108 },
    { timestamp: 200, open: 108, high: 130, low: 105, close: 118 }, // 1D High = 130
    { timestamp: 300, open: 112, high: 120, low: 110, close: 119 }
  ]
  // Hourly: p2 is 112-115, p1 (signalCandle) is Scenario 3 Outside Bar (high 117, low 105 - very wide!),
  // c0 (entry bar) opens at 116, low 115.5, high 119, close 118.5
  const hourly32 = [
    { timestamp: 1000, open: 113, high: 115, low: 112, close: 114 },
    { timestamp: 2000, open: 114, high: 117, low: 105, close: 116 }, // Scenario 3 Outside Bar (low=105, 50%=111)
    { timestamp: 3000, open: 116, high: 119, low: 115.5, close: 118.5 } // Entry bar (low=115.5)
  ]
  const res = Model.evaluateStratChecklist("SMH", hourly32, daily, { regularMarketPrice: 118.5 })
  assert.ok(res.stopLevels)
  assert.equal(res.stopLevels.tight, 116)
  assert.equal(res.stopLevels.fiftyPct, 111)
  assert.equal(res.stopLevels.entryExtreme, 115.5)
  assert.equal(res.stopLevels.structural, 105)
  // Capped to entry bar low (115.5) instead of wide 3-bar low (105)
  assert.equal(res.stopPrice, 115.5)
  const r8 = res.rules.find(r => r.id === 8)
  assert.match(r8.detail, /3-Bar Capped/)
  assert.match(r8.detail, /Tight \(Open\): \$116\.00/)
  assert.match(r8.detail, /50%: \$111\.00/)
})

test("Update 5 & 6: detectCandleShape, expanded binary signals (3-1-2, 3-2-2, 1-3-2, 1-3), 30m setup evaluation, and takeActionWindow", () => {
  // 1. Hammer & Shooter detection
  const hammer = Model.detectCandleShape({ open: 108, high: 109, low: 100, close: 108.5 })
  assert.equal(hammer.isHammer, true)
  assert.equal(hammer.shape, "Hammer")
  const shooter = Model.detectCandleShape({ open: 101.5, high: 110, low: 100, close: 101 })
  assert.equal(shooter.isShooter, true)
  assert.equal(shooter.shape, "Shooter")



  // 3. 30m setup evaluation in evaluateStratChecklist with 30m -> 60m Domino target and takeActionWindow
  const daily = [
    { timestamp: 100, open: 500, high: 510, low: 495, close: 508 },
    { timestamp: 200, open: 508, high: 525, low: 505, close: 518 },
    { timestamp: 300, open: 510, high: 519, low: 509, close: 517 }
  ]
  const hourly = [
    { timestamp: 1000, open: 512, high: 522, low: 510, close: 515 },
    { timestamp: 2000, open: 515, high: 520, low: 513, close: 516 }, // p60 high = 520 (Inside 1)
    { timestamp: 3000, open: 516, high: 518.5, low: 515, close: 518 } // c60 Green
  ]
  const candles30m = [
    { timestamp: 2000, open: 516, high: 519.5, low: 514, close: 515 }, // p2_30: 2d
    { timestamp: 2500, open: 515, high: 517, low: 514.5, close: 516 }, // p1_30: 1 (trigger = 517)
    { timestamp: 3000, open: 516, high: 518.5, low: 515.5, close: 518 } // c30: 2u Green in-force
  ]
  const res30 = Model.evaluateStratChecklist(
    "SMH",
    hourly,
    daily,
    { regularMarketPrice: 518 },
    new Date(3100 * 1000),
    { activeTimeframe: "30", activeCandles: candles30m }
  )
  assert.equal(res30.setupTimeframe, "30")
  assert.equal(res30.signalName, "30m 2-1-2 Up")
  assert.equal(res30.tradeStyle, "RETRACEMENT")
  assert.ok(res30.takeActionWindow)
  assert.equal(res30.takeActionWindow.triggerPrice, 517)
  assert.equal(res30.takeActionWindow.patternTargetPrice, 519.5)
  assert.equal(res30.takeActionWindow.isOpen, true)
  // Targets include 30m Motherbar High (519.5) and 60m High (520)
  assert.equal(res30.targets[0].price, 519.5)
  assert.equal(res30.targets[1].name, "60m High")
  assert.equal(res30.targets[1].price, 520)
})

test("Update 7: evaluateStratChecklist Rule 9 blocks opposing sector attack and SPY/QQQ 60m Motherbar context", () => {
  const daily = [
    { timestamp: 100, open: 200, high: 205, low: 195, close: 203 },
    { timestamp: 200, open: 203, high: 215, low: 200, close: 210 },
    { timestamp: 300, open: 205, high: 209, low: 204, close: 208.5 }
  ]
  const hourly = [
    { timestamp: 1000, open: 205, high: 207, low: 204, close: 206 },
    { timestamp: 2000, open: 206, high: 208, low: 205, close: 207 },
    { timestamp: 3000, open: 207, high: 209, low: 206.5, close: 208.5 }
  ]
  const opposingScan = {
    focusPairs: {
      "NVDA": {
        symbol: "NVDA", basket: "SMH", peer: "TSM",
        timeframes: {
          "60": {
            basket: "SMH", timeframe: "60", status: "BEARISH ATTACK",
            pct2u: 10, pct2d: 80, pctAttack2u: 0, pctAttack2d: 35,
            peer: { symbol: "TSM", scenario: "2d", color: "R", price: 180, inForce: "In-Force" }
          }
        }
      }
    }
  }
  const blockedSector = Model.evaluateStratChecklist(
    "NVDA",
    hourly,
    daily,
    { regularMarketPrice: 208.5 },
    null,
    { attackScanResult: opposingScan }
  )
  const r10Sector = blockedSector.rules.find(r => r.id === 10)
  assert.equal(r10Sector.passed, false)
  assert.match(r10Sector.detail, /Blocked by opposing sector context/)
  assert.equal(blockedSector.isTradeable, false)

  const blockedMarket = Model.evaluateStratChecklist(
    "NVDA",
    hourly,
    daily,
    { regularMarketPrice: 208.5 },
    null,
    { marketContext: { indexMotherbar: true } }
  )
  const r10Market = blockedMarket.rules.find(r => r.id === 10)
  assert.equal(r10Market.passed, false)
  assert.match(r10Market.detail, /SPY\/QQQ stuck in 60m Motherbar problem/)
  assert.equal(blockedMarket.isTradeable, false)
})

test("Batch 2 Update 1: evaluateStratChecklist supports Macro + Intraday Flip negating 1D and 30-60 Gapper 1D Failed 2d override", () => {
  const t1 = Math.floor(new Date("2026-09-01T14:30:00Z").getTime() / 1000)
  const t2 = Math.floor(new Date("2026-09-07T14:30:00Z").getTime() / 1000)
  const t3 = Math.floor(new Date("2026-09-08T14:30:00Z").getTime() / 1000)

  // Case A: Macro + 60m Flip (1M=G, 1W=G, 1D opened higher at 212 and pulled back to 210 so 1D=R, then 60m flips 2u Green at 210)
  const dailyMacroFlip = [
    { timestamp: t1, open: 190, high: 205, low: 188, close: 202 },
    { timestamp: t2, open: 202, high: 220, low: 200, close: 208 }, // Prior 1D High = 220 (Target)
    { timestamp: t3, open: 212, high: 213, low: 207, close: 210 }  // 1D Red (210 < 212), but 1M(190) & 1W(202) are Green
  ]
  const hourlyFlip = [
    { timestamp: t3 - 7200, open: 212, high: 213, low: 208, close: 209 },
    { timestamp: t3 - 3600, open: 209, high: 209.5, low: 207, close: 208 }, // 2d pullback signal (high 209.5)
    { timestamp: t3, open: 208, high: 210.5, low: 207.8, close: 210 }       // 60m 2u Green flip!
  ]
  const resFlip = Model.evaluateStratChecklist("AAPL", hourlyFlip, dailyMacroFlip, { regularMarketPrice: 210 })
  assert.equal(resFlip.direction, "CONFLICT")
  assert.equal(resFlip.ftfcSummary.isConflict, true)
  assert.equal(resFlip.ftfcSummary.isFTFC, false)
  assert.equal(resFlip.ftfcSummary.isOverride, false)
  const r3Flip = resFlip.rules.find(r => r.id === 3)
  assert.equal(r3Flip.passed, false)
  assert.match(r3Flip.detail, /Conflict:.*Awaiting 1D Open Reclaim/)
  assert.equal(resFlip.isTradeable, false)
  assert.equal(resFlip.isArmed, true)
  assert.match(resFlip.statusTag, /ARMED - Macro Trend LONG \(Awaiting 1D Open Reclaim/)

  // Case B: 30-60 Gapper (1M=R, 1W=R, 1D gaps down below prior day low 180 to 176, then reclaims 1D open 177 -> 1D failed2d Green + 60m 2u Green)
  const dailyGapper = [
    { timestamp: t1, open: 210, high: 215, low: 195, close: 198 },
    { timestamp: t2, open: 200, high: 192, low: 180, close: 182 }, // Prior 1D Low = 180, High = 192
    { timestamp: t3, open: 177, high: 179.5, low: 175, close: 179 } // Broke 180 low (2d), reclaimed 177 open (Green -> failed2d!)
  ]
  const hourlyGapper = [
    { timestamp: t3 - 7200, open: 177, high: 178, low: 175, close: 176.5 },
    { timestamp: t3 - 3600, open: 176.5, high: 178.2, low: 176, close: 177.8 },
    { timestamp: t3, open: 177.8, high: 179.5, low: 177.5, close: 179 } // 60m 2u Green
  ]
  const resGapper = Model.evaluateStratChecklist("AMD", hourlyGapper, dailyGapper, { regularMarketPrice: 179 })
  assert.equal(resGapper.bar1D.failed2d, true)
  assert.equal(resGapper.direction, "LONG")
  const r3Gapper = resGapper.rules.find(r => r.id === 3)
  assert.equal(r3Gapper.passed, true)
  assert.equal(resGapper.isTradeable, true)
})

test("Batch 2 Update 2: 30m time exhaustion, 3/3 HTF In-Force exemption, resolveMeasuredMoveTarget, and Exhaustion by Price", () => {
  // 1. Measured Move target on 2-1-2 continuation into fresh highs (no untagged HTF pivot overhead)
  const dailyAllBroken = [
    { timestamp: 100, open: 100, high: 105, low: 95, close: 104 },
    { timestamp: 200, open: 104, high: 110, low: 102, close: 109 }, // p1D High = 110 (already broken!)
    { timestamp: 300, open: 110, high: 119, low: 109, close: 118 }
  ]
  // Hourly 2u -> 1 -> 2u continuation: p2 range is 110..116 (6 pts), p1 inside 112..115 (trigger=115) -> Measured Move = 115 + 6 = 121
  const hourlyMomo = [
    { timestamp: 1000, open: 105, high: 109, low: 104, close: 108 },
    { timestamp: 2000, open: 110, high: 116, low: 110, close: 115 }, // p2: 2u (range = 6)
    { timestamp: 3000, open: 114, high: 115, low: 112, close: 114.5 }, // p1: 1 (trigger = 115)
    { timestamp: 4000, open: 114.5, high: 118.5, low: 114, close: 118 } // cur: 2u
  ]
  const mm = Model.resolveMeasuredMoveTarget("60", hourlyMomo, true, 115)
  assert.ok(mm)
  assert.equal(mm.price, 121)
  assert.equal(mm.legRange, 6)

  const resMomo = Model.evaluateStratChecklist("NVDA", hourlyMomo, dailyAllBroken, { regularMarketPrice: 118 })
  assert.equal(resMomo.isExhaustionByPrice, false)
  assert.equal(resMomo.targetPrice, 121)
  assert.match(resMomo.targetName, /Measured Move/)
  assert.equal(resMomo.isTradeable, true)

  // 2. Exhaustion by Price when a reversal gaps above all prior HTF & pattern pivots with no overhead targets
  const hourlyGapExhausted = [
    { timestamp: 1000, open: 106, high: 108, low: 104, close: 105 },
    { timestamp: 2000, open: 105, high: 107, low: 102, close: 103 }, // p1: 2d (high 107)
    { timestamp: 3000, open: 115, high: 118.5, low: 114.5, close: 118 } // Gapped to 115 above p1D.high (110) and p2.high (108)!
  ]
  const resExhPrice = Model.evaluateStratChecklist("NVDA", hourlyGapExhausted, dailyAllBroken, { regularMarketPrice: 118 })
  assert.equal(resExhPrice.isExhaustionByPrice, true)
  const r7Exh = resExhPrice.rules.find(r => r.id === 7)
  const r4Exh = resExhPrice.rules.find(r => r.id === 4)
  assert.equal(r7Exh.passed, false)
  assert.match(r7Exh.detail, /Exhaustion by price/)
  assert.equal(r4Exh.passed, false)

  // 3. 30m Time Exhaustion (<5m left in 30m candle when inForceCount < 3) vs 3/3 HTF In-Force Exemption
  const dailyInside = [
    { timestamp: 100, open: 500, high: 530, low: 495, close: 520 },
    { timestamp: 200, open: 510, high: 525, low: 505, close: 518 }, // 1D Inside (inForceCount < 3)
    { timestamp: 300, open: 512, high: 519, low: 511, close: 518 }
  ]
  const candles30 = [
    { timestamp: 1200, open: 514, high: 516, low: 512, close: 515 },
    { timestamp: 1800, open: 515, high: 517, low: 514, close: 516 },
    { timestamp: 3600, open: 516, high: 518.5, low: 515.5, close: 518 }
  ]
  // At 3600 + 1600s (26m40s into 30m bar -> <5m remaining), Rule 4 fails on 30m time exhaustion
  const res30Late = Model.evaluateStratChecklist(
    "SMH",
    candles30,
    dailyInside,
    { regularMarketPrice: 518 },
    new Date((3600 + 1600) * 1000),
    { activeTimeframe: "30", activeCandles: candles30 }
  )
  const r7Late30 = res30Late.rules.find(r => r.id === 7)
  assert.equal(r7Late30.passed, false)
  assert.match(r7Late30.detail, /<5m remaining in 30m candle/)

  // When 1M, 1W, and 1D are all 3 in-force (inForceCount === 3), time exhaustion is exempted!
  const tM1 = Math.floor(new Date("2026-08-15T14:30:00Z").getTime() / 1000)
  const tM2 = Math.floor(new Date("2026-09-01T14:30:00Z").getTime() / 1000)
  const tW2_1 = Math.floor(new Date("2026-09-07T14:30:00Z").getTime() / 1000)
  const tW2_2 = Math.floor(new Date("2026-09-08T14:30:00Z").getTime() / 1000)
  const dailyAll3InForce = [
    { timestamp: tM1, open: 480, high: 500, low: 470, close: 495 },   // Aug high = 500
    { timestamp: tM2, open: 501, high: 510, low: 498, close: 508 },   // Sep W1 high = 510 (1M broke 500 -> 1M 2u G)
    { timestamp: tW2_1, open: 508, high: 515, low: 506, close: 514 }, // Sep W2 D1 high = 515 (1W broke 510 -> 1W 2u G)
    { timestamp: tW2_2, open: 514, high: 519, low: 513, close: 518 }  // Sep W2 D2 broke 515 -> 1D 2u G (all 3 HTFs in-force!)
  ]
  const res30Exempt = Model.evaluateStratChecklist(
    "SMH",
    candles30,
    dailyAll3InForce,
    { regularMarketPrice: 518 },
    new Date((3600 + 1600) * 1000),
    { activeTimeframe: "30", activeCandles: candles30 }
  )
  assert.equal(res30Exempt.htfQuality.inForceCount, 3)
  const r7Exempt = res30Exempt.rules.find(r => r.id === 7)
  assert.equal(r7Exempt.passed, true)
})

test("Batch 2 Update 3: computeFocusBasketSupport keeps intraday Most 2s in tooltip, adds 1D Most 2s, and cross-checks opposing 1D Most 2s", () => {
  const googl2uCandles = [
    { open: 170, high: 172, low: 169, close: 171 },
    { open: 171, high: 175, low: 170.5, close: 174.5 }
  ]
  const scanWithOpposing1D = {
    focusPairs: {
      "GOOGL": {
        symbol: "GOOGL",
        basket: "XLC",
        peer: "META",
        timeframes: {
          "60": {
            basket: "XLC",
            timeframe: "60",
            status: "BULLISH ATTACK",
            pct2u: 74,
            pct2d: 18,
            pctAttack2u: 26,
            pctAttack2d: 4,
            peer: { symbol: "META", scenario: "2u", color: "G", price: 584.20, inForce: "In-Force" }
          },
          "1D": {
            basket: "XLC",
            timeframe: "1D",
            status: "DEVELOPING SELL",
            pct2u: 25,
            pct2d: 65,
            pctAttack2u: 4,
            pctAttack2d: 18,
            peer: { symbol: "META", scenario: "2d", color: "R", price: 584.20, inForce: "In-Force" }
          }
        }
      }
    }
  }
  const res = Model.computeFocusBasketSupport("GOOGL", "60", googl2uCandles, null, null, null, scanWithOpposing1D)
  // Tooltip keeps intraday 60m Most 2s AND appends 1D Most 2s
  assert.match(res.supportTooltip, /Basket Support: 74% of XLC holdings are currently breaking 2U on 60/)
  assert.match(res.supportTooltip, /1D Most 2s: 25% 2U vs 65% 2D/)
  assert.ok(res.dailyMost2s)
  assert.equal(res.dailyMost2s.pct2u, 25)
  assert.equal(res.dailyMost2s.pct2d, 65)
  // Sizing capped from FULL to HALF because 1D Most 2s is 65% opposing (2D)
  assert.equal(res.sizingTier, "half")
  assert.equal(res.positionSizing, "HALF (0.5x)")
  assert.match(res.sizingReason, /1D Most 2s opposing/)
})

test("Batch 2 Update 4: detectCandleShape identifies Doji vs Engulfing 3-bars and Rule 2 blocks 3-2 continuation off Doji 3", () => {
  const prev = { open: 102, high: 105, low: 100, close: 104 }
  const doji3 = Model.detectCandleShape({ open: 102.2, high: 108, low: 97, close: 102.8 }, prev)
  assert.equal(doji3.isDoji, true)
  assert.equal(doji3.shape, "Doji")

  const engulfing3 = Model.detectCandleShape({ open: 98, high: 108, low: 97, close: 107.2 }, prev)
  assert.equal(engulfing3.isEngulfing, true)
  assert.equal(engulfing3.shape, "Engulfing")

  // In evaluateStratChecklist, a 3-2 continuation off a Doji 3 bar fails Rule 2
  const daily = [
    { timestamp: 100, open: 95, high: 105, low: 92, close: 103 },
    { timestamp: 200, open: 103, high: 120, low: 101, close: 112 },
    { timestamp: 300, open: 105, high: 111, low: 104, close: 110 }
  ]
  const hourlyDoji32 = [
    { timestamp: 1000, open: 102, high: 105, low: 100, close: 104 },
    { timestamp: 2000, open: 102.2, high: 108, low: 97, close: 102.8 }, // Doji 3 signal bar
    { timestamp: 3000, open: 107, high: 110.5, low: 106.5, close: 110 }
  ]
  const resDoji = Model.evaluateStratChecklist("SPY", hourlyDoji32, daily, { regularMarketPrice: 110 })
  const r1Doji = resDoji.rules.find(r => r.id === 1)
  assert.equal(r1Doji.passed, false)
  assert.match(r1Doji.detail, /Doji 3 indecision bar/)
})

test("Batch 2 Update 5: I-O-I (1-3-1-2), Pivot Machine Gun (PMG), and Kicker pattern detection", () => {
  // 1. 1-3-1-2u I-O-I in evaluateStratChecklist
  const ioiCandles = [
    { timestamp: 1000, open: 100, high: 110, low: 90, close: 105 },  // p4: Mother
    { timestamp: 2000, open: 102, high: 106, low: 95, close: 104 },  // p3: 1 (inside p4)
    { timestamp: 3000, open: 104, high: 109, low: 92, close: 96 },   // p2: 3 (outside p3)
    { timestamp: 4000, open: 97, high: 103, low: 95, close: 102 },   // p1: 1 (inside p2, trigger=103)
    { timestamp: 5000, open: 102, high: 105, low: 101, close: 104.5 } // cur: 2u breakout
  ]

  const daily = [
    { timestamp: 100, open: 95, high: 105, low: 90, close: 102 },
    { timestamp: 200, open: 102, high: 115, low: 100, close: 110 },
    { timestamp: 300, open: 100, high: 106, low: 99, close: 104.5 }
  ]
  const chkIoi = Model.evaluateStratChecklist("QQQ", ioiCandles, daily, { regularMarketPrice: 104.5 })
  assert.equal(chkIoi.signalName, "60m 1-3-1-2 I-O-I Up")

  // 2. Pivot Machine Gun (PMG): 5 consecutive lower highs followed by bullish reversal
  const pmgCandles = [
    { timestamp: 1000, open: 111, high: 112, low: 108, close: 109 },
    { timestamp: 2000, open: 109, high: 110, low: 106, close: 107 },
    { timestamp: 3000, open: 107, high: 108, low: 104, close: 105 },
    { timestamp: 4000, open: 105, high: 106, low: 102, close: 103 },
    { timestamp: 5000, open: 103, high: 104, low: 100, close: 101 }, // 5th lower high (104)
    { timestamp: 6000, open: 101.5, high: 105.5, low: 101, close: 105 } // Reversal above 104!
  ]
  const pmg = Model.detectPivotMachineGun(pmgCandles, true)
  assert.equal(pmg.isPMG, true)
  assert.equal(pmg.count, 5)
  assert.equal(pmg.topTarget, 112)

  // 3. Kicker Pattern: strong bearish bar closing near low, followed by gap-up above p1.high
  const kickerCandles = [
    { timestamp: 1000, open: 108, high: 109, low: 103, close: 106 },
    { timestamp: 2000, open: 106, high: 106.5, low: 100, close: 100.5 }, // Strong red bar closing near low
    { timestamp: 3000, open: 107, high: 110, low: 106.8, close: 109.5 }  // Full gap above 106.5!
  ]
  const kicker = Model.detectKickerPattern(kickerCandles, 109.5)
  assert.equal(kicker.isKicker, true)
  assert.equal(kicker.direction, "LONG")
  assert.equal(kicker.gapType, "FULL")
})

test("Batch 2 Update 6 & 7: Broadening Formation target integration and 30m isArmed / alert freshness", () => {
  // 1. Broadening formation target integration in evaluateStratChecklist
  const baseMon = 1793021400 // Monday
  const bfHourly = [
    { timestamp: baseMon, open: 100, high: 104, low: 99, close: 103 },
    { timestamp: baseMon + 3600, open: 103, high: 102, low: 97, close: 98 },      // Lower low (97)
    { timestamp: baseMon + 7200, open: 98, high: 106, low: 98, close: 105 },      // Higher high (106)
    { timestamp: baseMon + 10800, open: 105, high: 104, low: 95, close: 96 },     // Lower low (95)
    { timestamp: baseMon + 14400, open: 96, high: 100, low: 96, close: 99 },      // Inside/pullback (high 100)
    { timestamp: baseMon + 18000, open: 99, high: 102, low: 98.5, close: 101.5 }  // 2u trigger above 100 toward BF Upper Ray
  ]
  const daily = [
    { timestamp: baseMon - 172800, open: 95, high: 105, low: 92, close: 102 },
    { timestamp: baseMon - 86400, open: 102, high: 115, low: 98, close: 110 },
    { timestamp: baseMon, open: 98, high: 106, low: 95, close: 101.5 }
  ]
  const resBf = Model.evaluateStratChecklist("IWM", bfHourly, daily, { regularMarketPrice: 101.5 })
  assert.ok(resBf.broadeningTarget)
  assert.equal(resBf.broadeningTarget.kind, "bf")
  assert.ok(resBf.targets.some(t => t.kind === "bf"))

  // 2. 30m isArmed statusTag and activeCandleTimestamp + 1800s alert freshness gate
  const candles30Inside = [
    { timestamp: baseMon, open: 100, high: 105, low: 98, close: 104 },
    { timestamp: baseMon + 1800, open: 104, high: 106, low: 101, close: 105 },
    { timestamp: baseMon + 3600, open: 103, high: 105, low: 102, close: 104.5 } // 30m Inside bar (Green)
  ]
  const res30Armed = Model.evaluateStratChecklist(
    "IWM",
    bfHourly,
    daily,
    { regularMarketPrice: 104.5 },
    new Date((baseMon + 3900) * 1000),
    { activeTimeframe: "30", activeCandles: candles30Inside }
  )
  assert.equal(res30Armed.setupTimeframe, "30")
  assert.equal(res30Armed.activeCandleTimestamp, baseMon + 3600)
  assert.equal(res30Armed.isArmed, true)
  assert.equal(res30Armed.statusTag, "ARMED - 30m Inside (Wait for Break)")

  // Alert transition blocks stale 30m bar when nowSec - activeCandleTimestamp >= 1800s
  const openRthDate = new Date("2026-07-15T15:00:00Z")
  const openSec = Math.floor(openRthDate.getTime() / 1000)
  const stale30Chk = {
    symbol: "IWM",
    direction: "LONG",
    setupTimeframe: "30",
    signalCandleTimestamp: openSec - 3600,
    activeCandleTimestamp: openSec - 1800, // 1800s old -> stale 30m bar!
    triggerPrice: 105,
    stopPrice: 101,
    targetPrice: 110,
    targetName: "1D High",
    currentPrice: 105.5,
    isTradeable: true,
    isArmed: false,
    isTargetHit: false,
    isStoppedOut: false
  }
  const staleAlert = Model.evaluateStratAlertTransition(
    stale30Chk,
    { session: "regular", price: 105.5 },
    {},
    {},
    { nowDate: openRthDate, allowInitialTrigger: true }
  )
  assert.equal(staleAlert.shouldNotify, false)
  assert.equal(staleAlert.reason, "MARKET_CLOSED")
})







test("nextUsMarketOpenMs returns the next 09:30 ET weekday open, DST-aware", () => {
  // Fri 2026-11-06 10:46 MST (17:46 UTC), market open -> Mon 2026-11-09 09:30 EST (14:30 UTC)
  assert.equal(Model.nextUsMarketOpenMs(new Date("2026-11-06T17:46:00Z")), Date.UTC(2026, 10, 9, 14, 30))
  // Tue 2026-07-14 06:00 ET (10:00 UTC, pre-open) -> same day 09:30 EDT (13:30 UTC)
  assert.equal(Model.nextUsMarketOpenMs(new Date("2026-07-14T10:00:00Z")), Date.UTC(2026, 6, 14, 13, 30))
  // Exactly at the open -> next session
  assert.equal(Model.nextUsMarketOpenMs(new Date(Date.UTC(2026, 6, 14, 13, 30))), Date.UTC(2026, 6, 15, 13, 30))
  // Sat 2026-03-07 (before DST) -> Mon 2026-03-09 09:30 EDT (DST starts Sun Mar 8)
  assert.equal(Model.nextUsMarketOpenMs(new Date("2026-03-07T15:00:00Z")), Date.UTC(2026, 2, 9, 13, 30))
})

test("alert mute state: live, timed, indefinite, expiry", () => {
  const now = new Date("2026-11-06T17:46:00Z")
  assert.equal(Model.isAlertsMuted(0, now), false)
  assert.equal(Model.isAlertsMuted(undefined, now), false)
  assert.equal(Model.isAlertsMuted("garbage", now), false)
  assert.equal(Model.isAlertsMuted(-1, now), true)
  assert.equal(Model.isAlertsMuted(now.getTime() + 1000, now), true)
  assert.equal(Model.isAlertsMuted(now.getTime() - 1000, now), false)

  assert.equal(Model.alertsMuteUntilForMode("open", now), Date.UTC(2026, 10, 9, 14, 30))
  assert.equal(Model.alertsMuteUntilForMode("1h", now), now.getTime() + 3600000)
  assert.equal(Model.alertsMuteUntilForMode("indefinite", now), Model.ALERT_MUTE_INDEFINITE)
  assert.equal(Model.alertsMuteUntilForMode("", now), 0)

  assert.equal(Model.alertsMuteStatusText(0, now), "")
  assert.equal(Model.alertsMuteStatusText(-1, now), "Alerts muted until you unmute")
  assert.match(Model.alertsMuteStatusText(now.getTime() + 3600000, now), /^Alerts muted until \d{1,2}:\d{2} (AM|PM)$/)
})

test("alert mute persists through serializeState/parseState and drops once expired", () => {
  const future = Date.now() + 3600000
  const raw = Model.serializeState(["SPY"], ["SPY"], "1D", "2x2", {}, [], {}, {}, "", ["60"], [-1], { alertsMutedUntil: future })
  assert.equal(Model.parseState(raw).alertsMutedUntil, future)

  const rawIndef = Model.serializeState(["SPY"], ["SPY"], "1D", "2x2", {}, [], {}, {}, "", ["60"], [-1], { alertsMutedUntil: -1 })
  assert.equal(Model.parseState(rawIndef).alertsMutedUntil, -1)

  const rawExpired = Model.serializeState(["SPY"], ["SPY"], "1D", "2x2", {}, [], {}, {}, "", ["60"], [-1], { alertsMutedUntil: Date.now() - 1000 })
  assert.equal(JSON.parse(rawExpired).alertsMutedUntil, undefined)
})

test("alert log keeps the muted flag", () => {
  const log = Model.appendAlertLog([], { id: "a", symbol: "SPY", timestamp: 1, muted: true }, 50)
  assert.equal(log[0].muted, true)
  const log2 = Model.appendAlertLog(log, { id: "b", symbol: "QQQ", timestamp: 2 }, 50)
  assert.equal(log2[0].muted, false)
  assert.equal(log2[1].muted, true)
})

test("sector analysis: sector definitions, query parsing, scenario matching, and sorting", () => {
  // 1. Sector Definitions & Ticker Parsing
  const smh = Model.getSectorInfo("SMH")
  assert.equal(smh.symbol, "SMH")
  assert.equal(smh.name, "VanEck Semiconductor ETF")
  const xlc = Model.getSectorInfo("xlc")
  assert.equal(xlc.symbol, "XLC")
  assert.equal(Model.getSectorInfo("XYZ"), null)

  assert.deepEqual(Model.parseSectorTickers("SMH"), ["SMH"])
  assert.deepEqual(Model.parseSectorTickers("SMH,XLC,DIA"), ["SMH", "XLC", "DIA"])
  assert.deepEqual(Model.parseSectorTickers("smh, xlc, dia"), ["SMH", "XLC", "DIA"])
  assert.deepEqual(Model.parseSectorTickers("SMH, XLC, SMH, DIA"), ["SMH", "XLC", "DIA"])
  assert.deepEqual(Model.parseSectorTickers("SMH, , XLC,"), ["SMH", "XLC"])
  assert.deepEqual(Model.parseSectorTickers(""), [])
  assert.deepEqual(Model.parseSectorTickers(null), [])

  // 2. Query Parsing
  assert.deepEqual(Model.parseScenarioQuery("1, hammer, 2dg"), [["1"], ["hammer"], ["2dg"]])
  assert.deepEqual(Model.parseScenarioQuery("2u if, 3"), [["2u", "if"], ["3"]])
  assert.deepEqual(Model.parseScenarioQuery(""), [])
  assert.deepEqual(Model.parseScenarioQuery("   "), [])

  // 3. Scenario Matching
  const prevBar = { open: 100, high: 110, low: 90, close: 105 }
  const insideBar = [{ open: 98, high: 108, low: 92, close: 102 }, prevBar, { open: 100, high: 105, low: 95, close: 102 }]
  // insideBar: last candle is high 105 < 110, low 95 > 90 -> 1 inside bar
  assert.equal(Model.matchesScenarioQuery(insideBar, null, "1"), true)
  assert.equal(Model.matchesScenarioQuery(insideBar, null, "2u"), false)
  assert.equal(Model.matchesScenarioQuery(insideBar, null, "1, hammer, 2dg"), true)

  // 2u in force
  const twoUBar = [prevBar, { open: 105, high: 115, low: 95, close: 112 }]
  assert.equal(Model.matchesScenarioQuery(twoUBar, null, "2u"), true)
  assert.equal(Model.matchesScenarioQuery(twoUBar, null, "2u if"), true)
  assert.equal(Model.matchesScenarioQuery(twoUBar, null, "2d"), false)

  // 2d Green (hammer-type / rejection)
  const twoDgBar = [prevBar, { open: 88, high: 108, low: 85, close: 95 }]
  assert.equal(Model.matchesScenarioQuery(twoDgBar, null, "2dg"), true)
  assert.equal(Model.matchesScenarioQuery(twoDgBar, null, "2dr"), false)

  // 4. Sorting
  const holdings = [
    { symbol: "AMD", pctVal: 5.6, valUSD: 4000, price: 150 },
    { symbol: "NVDA", pctVal: 17.5, valUSD: 13000, price: 140 },
    { symbol: "TSM", pctVal: 9.3, valUSD: 7000, price: 190 }
  ]
  const byWeightDesc = Model.sortSectorHoldings(holdings, "weight", "desc")
  assert.equal(byWeightDesc[0].symbol, "NVDA")
  assert.equal(byWeightDesc[1].symbol, "TSM")
  assert.equal(byWeightDesc[2].symbol, "AMD")

  const byWeightAsc = Model.sortSectorHoldings(holdings, "weight", "asc")
  assert.equal(byWeightAsc[0].symbol, "AMD")
  assert.equal(byWeightAsc[2].symbol, "NVDA")

  const quotes = {
    "NVDA": { regularMarketPrice: 140 },
    "TSM": { regularMarketPrice: 190 },
    "AMD": { regularMarketPrice: 150 }
  }
  const byPriceDesc = Model.sortSectorHoldings(holdings, "price", "desc", quotes)
  assert.equal(byPriceDesc[0].symbol, "TSM")
  assert.equal(byPriceDesc[1].symbol, "AMD")
  assert.equal(byPriceDesc[2].symbol, "NVDA")
})

test("Contradiction 2: Scenario 3 outside bars classified as broadening chop, halting trend and override", () => {
  // 1. stratEntryState: Live developing Scenario 3 returns passes: false
  const prevBar = { open: 100, high: 105, low: 95, close: 102 }
  const curOutside = { open: 101, high: 108, low: 92, close: 106 } // Took both high (108 > 105) and low (92 < 95)
  const bar3 = Model.stratBarState(curOutside, prevBar, 106)
  assert.equal(bar3.scenario, "3")
  const entry3 = Model.stratEntryState(bar3, true)
  assert.equal(entry3.state, "OUTSIDE")
  assert.equal(entry3.passes, false)
  assert.equal(entry3.name, "Outside - Wait")
  assert.match(entry3.detail, /outside bar; both sides taken/)

  // 2. stratHtfQuality: Daily Outside halts trend when Weekly is 2u in-force (Option A)
  const barW_2u = { scenario: "2u", color: "G", code: "2u" }
  const barD_3 = { scenario: "3", color: "G", code: "3" }
  const qDailyOutside = Model.stratHtfQuality(null, barW_2u, barD_3, true)
  assert.equal(qDailyOutside.grade, "C")
  assert.equal(qDailyOutside.status, "OUTSIDE_EXPANSION")
  assert.equal(qDailyOutside.label, "Grade C (Daily Broadening Formation Chop)")
  assert.equal(qDailyOutside.isTrending, false)

  // 3. stratHtfQuality: Higher timeframe priority when both Weekly and Daily are Scenario 3
  const barW_3 = { scenario: "3", color: "R", code: "3" }
  const qBothOutside = Model.stratHtfQuality(null, barW_3, barD_3, false)
  assert.equal(qBothOutside.grade, "C")
  assert.equal(qBothOutside.status, "OUTSIDE_EXPANSION")
  assert.equal(qBothOutside.label, "Grade C (Weekly Broadening Formation Chop)")
  assert.equal(qBothOutside.isTrending, false)

  // 4. stratHtfQuality: Monthly Scenario 3 takes highest priority when single TF outside
  const barM_3 = { scenario: "3", color: "G", code: "3" }
  const barD_1 = { scenario: "1", color: "G", code: "1" }
  const qMonthOutside = Model.stratHtfQuality(barM_3, barW_2u, barD_1, true)
  assert.equal(qMonthOutside.grade, "C")
  assert.equal(qMonthOutside.status, "OUTSIDE_EXPANSION")
  assert.equal(qMonthOutside.label, "Grade C (Monthly Broadening Formation Chop)")
  assert.equal(qMonthOutside.isTrending, false)

  // 5. stratHtfQuality: Option A - Weekly + Daily both in-force 2s retain Grade A+ Macro Expansion over Monthly 3
  const barD_2u = { scenario: "2u", color: "G", code: "2u" }
  const qMacroOverMonth3 = Model.stratHtfQuality(barM_3, barW_2u, barD_2u, true)
  assert.equal(qMacroOverMonth3.grade, "A+")
  assert.equal(qMacroOverMonth3.status, "MACRO_EXPANSION")
  assert.equal(qMacroOverMonth3.isTrending, true)

  // 6. evaluateStratChecklist: Scenario 3 on 1D does not trigger active trend override over opposing HTF
  const t1 = Math.floor(new Date("2026-09-01T14:30:00Z").getTime() / 1000)
  const t2 = Math.floor(new Date("2026-09-07T14:30:00Z").getTime() / 1000)
  const t3 = Math.floor(new Date("2026-09-08T14:30:00Z").getTime() / 1000)
  // Month Red at 192 (open 210), Week Red at 192 (open 200). Day 3 is Scenario 3 Green (high 195 > 190, low 175 < 180)
  const dailyChop = [
    { timestamp: t1, open: 210, high: 212, low: 195, close: 198 },
    { timestamp: t2, open: 200, high: 190, low: 180, close: 182 }, // Prior day range: 180 - 190
    { timestamp: t3, open: 178, high: 195, low: 175, close: 192 }  // 1D Scenario 3 Green (took both 190 and 175)
  ]
  const hourly = [
    { timestamp: t3 - 7200, open: 185, high: 190.5, low: 184, close: 190 },
    { timestamp: t3 - 3600, open: 190, high: 191, low: 189, close: 190.5 },
    { timestamp: t3, open: 190.5, high: 193, low: 190, close: 192 }
  ]
  const resChop = Model.evaluateStratChecklist("NVDA", hourly, dailyChop, { regularMarketPrice: 192 })
  // Should NOT trigger LONG override; Month and Week are Red, Day 3 is outside expansion chop -> CONFLICT
  assert.equal(resChop.direction, "CONFLICT")
  assert.equal(resChop.ftfcSummary.isOverride, false)
  assert.equal(resChop.ftfcSummary.isConflict, true)

  // 7. evaluateStratChecklist: Live developing 1-3 RevStrat recognizes pattern in Rule 2 but gates in Rule 6
  // Setup TF: p60 is Scenario 1 inside bar (range 189 - 191). c60 takes both sides (187 and 193) -> Scenario 3 live
  const dailyBull = [
    { timestamp: t1, open: 195, high: 212, low: 195, close: 205 },
    { timestamp: t2, open: 190, high: 205, low: 185, close: 200 },
    { timestamp: t3, open: 185, high: 202, low: 184, close: 192 }
  ]
  const hourly13 = [
    { timestamp: t3 - 7200, open: 185, high: 194, low: 184, close: 190 },          // p2_60
    { timestamp: t3 - 3600, open: 189.5, high: 191, low: 189, close: 190 },       // p60 (Scenario 1 inside bar)
    { timestamp: t3, open: 190, high: 193, low: 187, close: 192 }                  // c60 (Scenario 3 developing)
  ]
  const res13 = Model.evaluateStratChecklist("NVDA", hourly13, dailyBull, { regularMarketPrice: 192 })
  assert.match(res13.signalName, /1-3 RevStrat/)
  const r1 = res13.rules.find(r => r.id === 1)
  assert.equal(r1.passed, false) // Gated by Question 1 entryState.passes === false (Behavior 1)
  assert.match(r1.detail, /outside bar; both sides taken/)
  assert.equal(res13.isTradeable, false)

  // 8. Question 10 appends caution for HTF broadening formation
  const r10 = resChop.rules.find(r => r.id === 10)
  if (r10.passed) {
    assert.match(r10.detail, /Caution: HTF broadening formation \/ outside bar/)
  }
})

test("shared model helpers: cacheKey, isBasketSector, chunkSymbols, and updateDevelopingCandle with ET rollover", () => {
  // 1. cacheKey
  assert.equal(Model.cacheKey("aapl", "1D"), "AAPL_1D")
  assert.equal(Model.cacheKey("smh ", "60"), "SMH_60")
  assert.equal(Model.cacheKey("nvda"), "NVDA_1D")

  // 2. isBasketSector
  assert.equal(Model.isBasketSector("SMH"), true)
  assert.equal(Model.isBasketSector("smh"), true)
  assert.equal(Model.isBasketSector("XLC"), true)
  assert.equal(Model.isBasketSector("SPY"), false)
  assert.equal(Model.isBasketSector("XLK"), false)

  // 3. chunkSymbols
  const symbols = ["S1", "S2", "S3", "S4", "S5"]
  assert.deepEqual(Model.chunkSymbols(symbols, 2), [["S1", "S2"], ["S3", "S4"], ["S5"]])
  assert.deepEqual(Model.chunkSymbols(symbols, 10), [["S1", "S2", "S3", "S4", "S5"]])

  // 4. updateDevelopingCandle (same day update)
  const baseCandles = [
    { timestamp: 1731335400, open: 100, high: 105, low: 99, close: 102 } // e.g. 2024-11-11
  ]
  const quoteSame = { regularMarketPrice: 107, regularMarketDayHigh: 108, regularMarketDayLow: 98 }
  const updated = Model.updateDevelopingCandle(baseCandles, quoteSame, "1D", new Date(1731335400 * 1000 + 3600 * 1000))
  assert.equal(updated.length, 1)
  assert.equal(updated[0].close, 107)
  assert.equal(updated[0].high, 108)
  assert.equal(updated[0].low, 98)

  // 5. updateDevelopingCandle (next day rollover ET: Option A)
  // 24 hours later (next ET market day)
  const nextDayDate = new Date(1731335400 * 1000 + 86400 * 1000)
  const quoteNextDay = { regularMarketPrice: 110, regularMarketDayHigh: 112, regularMarketDayLow: 109 }
  const rolled = Model.updateDevelopingCandle(updated, quoteNextDay, "1D", nextDayDate)
  assert.equal(rolled.length, 2)
  // Yesterday's bar frozen
  assert.equal(rolled[0].close, 107)
  assert.equal(rolled[0].high, 108)
  // Today's new developing bar
  assert.equal(rolled[1].open, 110)
  assert.equal(rolled[1].close, 110)
  assert.equal(rolled[1].high, 112)
  assert.equal(rolled[1].low, 109)
})

test("Contradiction 5: Canonical 33% Hammer/Shooter detection, DRY scanner, and entry bar +/- $0.01 stop placement", () => {
  // 1. Canonical Hammer Detection (top 33% of range, upper wick <= 10%)
  const validHammer = Model.detectCandleShape({ open: 108, high: 109, low: 100, close: 108.8 })
  assert.equal(validHammer.isHammer, true)
  assert.equal(validHammer.shape, "Hammer")

  // Invalid: body in middle 50% of range (not top 33%)
  const midCandle = Model.detectCandleShape({ open: 104, high: 109, low: 100, close: 105 })
  assert.equal(midCandle.isHammer, false)

  // Invalid: body in top 33% but upper wick is too large (> 10% of range, e.g. 16.7%)
  const bigHeadCandle = Model.detectCandleShape({ open: 106.5, high: 109, low: 100, close: 107.5 })
  assert.equal(bigHeadCandle.isHammer, false)

  // 2. Canonical Shooter Detection (bottom 33% of range, lower wick <= 10%)
  const validShooter = Model.detectCandleShape({ open: 101.5, high: 110, low: 100, close: 100.8 })
  assert.equal(validShooter.isShooter, true)
  assert.equal(validShooter.shape, "Shooter")

  // Invalid: lower wick too large (> 10%)
  const bigTailShooter = Model.detectCandleShape({ open: 102.5, high: 110, low: 100, close: 101.8 })
  assert.equal(bigTailShooter.isShooter, false)

  // 3. DRY Scanner matchesScenarioTokens uses canonical detectCandleShape
  const candlesHammer = [
    { open: 105, high: 107, low: 104, close: 106 },
    { open: 108, high: 109, low: 100, close: 108.8 } // Hammer
  ]
  assert.equal(Model.matchesScenarioTokens(candlesHammer, null, ["hammer"]), true)
  assert.equal(Model.matchesScenarioTokens(candlesHammer, null, ["shooter"]), false)

  // 4. evaluateStratChecklist: Hammer stop placed on entry low - $0.01, NOT hammer wick
  const dailyBull = [
    { timestamp: 100, open: 100, high: 110, low: 95, close: 108 },
    { timestamp: 200, open: 108, high: 130, low: 105, close: 125 },
    { timestamp: 300, open: 125, high: 135, low: 120, close: 132 }
  ]
  // Hourly: p2 is 116-122, p1 is 2d Hammer (high 120, low 105, open 118, close 119.5 - wick down to 105!),
  // c0 is Entry bar (open 119, low 118.20, high 123, close 122)
  const hourlyHammer = [
    { timestamp: 1000, open: 116, high: 122, low: 115, close: 121 },
    { timestamp: 2000, open: 118, high: 120, low: 105, close: 119.5 }, // 2d Hammer (range 15, low 105, top33 = 115, body 118-119.5, upper wick 0.5 = 3.3%)
    { timestamp: 3000, open: 119, high: 123, low: 118.20, close: 122 } // Entry bar: low is 118.20
  ]
  const hammerRes = Model.evaluateStratChecklist("AAPL", hourlyHammer, dailyBull, { regularMarketPrice: 122 })
  assert.ok(hammerRes.stopLevels)
  assert.equal(hammerRes.stopLevels.structural, 105) // Hammer wick recorded as structural reference
  assert.equal(hammerRes.stopLevels.entryExtreme, 118.20)
  // Stop price is entry low - $0.01 = 118.19 (NEVER under the hammer wick of 105!)
  assert.equal(hammerRes.stopPrice, 118.19)
  const r8Hammer = hammerRes.rules.find(r => r.id === 8)
  assert.match(r8Hammer.detail, /Entry Low - \$0\.01 \(Hammer Stop\)/)

  // 5. evaluateStratChecklist: Shooter stop placed on entry high + $0.01, NOT shooter wick
  const dailyBear = [
    { timestamp: 100, open: 130, high: 135, low: 120, close: 122 },
    { timestamp: 200, open: 122, high: 125, low: 100, close: 105 },
    { timestamp: 300, open: 105, high: 110, low: 90, close: 95 }
  ]
  // Hourly: p2 is 108-110, p1 is 2u Shooter (high 125, low 106, open 108, close 107 - wick up to 125!),
  // c0 is Entry bar (open 107.5, high 108.50, low 102, close 103)
  const hourlyShooter = [
    { timestamp: 1000, open: 108, high: 110, low: 105, close: 106 },
    { timestamp: 2000, open: 108, high: 125, low: 106, close: 107 }, // 2u Shooter (range 19, low 106, bot33 = 112.33, body 107-108, lower wick 1 = 5.2%)
    { timestamp: 3000, open: 107.5, high: 108.50, low: 102, close: 103 } // Entry bar: high is 108.50
  ]
  const shooterRes = Model.evaluateStratChecklist("TSLA", hourlyShooter, dailyBear, { regularMarketPrice: 103 })
  assert.ok(shooterRes.stopLevels)
  assert.equal(shooterRes.stopLevels.structural, 125) // Shooter wick recorded as structural reference
  assert.equal(shooterRes.stopLevels.entryExtreme, 108.50)
  // Stop price is entry high + $0.01 = 108.51 (NEVER above the shooter wick of 125!)
  assert.equal(shooterRes.stopPrice, 108.51)
  const r8Shooter = shooterRes.rules.find(r => r.id === 8)
  assert.match(r8Shooter.detail, /Entry High \+ \$0\.01 \(Shooter Stop\)/)
})

test("Contradiction 9: Eliminates refuted Risk/Reward ratio in favor of canonical Magnitude (Room %) and Defense", () => {
  // 1. Question 4 (Magnitude & Targets) alignment: no 'Risk-to-Reward' or 'R:R'
  const rationales = Model.stratRuleRationales()
  assert.ok(!rationales[4].includes("Risk-to-Reward"))
  assert.ok(!rationales[4].includes("1:2"))
  assert.match(rationales[4], /open room\/magnitude/i)

  // 2. evaluateStratChecklist produces Room with positive 2-decimal percentage and no R:R
  const daily = [
    { timestamp: 100, open: 100, high: 110, low: 95, close: 105 },
    { timestamp: 200, open: 105, high: 120, low: 102, close: 115 },
    { timestamp: 300, open: 115, high: 118, low: 112, close: 116 }
  ]
  const hourly = [
    { timestamp: 1000, open: 112, high: 114, low: 110, close: 113 },
    { timestamp: 2000, open: 113, high: 114, low: 112, close: 113 }, // Inside bar
    { timestamp: 3000, open: 113.5, high: 115, low: 113, close: 114.5 } // 2u trigger
  ]
  const quote = { regularMarketPrice: 114.5 }
  const res = Model.evaluateStratChecklist("AAPL", hourly, daily, quote)
  assert.ok(res.room !== null)
  assert.ok(res.roomPct !== null)
  assert.ok(res.defense !== null)
  assert.equal(typeof res.room, "number")
  assert.equal(typeof res.roomPct, "number")
  assert.equal(typeof res.defense, "number")

  const r4 = res.rules.find(r => r.id === 4)
  assert.ok(r4.passed)
  // Ensure no R:R appears in r4.detail
  assert.ok(!r4.detail.includes("R:R"))
  assert.ok(!r4.detail.includes("Risk:Reward"))
  // Ensure positive percentage with 2 decimal places is formatted
  assert.match(r4.detail, /\(Room: \$\d+\.\d{2} \/ \+\d+\.\d{2}%\)/)

  // 3. discordAlertPayload replaces 'Risk : Reward' with 'Magnitude & Defense'
  const alertStr = Model.discordAlertPayload(res, "TRIGGERED")
  const alertJson = JSON.parse(alertStr)
  const fields = alertJson.embeds[0].fields

  assert.ok(!fields.some(f => f.name.includes("Risk : Reward")))
  assert.ok(!fields.some(f => f.name.includes("Risk/Reward")))
  const magDefField = fields.find(f => f.name === "Magnitude & Defense")
  assert.ok(magDefField, "Must include Magnitude & Defense field")
  assert.match(magDefField.value, /`T1 Room: \$\d+\.\d{2} \(\+\d+\.\d{2}%\) \| Defense: \$\d+\.\d{2}`/)
})

test("Contradiction 11: Override & Conflict Permissiveness (Day+60m agree, eliminate pseudo-macro-flip, conflict Option B)", () => {
  // 1. classifyTimeframeContinuity: Full Bullish and Bearish FTFC
  const cBullFTFC = Model.classifyTimeframeContinuity("G", "G", "G", "G", { scenario: "2u" })
  assert.equal(cBullFTFC.direction, "LONG")
  assert.equal(cBullFTFC.isFTFC, true)
  assert.equal(cBullFTFC.isOverride, false)
  assert.equal(cBullFTFC.r1Pass, true)

  const cBearFTFC = Model.classifyTimeframeContinuity("R", "R", "R", "R", { scenario: "2d" })
  assert.equal(cBearFTFC.direction, "SHORT")
  assert.equal(cBearFTFC.isFTFC, true)
  assert.equal(cBearFTFC.isOverride, false)
  assert.equal(cBearFTFC.r1Pass, true)

  // 2. classifyTimeframeContinuity: Valid 1D+60m Override (color only, non-inside/non-3 Day break against opposing macro)
  const cBullOverride = Model.classifyTimeframeContinuity("R", "R", "G", "G", { scenario: "2u" })
  assert.equal(cBullOverride.direction, "LONG")
  assert.equal(cBullOverride.isFTFC, false)
  assert.equal(cBullOverride.isOverride, true)
  assert.equal(cBullOverride.r1Pass, true)

  const cBearOverride = Model.classifyTimeframeContinuity("G", "G", "R", "R", { scenario: "2d" })
  assert.equal(cBearOverride.direction, "SHORT")
  assert.equal(cBearOverride.isFTFC, false)
  assert.equal(cBearOverride.isOverride, true)
  assert.equal(cBearOverride.r1Pass, true)

  // 3. classifyTimeframeContinuity: Blocked override when Day is inside bar (1) opposing macro trend -> CONFLICT
  const cInsideDayPullback = Model.classifyTimeframeContinuity("R", "R", "G", "G", { scenario: "1" })
  assert.equal(cInsideDayPullback.direction, "CONFLICT")
  assert.equal(cInsideDayPullback.isOverride, false)
  assert.equal(cInsideDayPullback.isConflict, true)
  assert.equal(cInsideDayPullback.macroBias, "SHORT")

  // 4. classifyTimeframeContinuity: Blocked override when Day is Scenario 3 outside bar -> CONFLICT
  const cOutsideDayChop = Model.classifyTimeframeContinuity("R", "R", "G", "G", { scenario: "3" })
  assert.equal(cOutsideDayChop.direction, "CONFLICT")
  assert.equal(cOutsideDayChop.isOverride, false)
  assert.equal(cOutsideDayChop.isConflict, true)

  // 5. classifyTimeframeContinuity: 60m flip against Red Day (Macro=G, Day=R, 60m=G) -> CONFLICT (no premature override!)
  const cAwaitingReclaim = Model.classifyTimeframeContinuity("G", "G", "R", "G", { scenario: "2u" })
  assert.equal(cAwaitingReclaim.direction, "CONFLICT")
  assert.equal(cAwaitingReclaim.isFTFC, false)
  assert.equal(cAwaitingReclaim.isOverride, false)
  assert.equal(cAwaitingReclaim.isConflict, true)
  assert.equal(cAwaitingReclaim.macroBias, "LONG")

  // 6. classifyTimeframeContinuity: 50/50 mixed timeframes without macro consensus -> CONFLICT with null macroBias
  const cPureChop = Model.classifyTimeframeContinuity("G", "R", "G", "R", { scenario: "2u" })
  assert.equal(cPureChop.direction, "CONFLICT")
  assert.equal(cPureChop.macroBias, null)
  assert.equal(cPureChop.isConflict, true)

  // 7. evaluateStratChecklist: Awaiting 1D Open Reclaim formatted in Rule 1 detail and Armed status
  const t1 = Math.floor(new Date("2026-09-01T14:30:00Z").getTime() / 1000)
  const t2 = Math.floor(new Date("2026-09-07T14:30:00Z").getTime() / 1000)
  const t3 = Math.floor(new Date("2026-09-08T14:30:00Z").getTime() / 1000)
  const dailyConflict = [
    { timestamp: t1, open: 190, high: 215, low: 188, close: 205 }, // 1M open 190 -> price 210 is Green
    { timestamp: t2, open: 202, high: 215, low: 200, close: 208 }, // 1W open 202 -> price 210 is Green
    { timestamp: t3, open: 212, high: 213, low: 207, close: 210 }  // 1D open 212 -> price 210 is RED!
  ]
  const hourlyConflict = [
    { timestamp: t3 - 7200, open: 212, high: 213, low: 208, close: 209 },
    { timestamp: t3 - 3600, open: 209, high: 209.5, low: 207, close: 208 },
    { timestamp: t3, open: 208, high: 210.5, low: 207.8, close: 210 } // 60m 2u Green flip!
  ]
  const res = Model.evaluateStratChecklist("TSLA", hourlyConflict, dailyConflict, { regularMarketPrice: 210 })
  assert.equal(res.direction, "CONFLICT")
  assert.equal(res.isTradeable, false)
  assert.equal(res.isArmed, true)
  assert.match(res.statusTag, /ARMED - Macro Trend LONG \(Awaiting 1D Open Reclaim at \$212\.00\)/)
  const r3 = res.rules.find(r => r.id === 3)
  assert.equal(r3.passed, false)
  assert.match(r3.detail, /Conflict:.*Awaiting 1D Open Reclaim \(\$212\.00\)/)
})

test("Contradiction 10: The Flip & 60-Minute Bar Timing (xx:30 vs xx:00 and 15:30 Half-Hour Close)", () => {
  // 1. getUsSessionSchedule: regular day vs early-close holidays
  const regDayDate = new Date("2026-07-15T15:00:00Z") // Wednesday 11:00 AM EDT
  const regSched = Model.getUsSessionSchedule(regDayDate)
  assert.equal(regSched.isWeekend, false)
  assert.equal(regSched.isEarlyClose, false)
  assert.equal(regSched.openMins, 570)       // 09:30 ET
  assert.equal(regSched.closeMins, 960)      // 16:00 ET
  assert.equal(regSched.finalBarMins, 930)   // 15:30 ET
  assert.equal(regSched.isSessionOpen, true)

  // Black Friday (Nov 27, 2026) -> 1:00 PM ET early close (780 mins)
  const blackFridayDate = new Date("2026-11-27T17:00:00Z") // 12:00 PM EST
  const bfSched = Model.getUsSessionSchedule(blackFridayDate)
  assert.equal(bfSched.isEarlyClose, true)
  assert.equal(bfSched.closeMins, 780)      // 13:00 ET
  assert.equal(bfSched.finalBarMins, 750)  // 12:30 ET
  assert.equal(bfSched.isSessionOpen, true)

  // Weekend (Saturday) -> Session closed
  const weekendDate = new Date("2026-07-18T15:00:00Z")
  const weekendSched = Model.getUsSessionSchedule(weekendDate)
  assert.equal(weekendSched.isWeekend, true)
  assert.equal(weekendSched.isSessionOpen, false)

  // 2. candleDurationSec: 15:30 final bar is 1800s (30m) for US equities, 3600s for crypto
  // 10:30 AM EDT candle (630 mins)
  const bar1030 = { timestamp: Math.floor(new Date("2026-07-15T14:30:00Z").getTime() / 1000) }
  assert.equal(Model.candleDurationSec(bar1030, "60", "AAPL"), 3600)

  // 15:30 PM EDT candle (930 mins) -> Final bar of day before 16:00 ET close
  const bar1530 = { timestamp: Math.floor(new Date("2026-07-15T19:30:00Z").getTime() / 1000) }
  assert.equal(Model.candleDurationSec(bar1530, "60", "AAPL"), 1800)

  // Crypto at 15:30 ET is 24/7 continuous -> 3600s
  assert.equal(Model.candleDurationSec(bar1530, "60", "BTC-USD"), 3600)

  // Black Friday 12:30 PM EST candle (750 mins) -> Final bar before 13:00 ET close
  const barBf1230 = { timestamp: Math.floor(new Date("2026-11-27T17:30:00Z").getTime() / 1000) }
  assert.equal(Model.candleDurationSec(barBf1230, "60", "SPY"), 1800)

  // 3. evaluateStratChecklist Rule 4: Final 30m bar, market closed, and intraday exhaustion
  const tM = Math.floor(new Date("2026-07-01T13:30:00Z").getTime() / 1000)
  const tW = Math.floor(new Date("2026-07-13T13:30:00Z").getTime() / 1000)
  const tD = Math.floor(new Date("2026-07-15T13:30:00Z").getTime() / 1000) // 09:30 EDT Day Open
  const daily = [
    { timestamp: tM, open: 200, high: 220, low: 195, close: 215 },
    { timestamp: tW, open: 210, high: 220, low: 208, close: 216 },
    { timestamp: tD, open: 212, high: 218, low: 211, close: 216 }
  ]

  // Scenario A: Intraday fresh setup at 10:15 AM EDT (14:15 UTC) on 09:30 bar -> Fresh
  const hourlyMorning = [
    { timestamp: tD - 7200, open: 210, high: 214, low: 209, close: 212 },
    { timestamp: tD - 3600, open: 212, high: 215, low: 211, close: 213 },
    { timestamp: tD, open: 212, high: 216, low: 211.5, close: 215 } // 09:30-10:30 EDT
  ]
  const morningDate = new Date("2026-07-15T14:15:00Z") // 10:15 EDT -> 15m remaining in bar
  const resMorning = Model.evaluateStratChecklist("AAPL", hourlyMorning, daily, { regularMarketPrice: 215 }, morningDate)
  const r7Morning = resMorning.rules.find(r => r.id === 7)
  assert.equal(r7Morning.passed, true)
  assert.match(r7Morning.detail, /Fresh setup, no exhaustion/)

  // Scenario B: Intraday time exhaustion at 10:27 AM EDT (14:27 UTC) -> <5m remaining (3m left)
  const lateMorningDate = new Date("2026-07-15T14:27:00Z") // 10:27 EDT -> 3m left in 60m candle
  const resLateMorning = Model.evaluateStratChecklist("AAPL", hourlyMorning, daily, { regularMarketPrice: 215 }, lateMorningDate)
  const r7LateMorning = resLateMorning.rules.find(r => r.id === 7)
  assert.equal(r7LateMorning.passed, false)
  assert.match(r7LateMorning.detail, /Time exhaustion: <5m remaining in 60m candle \(3m left\)/)

  // Scenario C: Final bar at 15:45 EDT (19:45 UTC) -> <30m remaining before market close (15m left)
  // Even with 3/3 HTF In-Force, this is blocked!
  const tFinalBar = tD + 6 * 3600 // 15:30 EDT
  const hourlyFinal = [
    { timestamp: tFinalBar - 7200, open: 213, high: 216, low: 212, close: 214 },
    { timestamp: tFinalBar - 3600, open: 214, high: 217, low: 213, close: 215 },
    { timestamp: tFinalBar, open: 215, high: 217.5, low: 214.5, close: 217 } // 15:30 EDT final bar
  ]
  const lateAfternoonDate = new Date("2026-07-15T19:45:00Z") // 15:45 EDT -> 15m until 16:00 close
  const resFinal = Model.evaluateStratChecklist("AAPL", hourlyFinal, daily, { regularMarketPrice: 217 }, lateAfternoonDate)
  const r7Final = resFinal.rules.find(r => r.id === 7)
  assert.equal(r7Final.passed, false)
  assert.match(r7Final.detail, /Time exhaustion: <30m remaining before market close \(15m left\)/)
  assert.equal(resFinal.isTradeable, false)

  // Scenario D: Market session closed at 16:05 EDT (20:05 UTC)
  const postCloseDate = new Date("2026-07-15T20:05:00Z")
  const resClosed = Model.evaluateStratChecklist("AAPL", hourlyFinal, daily, { regularMarketPrice: 217 }, postCloseDate)
  const r7Closed = resClosed.rules.find(r => r.id === 7)
  assert.equal(r7Closed.passed, false)
  assert.equal(r7Closed.detail, "Market session closed")
  assert.equal(resClosed.isTradeable, false)

  // Scenario E: Market session closed on Weekend (Saturday)
  const resWeekend = Model.evaluateStratChecklist("AAPL", hourlyFinal, daily, { regularMarketPrice: 217 }, weekendDate)
  const r7Weekend = resWeekend.rules.find(r => r.id === 7)
  assert.equal(r7Weekend.passed, false)
  assert.equal(r7Weekend.detail, "Market session closed")

  // Scenario F: Crypto 24/7 at 16:05 EDT -> Session is never closed
  const resCrypto = Model.evaluateStratChecklist("BTC-USD", hourlyFinal, daily, { regularMarketPrice: 217 }, postCloseDate)
  const r7Crypto = resCrypto.rules.find(r => r.id === 7)
  assert.notEqual(r7Crypto.detail, "Market session closed")

  // 4. stratBarState staleness on the final 15:30 bar
  // The 15:30 bar ends at 16:00 (1800s). At 16:05 (nowSec - 19:30 UTC = 2100s),
  // with bar60Duration = 1800, stratBarState marks the bar stale and ignores live price.
  const t1530 = Math.floor(new Date("2026-07-15T19:30:00Z").getTime() / 1000)
  const bar1530Candle = { timestamp: t1530, open: 215, high: 217.5, low: 214.5, close: 217 }
  const bar1430Candle = { timestamp: t1530 - 3600, open: 214, high: 217, low: 213, close: 215 }
  const nowSecPostClose = Math.floor(postCloseDate.getTime() / 1000)
  const bar60Duration = Model.candleDurationSec(bar1530Candle, "60", "AAPL", postCloseDate)
  assert.equal(bar60Duration, 1800)
  const stateStale = Model.stratBarState(bar1530Candle, bar1430Candle, 225 /* livePrice surging post-close */, nowSecPostClose, bar60Duration)
  // Stale bar ignores live price 225 (doesn't merge into high 217.5) and falls back to close 217
  assert.equal(stateStale.price, 217)
  assert.equal(stateStale.high, 217.5)
  assert.equal(stateStale.liveMerged, false)
})

test("Contradiction 13: Simultaneous Break Concentration Threshold (80% standard, directional flags, rounded comparison)", () => {
  assert.equal(Model.SIMULTANEOUS_BREAK_THRESHOLD, 80)

  // 10 holdings test setup
  const holdings = []
  const candlesMap = {}
  for (let i = 0; i < 10; i++) {
    const sym = "SYM" + i
    holdings.push({ symbol: sym, name: sym })
  }

  // 7 out of 10 break 2u (70% -> false for simultaneous break)
  for (let i = 0; i < 7; i++) {
    const sym = "SYM" + i
    candlesMap[sym] = [
      { open: 100, high: 105, low: 95, close: 104 },
      { open: 104, high: 108, low: 102, close: 107 } // 2u Green
    ]
  }
  // 3 out of 10 are inside bars (1)
  for (let i = 7; i < 10; i++) {
    const sym = "SYM" + i
    candlesMap[sym] = [
      { open: 100, high: 105, low: 95, close: 104 },
      { open: 103, high: 104, low: 101, close: 102 } // 1
    ]
  }

  const metrics70 = Model.computeBasketAttackMetrics("XLK", "Tech", "Sector", holdings, candlesMap, null, "1D")
  assert.equal(metrics70.count2u, 7)
  assert.equal(metrics70.pct2u, 70)
  assert.equal(metrics70.isSimultaneous2u, false)
  assert.equal(metrics70.isSimultaneous2d, false)
  assert.equal(metrics70.isSimultaneousExpansion, false)
  assert.equal(metrics70.isSimultaneousBreak, false)

  // Now make 8th holding break 2u -> 8 out of 10 (80% -> true)
  candlesMap["SYM7"] = [
    { open: 100, high: 105, low: 95, close: 104 },
    { open: 104, high: 109, low: 103, close: 108 } // 2u Green
  ]
  const metrics80 = Model.computeBasketAttackMetrics("XLK", "Tech", "Sector", holdings, candlesMap, null, "1D")
  assert.equal(metrics80.count2u, 8)
  assert.equal(metrics80.pct2u, 80)
  assert.equal(metrics80.isSimultaneous2u, true)
  assert.equal(metrics80.isSimultaneous2d, false)
  assert.equal(metrics80.isSimultaneousExpansion, true)
  assert.equal(metrics80.isSimultaneousBreak, true)

  // Verify rounded comparison logic (e.g., 14 holdings: 11/14 = 78.57% -> 79% does not trigger, 12/14 = 85.71% -> 86% triggers)
  const holdings14 = []
  const candles14 = {}
  for (let i = 0; i < 14; i++) {
    const sym = "H" + i
    holdings14.push({ symbol: sym })
    if (i < 11) {
      // 11 / 14 = 78.57% 2d
      candles14[sym] = [
        { open: 100, high: 105, low: 95, close: 104 },
        { open: 100, high: 101, low: 92, close: 93 } // 2d Red
      ]
    } else {
      candles14[sym] = [
        { open: 100, high: 105, low: 95, close: 104 },
        { open: 100, high: 102, low: 98, close: 99 } // 1
      ]
    }
  }
  const metrics11of14 = Model.computeBasketAttackMetrics("XLE", "Energy", "Sector", holdings14, candles14, null, "1D")
  assert.equal(metrics11of14.count2d, 11)
  assert.equal(Math.round(metrics11of14.pct2d), 79)
  assert.equal(metrics11of14.isSimultaneous2d, false)
  assert.equal(metrics11of14.isSimultaneousExpansion, false)

  // Add 12th 2d break -> 12 / 14 = 85.71% -> 86%
  candles14["H11"] = [
    { open: 100, high: 105, low: 95, close: 104 },
    { open: 100, high: 101, low: 91, close: 92 } // 2d Red
  ]
  const metrics12of14 = Model.computeBasketAttackMetrics("XLE", "Energy", "Sector", holdings14, candles14, null, "1D")
  assert.equal(metrics12of14.count2d, 12)
  assert.equal(Math.round(metrics12of14.pct2d), 86)
  assert.equal(metrics12of14.isSimultaneous2d, true)
  assert.equal(metrics12of14.isSimultaneousExpansion, true)
  assert.equal(metrics12of14.isSimultaneousBreak, true)
})

test("Contradiction 3: Pure Canon Triggered vs. In-Force Definition (stratInForce, computeStratDetails, and Checklist Rule 5)", () => {
  // 1. Verify stratInForce helper
  assert.equal(Model.stratInForce("2u"), "In-Force")
  assert.equal(Model.stratInForce("2d"), "In-Force")
  assert.equal(Model.stratInForce("1"), "Inside Bar")
  assert.equal(Model.stratInForce("3"), "Outside Bar")
  assert.equal(Model.stratInForce("-"), "-")

  // 2. computeStratDetails: Pure Canon inForce behavior
  // c0: O:100 H:110 L:95 C:105
  // c1: O:105 H:115 L:104 C:108 (2u vs c0, broke 110, closed at 108 below 110 trigger -> In-Force Pullback)
  const pullback2u = [
    { open: 100, high: 110, low: 95, close: 105 },
    { open: 105, high: 115, low: 104, close: 108 }
  ]
  const resPullback = Model.computeStratDetails(pullback2u)
  assert.equal(resPullback.bar, "2U")
  assert.equal(resPullback.polarity, "green")
  assert.equal(resPullback.inForce, "In-Force") // Pure Canon: triggered and in-force despite close < trigger

  // Failed 2u Red: broke high 110 (H: 115), but closed red (open: 112, close: 102)
  const failed2uRed = [
    { open: 100, high: 110, low: 95, close: 105 },
    { open: 112, high: 115, low: 98, close: 102 }
  ]
  const resFailed2u = Model.computeStratDetails(failed2uRed)
  assert.equal(resFailed2u.bar, "2U")
  assert.equal(resFailed2u.polarity, "red")
  assert.equal(resFailed2u.inForce, "In-Force") // Pure Canon: strictly "In-Force"

  // Scenario 3 (Outside bar): broke both sides (H: 120 > 110, L: 90 < 95, C: 118 > 110)
  const outsideBar = [
    { open: 100, high: 110, low: 95, close: 105 },
    { open: 98, high: 120, low: 90, close: 118 }
  ]
  const resOutside = Model.computeStratDetails(outsideBar)
  assert.equal(resOutside.bar, "3")
  assert.equal(resOutside.polarity, "green")
  assert.equal(resOutside.inForce, "Outside Bar") // Pure Canon: strictly "Outside Bar"

  // 3. evaluateStratChecklist Rule 5: passes when setup bar has crossed trigger, even if currentPrice pulled back
  const hourlyBullish = [
    { timestamp: 1000, open: 100, high: 105, low: 95, close: 104 }, // pSetup (1): H 105, L 95
    { timestamp: 2000, open: 104, high: 108, low: 102, close: 103 }  // cSetup (2u): broke trigger 105 (H 108), but cur close is 103 (< 105)
  ]
  const dailyAligned = [
    { timestamp: 100, open: 90, high: 110, low: 88, close: 104 },
    { timestamp: 200, open: 100, high: 112, low: 99, close: 108 }
  ]

  // Live price pulled back to 103.50 (below trigger 105.00)
  const chkPullback = Model.evaluateStratChecklist("AAPL", hourlyBullish, dailyAligned, {
    regularMarketPrice: 103.50,
    activeTimeframe: "60"
  })

  const r9 = chkPullback.rules.find(r => r.id === 9)
  assert.equal(r9.passed, true) // Question 9 passes because setup triggered and is in-force!
  assert.match(r9.detail, /In-Force/)
  assert.equal(chkPullback.isTriggered, true)
  assert.equal(chkPullback.takeActionWindow.isOpen, true) // Take Action Window stays open during pullback!

  // Untriggered setup (cSetup high 104.50 never crossed 105.00 trigger)
  const hourlyUntriggered = [
    { timestamp: 1000, open: 100, high: 105, low: 95, close: 104 }, // pSetup
    { timestamp: 2000, open: 103, high: 104.50, low: 102, close: 103 } // cSetup
  ]
  const chkUntriggered = Model.evaluateStratChecklist("AAPL", hourlyUntriggered, dailyAligned, {
    regularMarketPrice: 103.00,
    activeTimeframe: "60"
  })
  const r9Untrig = chkUntriggered.rules.find(r => r.id === 9)
  assert.equal(r9Untrig.passed, false) // Has not triggered
  assert.match(r9Untrig.detail, /Awaiting Trigger/)
  assert.equal(chkUntriggered.isTriggered, false)
})

test("Contradiction 4: Momentum vs. Retracement (The One-Bar Test)", () => {
  // 1. 2-1-2 Continuation off Green 2u -> Momentum (Continuation)
  const candles212GreenCont = [
    { open: 100, high: 105, low: 98, close: 102 }, // p3
    { open: 102, high: 110, low: 101, close: 108 }, // p2: Green 2u
    { open: 106, high: 107, low: 104, close: 105 }, // p1: 1 (Inside)
    { open: 105, high: 109, low: 104, close: 108 }  // cur: 2u Long
  ]
  const res1 = Model.classifyMomentumOrRetracement(candles212GreenCont, true, false)
  assert.equal(res1.style, "MOMENTUM")
  assert.equal(res1.label, "Momentum (Continuation)")

  // 2. 2-1-2 Continuation off Red 2u -> Retracement (Continuation) [Rob Smith Canon]
  const candles212RedCont = [
    { open: 100, high: 105, low: 98, close: 102 }, // p3
    { open: 110, high: 112, low: 101, close: 104 }, // p2: Red 2u (open 110 > close 104)
    { open: 106, high: 107, low: 104, close: 105 }, // p1: 1 (Inside)
    { open: 105, high: 109, low: 104, close: 108 }  // cur: 2u Long
  ]
  const res2 = Model.classifyMomentumOrRetracement(candles212RedCont, true, false)
  assert.equal(res2.style, "RETRACEMENT")
  assert.equal(res2.label, "Retracement (Continuation)")

  // 3. 2-1-2 Reversal off Red 2u breaking Down (Short) -> Momentum (Reversal) [Rob Smith Canon]
  // In a reversal off a 2u breaking down, trade direction is Short, and prior bar was Red
  const res3 = Model.classifyMomentumOrRetracement(candles212RedCont, false, false)
  assert.equal(res3.style, "MOMENTUM")
  assert.equal(res3.label, "Momentum (Reversal)")

  // 4. 2-1-2 Reversal off Red 2d breaking Up (Long) -> Retracement (Reversal)
  const candles212RedRev = [
    { open: 105, high: 110, low: 103, close: 106 }, // p3
    { open: 106, high: 107, low: 98, close: 100 },  // p2: Red 2d
    { open: 101, high: 103, low: 99, close: 102 },  // p1: 1 (Inside)
    { open: 102, high: 105, low: 101, close: 104 }  // cur: 2u Long
  ]
  const res4 = Model.classifyMomentumOrRetracement(candles212RedRev, true, false)
  assert.equal(res4.style, "RETRACEMENT")
  assert.equal(res4.label, "Retracement (Reversal)")

  // 5. Compound Inside Bars (1-1-2) with Motherbar Lookback
  // p4: Green 2u -> p3: Inside 1 -> p2: Inside 1 -> p1: Inside 1 -> cur: Long
  const candlesCompound1 = [
    { open: 100, high: 105, low: 98, close: 102 }, // p5
    { open: 102, high: 120, low: 101, close: 118 }, // p4: Motherbar (Green 2u)
    { open: 115, high: 118, low: 110, close: 112 }, // p3: Inside 1 (Red)
    { open: 112, high: 116, low: 111, close: 114 }, // p2: Inside 1 (Green)
    { open: 113, high: 115, low: 112, close: 114 }, // p1: Inside 1
    { open: 114, high: 117, low: 113, close: 116 }  // cur: Long trigger
  ]
  const res5 = Model.classifyMomentumOrRetracement(candlesCompound1, true, false)
  // Walkback skips p2 and p3 (inside bars), tests motherbar p4 (Green 2u). Same color as Long -> Momentum (Continuation)
  assert.equal(res5.style, "MOMENTUM")
  assert.equal(res5.label, "Momentum (Continuation)")

  // 6. Developing Failed 2 Reversal (isFailed2 = true): tests completed bar before it (p1)
  const candlesFailed2 = [
    { open: 100, high: 108, low: 98, close: 104 }, // p2
    { open: 106, high: 107, low: 96, close: 98 },  // p1: Red 2d
    { open: 98, high: 105, low: 95, close: 103 }   // cur: went 2d (< 96) then reversed Green (> 98)
  ]
  // Long trade with p1 being Red -> opposite color -> Retracement (Reversal)
  const res6 = Model.classifyMomentumOrRetracement(candlesFailed2, true, true)
  assert.equal(res6.style, "RETRACEMENT")
  assert.equal(res6.label, "Retracement (Reversal)")

  // 7. 2-2 Direct Trigger: Green 2u -> 2u Continuation
  const candles22Cont = [
    { open: 100, high: 105, low: 98, close: 102 }, // p2
    { open: 102, high: 110, low: 101, close: 108 }, // p1: Green 2u
    { open: 108, high: 112, low: 107, close: 111 }  // cur: 2u Long
  ]
  const res7 = Model.classifyMomentumOrRetracement(candles22Cont, true, false)
  assert.equal(res7.style, "MOMENTUM")
  assert.equal(res7.label, "Momentum (Continuation)")

  // 8. Flat bar (close === open) defaults to Green
  const candlesFlat = [
    { open: 100, high: 105, low: 98, close: 102 },
    { open: 105, high: 110, low: 100, close: 105 }, // p1: open 105 === close 105 (Flat)
    { open: 105, high: 112, low: 104, close: 110 }
  ]
  const res8 = Model.classifyMomentumOrRetracement(candlesFlat, true, false)
  assert.equal(res8.style, "MOMENTUM") // defaults to Green -> matches Long
})

test("Contradiction 6: 2-1-2 Reversal Magnitude Target (Canonical p2 extreme as T1)", () => {
  // Test 1: 60m 2d-1-2u Bullish Reversal targets 60m Motherbar High (p2) before Daily High
  const daily1 = [
    { timestamp: 100, open: 490, high: 520, low: 500, close: 510 },
    { timestamp: 200, open: 510, high: 515, low: 495, close: 498 }, // 1D High = 515, Low = 495 (2D bar breaking 500)
    { timestamp: 300, open: 498, high: 508, low: 494, close: 504 } // curPrice: 502.5 (2d bar, Green)
  ]
  const hourly1 = [
    { timestamp: 1000, open: 508, high: 510, low: 500, close: 502 },
    { timestamp: 2000, open: 502, high: 505, low: 497, close: 499 }, // p2: 2d (high: 505)
    { timestamp: 3000, open: 499, high: 502, low: 498, close: 501 }, // p1: 1 (inside 505 - 497, trigger: 502)
    { timestamp: 4000, open: 501, high: 503, low: 500.5, close: 502.5 } // cur: 2u triggered at 502.5
  ]
  const res1 = Model.evaluateStratChecklist("SPY", hourly1, daily1, { regularMarketPrice: 502.5 })
  assert.equal(res1.direction, "LONG")
  assert.equal(res1.isTradeable, true)
  assert.equal(res1.triggerPrice, 502)
  // T1 must be 505 (60m Motherbar High), NOT overshooting to 515 (1D High)!
  assert.equal(res1.targetPrice, 505)
  assert.match(res1.targetName, /Motherbar High/)
  assert.equal(res1.targets[0].price, 505)
  assert.equal(res1.targets[1].price, 515)
  assert.equal(res1.targets[1].name, "1D High")
  // Domino cascade points to T2 (1D High 515) which triggers Daily 2d-2u Bullish Reversal
  assert.ok(res1.domino)
  assert.equal(res1.domino.hasDomino, true)
  assert.equal(res1.domino.targetPrice, 515)
  assert.equal(res1.domino.triggeredSignal, "Daily 2d-2u Bullish Reversal")
  assert.equal(res1.domino.isT1Domino, false)

  // Test 2: 60m 2u-1-2d Bearish Reversal targets 60m Motherbar Low (p2) before Daily Low
  const daily2 = [
    { timestamp: 100, open: 520, high: 505, low: 480, close: 490 },
    { timestamp: 200, open: 490, high: 512, low: 485, close: 508 }, // 1D Low = 485, High = 512 (2U bar breaking 505)
    { timestamp: 300, open: 505, high: 515, low: 492, close: 496 } // curPrice: 497.5 (2u bar, Red)
  ]
  const hourly2 = [
    { timestamp: 1000, open: 492, high: 495, low: 488, close: 494 },
    { timestamp: 2000, open: 494, high: 503, low: 495, close: 501 }, // p2: 2u (low: 495)
    { timestamp: 3000, open: 501, high: 502, low: 498, close: 499 }, // p1: 1 (inside 503 - 495, trigger: 498)
    { timestamp: 4000, open: 499, high: 499.5, low: 497, close: 497.5 } // cur: 2d triggered at 497.5
  ]
  const res2 = Model.evaluateStratChecklist("QQQ", hourly2, daily2, { regularMarketPrice: 497.5 })
  assert.equal(res2.direction, "SHORT")
  assert.equal(res2.isTradeable, true)
  assert.equal(res2.triggerPrice, 498)
  // T1 must be 495 (60m Motherbar Low), NOT overshooting to 485 (1D Low)!
  assert.equal(res2.targetPrice, 495)
  assert.match(res2.targetName, /Motherbar Low/)
  assert.equal(res2.targets[0].price, 495)
  assert.equal(res2.targets[1].price, 485)
  assert.equal(res2.targets[1].name, "1D Low")
  assert.ok(res2.domino)
  assert.equal(res2.domino.hasDomino, true)
  assert.equal(res2.domino.targetPrice, 485)
  assert.equal(res2.domino.triggeredSignal, "Daily 2u-2d Bearish Reversal")

  // Test 3: Confluent collision between p2 extreme and Daily High deduplicates while preserving Domino
  const tD1 = 86400 * 100
  const tD2 = 86400 * 101
  const tD3 = 86400 * 102
  const daily3 = [
    { timestamp: tD1, open: 490, high: 510, low: 500, close: 505 },
    { timestamp: tD2, open: 505, high: 505, low: 490, close: 492 }, // 1D High = 505, Low = 490 (2D bar breaking 500)
    { timestamp: tD3, open: 495, high: 503, low: 488, close: 502 } // curPrice: 502 (2d bar, Green)
  ]
  const hourly3 = [
    { timestamp: tD2 + 3600 * 4, open: 496, high: 502, low: 495, close: 498 },
    { timestamp: tD2 + 3600 * 5, open: 498, high: 505, low: 496, close: 497 }, // p2: 2d on Day 2 (high: 505)
    { timestamp: tD3 + 3600 * 1, open: 497, high: 501, low: 496.5, close: 500 }, // p1: 1 on Day 3 (trigger: 501)
    { timestamp: tD3 + 3600 * 2, open: 500, high: 502.5, low: 499.5, close: 502 } // cur: 2u triggered at 501
  ]
  const res3 = Model.evaluateStratChecklist("SPY", hourly3, daily3, { regularMarketPrice: 502 })
  assert.equal(res3.targetPrice, 505)
  // Only 1 target at 505 (deduplicated)
  const at505 = res3.targets.filter(t => Math.abs(t.price - 505) < 0.01)
  assert.equal(at505.length, 1)
  // Merged target retains Domino metadata
  assert.equal(at505[0].dominoSignal, "Daily 2d-2u Bullish Reversal")
  assert.ok(res3.domino)
  assert.equal(res3.domino.targetPrice, 505)
  assert.equal(res3.domino.isT1Domino, true)

  // Test 4: Gapped past p2 (p2 already tagged at entry inception) naturally promotes Daily High to T1
  const hourly4 = [
    { timestamp: 1000, open: 502, high: 504, low: 500, close: 502 },
    { timestamp: 2000, open: 502, high: 505, low: 497, close: 499 }, // p2: 2d (high: 505)
    { timestamp: 3000, open: 499, high: 502, low: 498, close: 501 }, // p1: 1 (trigger: 502)
    { timestamp: 4000, open: 506, high: 508, low: 505.5, close: 507 } // Gapped open at 506 (above p2 505!)
  ]
  const res4 = Model.evaluateStratChecklist("SPY", hourly4, daily1, { regularMarketPrice: 507 })
  assert.equal(res4.isTradeable, true)
  // 505 was already breached at open (entryBaseline = 506), so T1 is cleanly promoted to 515 (1D High)
  assert.equal(res4.targetPrice, 515)
  assert.equal(res4.targetName, "1D High")
})

test("Contradiction 7: 1-3-2 Rev Strat Canonical Validation (1-3-[Hammer/Shooter]-2)", () => {
  const daily = [
    { timestamp: 100, open: 100, high: 110, low: 95, close: 108 },
    { timestamp: 200, open: 108, high: 120, low: 105, close: 118 },
    { timestamp: 300, open: 112, high: 125, low: 110, close: 120 }
  ]

  // Test 1: Valid Bullish 1-3-2 RevStrat:
  // p3: 200-210 (Motherbar)
  // p2: 202-208 (Inside Bar = 1)
  // p1: 198-212, open=210, close=211 (Scenario 3 Outside Bar that closes in top 33% = Hammer!)
  // c0: open=211.5, high=213, low=211, close=212.5 (2u breakout)
  const hourlyBullHammer = [
    { timestamp: 1000, open: 202, high: 210, low: 200, close: 208 }, // p3
    { timestamp: 2000, open: 204, high: 208, low: 202, close: 206 }, // p2: 1 (inside p3)
    { timestamp: 3000, open: 209.5, high: 212, low: 198, close: 211 }, // p1: 3 Outside Bar (range=14, body: 209.5-211, bottom=209.5 >= 198 + 9.33 = 207.33, upper wick=1 <= 1.4 -> Hammer!)
    { timestamp: 4000, open: 211.5, high: 213, low: 211, close: 212.5 } // c0: 2u triggered at 212
  ]
  const resBull = Model.evaluateStratChecklist("SPY", hourlyBullHammer, daily, { regularMarketPrice: 212.5 })
  const r1Bull = resBull.rules.find(r => r.id === 1)
  assert.equal(r1Bull.passed, true)
  assert.match(resBull.signalName, /1-3-2 RevStrat Up/)
  assert.match(r1Bull.detail, /Hammer/)
  // Stop is anchored to entry bar low - 0.01 (211 - 0.01 = 210.99), NOT the hammer wick at 198!
  assert.equal(resBull.stopPrice, 210.99)
  const r8Bull = resBull.rules.find(r => r.id === 8)
  assert.match(r8Bull.detail, /Entry Low - \$0\.01/)

  // Test 2: Gated Bullish 1-3-2 RevStrat where Scenario 3 bar fails to close as a Hammer (e.g. Doji or Red trend bar):
  // p1: 198-212, open=206, close=200 (Red solid body closing near low = NOT a Hammer)
  const hourlyBullInvalid = [
    { timestamp: 1000, open: 202, high: 210, low: 200, close: 208 }, // p3
    { timestamp: 2000, open: 204, high: 208, low: 202, close: 206 }, // p2: 1 (inside p3)
    { timestamp: 3000, open: 206, high: 212, low: 198, close: 200 }, // p1: 3 Outside Bar (closes near low, NO rejection wick)
    { timestamp: 4000, open: 211.5, high: 213, low: 211, close: 212.5 } // c0: 2u
  ]
  const resBullInv = Model.evaluateStratChecklist("SPY", hourlyBullInvalid, daily, { regularMarketPrice: 212.5 })
  const r1BullInv = resBullInv.rules.find(r => r.id === 1)
  assert.equal(r1BullInv.passed, false)
  assert.match(r1BullInv.detail, /failed to close as Hammer \(rejection required for 1-3-2 RevStrat\)/)

  // Test 3: Valid Bearish 1-3-2 RevStrat:
  // p3: 200-210
  // p2: 202-208 (Inside Bar = 1)
  // p1: 198-212, open=200, close=199 (Scenario 3 Outside Bar closing in bottom 33% with long upper wick = Shooter!)
  // c0: open=198.5, high=199, low=197, close=197.5 (2d breakout)
  const dailyBear = [
    { timestamp: 100, open: 220, high: 225, low: 205, close: 210 },
    { timestamp: 200, open: 210, high: 215, low: 195, close: 200 },
    { timestamp: 300, open: 200, high: 205, low: 190, close: 195 }
  ]
  const hourlyBearShooter = [
    { timestamp: 1000, open: 202, high: 210, low: 200, close: 208 }, // p3
    { timestamp: 2000, open: 204, high: 208, low: 202, close: 206 }, // p2: 1 (inside p3)
    { timestamp: 3000, open: 200, high: 212, low: 198, close: 199 }, // p1: 3 Outside Bar (range=14, body: 199-200, top=200 <= 198 + 4.67 = 202.67, lower wick=1 <= 1.4 -> Shooter!)
    { timestamp: 4000, open: 198.5, high: 199, low: 197, close: 197.5 } // c0: 2d triggered at 198
  ]
  const resBear = Model.evaluateStratChecklist("QQQ", hourlyBearShooter, dailyBear, { regularMarketPrice: 197.5 })
  const r1Bear = resBear.rules.find(r => r.id === 1)
  assert.equal(r1Bear.passed, true)
  assert.match(resBear.signalName, /1-3-2 RevStrat Down/)
  assert.match(r1Bear.detail, /Shooter/)
  // Stop is anchored to entry bar high + 0.01 (199 + 0.01 = 199.01), NOT the shooter wick at 212!
  assert.equal(resBear.stopPrice, 199.01)
  const r8Bear = resBear.rules.find(r => r.id === 8)
  assert.match(r8Bear.detail, /Entry High \+ \$0\.01/)

  // Test 4: Gated Bearish 1-3-2 RevStrat where Scenario 3 bar fails to close as a Shooter:
  // p1: 198-212, open=202, close=210 (Green solid body = NOT a Shooter)
  const hourlyBearInvalid = [
    { timestamp: 1000, open: 202, high: 210, low: 200, close: 208 }, // p3
    { timestamp: 2000, open: 204, high: 208, low: 202, close: 206 }, // p2: 1 (inside p3)
    { timestamp: 3000, open: 202, high: 212, low: 198, close: 210 }, // p1: 3 Outside Bar (closes near high, NO shooter wick)
    { timestamp: 4000, open: 198.5, high: 199, low: 197, close: 197.5 } // c0: 2d
  ]
  const resBearInv = Model.evaluateStratChecklist("QQQ", hourlyBearInvalid, dailyBear, { regularMarketPrice: 197.5 })
  const r1BearInv = resBearInv.rules.find(r => r.id === 1)
  assert.equal(r1BearInv.passed, false)
  assert.match(r1BearInv.detail, /failed to close as Shooter \(rejection required for 1-3-2 RevStrat\)/)

  // Test 5: Sector query token "1-3-2" in matchesScenarioTokens
  // Matches valid bullish 1-3-2
  assert.equal(Model.matchesScenarioQuery(hourlyBullHammer, { regularMarketPrice: 212.5 }, "1-3-2"), true)
  // Rejects invalid bullish 1-3-2 (3-bar did not close as Hammer)
  assert.equal(Model.matchesScenarioQuery(hourlyBullInvalid, { regularMarketPrice: 212.5 }, "1-3-2"), false)
  // Matches valid bearish 1-3-2
  assert.equal(Model.matchesScenarioQuery(hourlyBearShooter, { regularMarketPrice: 197.5 }, "1-3-2"), true)
  // Rejects invalid bearish 1-3-2 (3-bar did not close as Shooter)
  assert.equal(Model.matchesScenarioQuery(hourlyBearInvalid, { regularMarketPrice: 197.5 }, "1-3-2"), false)
})

test("Contradiction 14: Canonical Stop-Loss Placements (Tightest Stop = spread + $0.01 from trigger)", () => {
  // 1. stratSpread helper
  assert.equal(Model.stratSpread(null), 0)
  assert.equal(Model.stratSpread({ regularMarketPrice: 100 }), 0)
  assert.equal(Model.stratSpread({ spread: 0.05 }), 0.05)
  assert.equal(Model.stratSpread({ ask: 100.08, bid: 100.02 }), 0.06)
  assert.equal(Model.stratSpread({ ask: 100.08, bid: 100.02 }, { spread: 0.03 }), 0.03)

  // 2. Bullish 2d-1-2u setup:
  // p2 (2d): 100-110, p1 (1): 102-108 (trigger = 108), c0: 107-111, open = 107.5
  const dailyBull = [
    { timestamp: 100, open: 95, high: 105, low: 90, close: 100 },
    { timestamp: 200, open: 100, high: 115, low: 98, close: 110 },
    { timestamp: 300, open: 110, high: 120, low: 105, close: 118 }
  ]
  const hourlyBull = [
    { timestamp: 1000, open: 108, high: 110, low: 100, close: 102 }, // p2: 2d (high 110, low 100)
    { timestamp: 2000, open: 103, high: 108, low: 102, close: 106 }, // p1: 1 inside bar (high 108, low 102) -> trigger = 108
    { timestamp: 3000, open: 107.5, high: 111, low: 107, close: 109.5 } // c0: 2u breakout
  ]

  // Default spread fallback (0): tightest offset = 0.01 -> tightest stop = 108 - 0.01 = 107.99
  const resBull = Model.evaluateStratChecklist("AAPL", hourlyBull, dailyBull, { regularMarketPrice: 109.5 })
  assert.ok(resBull.stopLevels)
  assert.equal(resBull.stopLevels.tightest, 107.99)
  assert.equal(resBull.stopLevels.tight, 107.5) // entry candle open
  assert.equal(resBull.stopLevels.wide, 102) // signal candle low (structural)
  assert.equal(resBull.stopLevels.structural, 102)
  assert.equal(resBull.stopLevels.fiftyPct, 105) // (108 + 102) / 2
  // Default stopPrice remains structural/wide
  assert.equal(resBull.stopPrice, 102)
  const r8Bull = resBull.rules.find(r => r.id === 8)
  assert.match(r8Bull.detail, /Tightest: \$107\.99/)
  assert.match(r8Bull.detail, /Tight \(Open\): \$107\.50/)
  assert.match(r8Bull.detail, /50%: \$105\.00/)

  // Dynamic spread: live quote with ask 109.55, bid 109.51 (spread = 0.04) -> tightest offset = 0.05 -> stop = 108 - 0.05 = 107.95
  const resSpread = Model.evaluateStratChecklist("AAPL", hourlyBull, dailyBull, { regularMarketPrice: 109.5, ask: 109.55, bid: 109.51 })
  assert.equal(resSpread.stopLevels.tightest, 107.95)

  // 3. Bearish 2u-1-2d setup:
  // p2 (2u): 100-110, p1 (1): 102-108 (trigger = 102), c0: 103-99, open = 102.5
  const dailyBear = [
    { timestamp: 100, open: 120, high: 125, low: 110, close: 115 },
    { timestamp: 200, open: 115, high: 118, low: 100, close: 105 },
    { timestamp: 300, open: 105, high: 108, low: 90, close: 95 }
  ]
  const hourlyBear = [
    { timestamp: 1000, open: 102, high: 110, low: 100, close: 108 }, // p2: 2u
    { timestamp: 2000, open: 106, high: 108, low: 102, close: 104 }, // p1: 1 inside bar -> trigger = 102
    { timestamp: 3000, open: 102.5, high: 103, low: 99, close: 100 } // c0: 2d breakout
  ]
  // Default spread (0): tightest offset = 0.01 -> tightest stop = 102 + 0.01 = 102.01
  const resBear = Model.evaluateStratChecklist("TSLA", hourlyBear, dailyBear, { regularMarketPrice: 100 })
  assert.equal(resBear.stopLevels.tightest, 102.01)
  assert.equal(resBear.stopLevels.tight, 102.5) // entry candle open
  assert.equal(resBear.stopLevels.wide, 108) // signal candle high (structural)
  assert.equal(resBear.stopLevels.structural, 108)

  // 4. options.stopTier selection:
  // When stopTier is "tightest", stopPrice binds to tightest stop
  const resTierTightest = Model.evaluateStratChecklist("AAPL", hourlyBull, dailyBull, { regularMarketPrice: 109.5 }, null, { stopTier: "tightest" })
  assert.equal(resTierTightest.stopPrice, 107.99)
  const r8Tightest = resTierTightest.rules.find(r => r.id === 8)
  assert.match(r8Tightest.detail, /Tightest \(Spread \+ \$0\.01\)/)

  // When stopTier is "tight", stopPrice binds to entry open
  const resTierTight = Model.evaluateStratChecklist("AAPL", hourlyBull, dailyBull, { regularMarketPrice: 109.5 }, null, { stopTier: "tight" })
  assert.equal(resTierTight.stopPrice, 107.5)
  const r8Tight = resTierTight.rules.find(r => r.id === 8)
  assert.match(r8Tight.detail, /Entry Open \(Tight Stop\)/)
})

test("Contradiction 15: Pivot Machine Gun (PMG) Usage & Target Resolution (Motherbar Continuity & Guaranteed Final Slot)", () => {
  // 1. Motherbar Pivot Continuity: Inside bar (1) in the sequence does not break PMG
  const pmgInsideCandles = [
    { timestamp: 1000, open: 115, high: 116, low: 110, close: 112 }, // Pivot 5 (116)
    { timestamp: 2000, open: 112, high: 114, low: 108, close: 110 }, // Pivot 4 (114)
    { timestamp: 3000, open: 110, high: 112, low: 104, close: 106 }, // Pivot 3 (Motherbar: 112)
    { timestamp: 4000, open: 107, high: 110, low: 105, close: 108 }, // Inside bar 1 (high 110 < 112)
    { timestamp: 5000, open: 107, high: 111, low: 102, close: 104 }, // Pivot 2 (2d breakdown, high 111 < motherbar 112, but > inside bar 110)
    { timestamp: 6000, open: 104, high: 106, low: 100, close: 102 }, // Pivot 1 (p1 trigger: 106)
    { timestamp: 7000, open: 103, high: 108, low: 102, close: 107 }  // c0 (reversal above 106)
  ]
  const pmgRes = Model.detectPivotMachineGun(pmgInsideCandles, true)
  assert.equal(pmgRes.isPMG, true)
  assert.equal(pmgRes.triggerPrice, 106)
  assert.equal(pmgRes.topTarget, 116)
  assert.ok(pmgRes.pivots.includes(106))
  assert.ok(pmgRes.pivots.includes(111))
  assert.ok(pmgRes.pivots.includes(112))
  assert.ok(pmgRes.pivots.includes(114))
  assert.ok(pmgRes.pivots.includes(116))

  // 2. Flat extremes (equal highs) allowed without aborting
  const pmgFlatCandles = [
    { timestamp: 1000, open: 111, high: 112, low: 108, close: 109 },
    { timestamp: 2000, open: 109, high: 110, low: 106, close: 107 },
    { timestamp: 3000, open: 107, high: 108, low: 104, close: 105 },
    { timestamp: 4000, open: 107, high: 108, low: 104, close: 105 }, // Equal high (108)
    { timestamp: 5000, open: 105, high: 106, low: 102, close: 103 },
    { timestamp: 6000, open: 103, high: 104, low: 100, close: 101 }, // p1 trigger: 104
    { timestamp: 7000, open: 102, high: 105, low: 101, close: 104.5 }
  ]
  const pmgFlat = Model.detectPivotMachineGun(pmgFlatCandles, true)
  assert.equal(pmgFlat.isPMG, true)
  assert.equal(pmgFlat.triggerPrice, 104)
  assert.equal(pmgFlat.topTarget, 112)

  // 3. Bearish PMG with higher lows and inside bar
  const pmgBearCandles = [
    { timestamp: 1000, open: 85, high: 90, low: 84, close: 88 },  // Low 84
    { timestamp: 2000, open: 88, high: 92, low: 86, close: 90 },  // Low 86
    { timestamp: 3000, open: 90, high: 96, low: 88, close: 94 },  // Motherbar Low 88
    { timestamp: 4000, open: 93, high: 95, low: 90, close: 92 },  // Inside bar Low 90
    { timestamp: 5000, open: 93, high: 98, low: 89, close: 96 },  // Low 89 (> motherbar 88)
    { timestamp: 6000, open: 96, high: 102, low: 94, close: 100 }, // p1 trigger: 94
    { timestamp: 7000, open: 97, high: 98, low: 92, close: 93 }    // c0 (reversal breakdown under 94)
  ]
  const pmgBear = Model.detectPivotMachineGun(pmgBearCandles, false)
  assert.equal(pmgBear.isPMG, true)
  assert.equal(pmgBear.triggerPrice, 94)
  assert.equal(pmgBear.topTarget, 84)

  // 4. Target pipeline integration & Guaranteed Final Slot
  const dailyBull = [
    { timestamp: 100, open: 90, high: 100, low: 85, close: 95 },
    { timestamp: 200, open: 95, high: 120, low: 92, close: 115 },
    { timestamp: 300, open: 115, high: 125, low: 102, close: 110 }
  ]
  const chkPmg = Model.evaluateStratChecklist("AAPL", pmgInsideCandles, dailyBull, { regularMarketPrice: 107 })
  assert.equal(chkPmg.pmg.isPMG, true)
  assert.ok(chkPmg.targets.length > 0)
  // T1 is the first untagged stacked pivot above entry trigger (106) -> 110 or 111
  assert.equal(chkPmg.targets[0].name.includes("PMG"), true)
  // Final target is guaranteed to be PMG Final ($116)
  const finalT = chkPmg.targets[chkPmg.targets.length - 1]
  assert.equal(finalT.name, "60m PMG Final")
  assert.equal(finalT.price, 116)
  // Take Action Window targetPrice binds to first untagged target
  assert.equal(chkPmg.takeActionWindow.targetPrice, chkPmg.targets[0].price)

  // 5. Question 1 PMG Signal Qualification
  assert.equal(chkPmg.isTriggered, true)
  const r1 = chkPmg.rules.find(r => r.id === 1)
  assert.equal(r1.passed, true)
  assert.match(r1.detail, /PMG: \d+ Stacked Pivots/)
})

test("Contradiction 12: Broadening Formation Drawing & Zero Breach Tolerance (Truth #3)", () => {
  // 1. Verify BF_EPS_REL export and elimination of arbitrary BF_BREACH_TOL_REL
  assert.equal(typeof Model.BF_EPS_REL, "number")
  assert.equal(Model.BF_EPS_REL, 0.00001)

  // 2. Zero Breach Tolerance Test:
  // Initial swing points:
  //   idx 2: swing high a1 (high = 100)
  //   idx 4: swing high a2 (high = 102, slope = (102 - 100) / 2 = 1.0)
  //   At idx 5: projected ray is 102 + 1.0 = 103.0
  //   idx 5 prints high = 103.20 (a 20-cent poke = 0.19% breach)
  // Under the refuted 0.5% tolerance (BF_BREACH_TOL_REL = 0.005), 103.20 was within the 103.516 cushion,
  // so the stale line anchored at idx 4 was falsely retained.
  // Under canonical zero breach tolerance, any penetration beyond epsilon immediately invalidates the
  // ray and redraws the line from the new extreme at idx 5.
  const candlesBullBreach = [
    { timestamp: 1000, open: 90, high: 95, low: 88, close: 92 },
    { timestamp: 2000, open: 92, high: 94, low: 85, close: 89 },
    { timestamp: 3000, open: 90, high: 100, low: 88, close: 98 }, // a1 (idx 2)
    { timestamp: 4000, open: 98, high: 95, low: 90, close: 93 },
    { timestamp: 5000, open: 94, high: 102, low: 92, close: 101 }, // prior a2 (idx 4, proj at 5 is 103.0)
    { timestamp: 6000, open: 101, high: 103.20, low: 99, close: 102 }, // post (idx 5) breaches 103.0
    { timestamp: 7000, open: 102, high: 102.50, low: 98, close: 100 }
  ]

  const rayBull = Model.computeRayForOrigin(candlesBullBreach, 0, candlesBullBreach.length, true, 2)
  assert.ok(rayBull)
  // Anchor 2 must be redrawn immediately to the newest extreme at idx 5 (high 103.2)
  assert.equal(rayBull.anchor2.index, 5)
  assert.equal(rayBull.anchor2.price, 103.2)
  assert.equal(rayBull.anchor1.index, 2)
  assert.equal(rayBull.anchor1.price, 100)

  // 3. Lower boundary zero breach tolerance:
  //   idx 2: swing low a1 (low = 100)
  //   idx 4: swing low a2 (low = 98, slope = (98 - 100) / 2 = -1.0)
  //   At idx 5: projected lower ray is 98 - 1.0 = 97.0
  //   idx 5 prints low = 96.80 (20-cent breach below 97.0)
  const candlesBearBreach = [
    { timestamp: 1000, open: 105, high: 110, low: 103, close: 108 },
    { timestamp: 2000, open: 108, high: 109, low: 104, close: 106 },
    { timestamp: 3000, open: 104, high: 106, low: 100, close: 102 }, // a1 (idx 2, low 100)
    { timestamp: 4000, open: 102, high: 105, low: 101, close: 103 },
    { timestamp: 5000, open: 103, high: 104, low: 98, close: 99 },   // prior a2 (idx 4, low 98, proj at 5 is 97.0)
    { timestamp: 6000, open: 99, high: 100, low: 96.80, close: 97 }, // post (idx 5) breaches 97.0
    { timestamp: 7000, open: 97, high: 99, low: 97.50, close: 98 }
  ]

  const rayBear = Model.computeRayForOrigin(candlesBearBreach, 0, candlesBearBreach.length, false, 2)
  assert.ok(rayBear)
  // Anchor 2 must be redrawn immediately to the newest lower low at idx 5 (low 96.8)
  assert.equal(rayBear.anchor2.index, 5)
  assert.equal(rayBear.anchor2.price, 96.8)
  assert.equal(rayBear.anchor1.index, 2)
  assert.equal(rayBear.anchor1.price, 100)

  // 4. Sub-line bar (within boundary) does not trigger breach; anchor 2 correctly remains at idx 4
  const candlesUnderLine = [
    { timestamp: 1000, open: 90, high: 95, low: 88, close: 92 },
    { timestamp: 2000, open: 92, high: 94, low: 85, close: 89 },
    { timestamp: 3000, open: 90, high: 100, low: 88, close: 98 }, // a1 (idx 2, high 100)
    { timestamp: 4000, open: 98, high: 95, low: 90, close: 93 },
    { timestamp: 5000, open: 94, high: 104, low: 92, close: 101 }, // a2 (idx 4, high 104, slope = 2.0, proj at 5 is 106.0)
    { timestamp: 6000, open: 101, high: 103.00, low: 99, close: 102 }, // post (idx 5) = 103.00 < 106.0 and < 104
    { timestamp: 7000, open: 102, high: 101.00, low: 98, close: 100 }
  ]
  const rayUnder = Model.computeRayForOrigin(candlesUnderLine, 0, candlesUnderLine.length, true, 2)
  assert.ok(rayUnder)
  assert.equal(rayUnder.anchor1.index, 2)
  assert.equal(rayUnder.anchor2.index, 4)
  assert.equal(rayUnder.anchor2.price, 104)
  assert.equal(rayUnder.slope, 2.0)
})

test("Contradiction 8: Pre-Trade Checklist (Canonical 11 Questions vs 9 Rules)", () => {
  // 1. All 11 rationales are present, structured, and contain no emojis
  const rationales = Model.stratRuleRationales()
  assert.equal(Object.keys(rationales).length, 11)
  for (let i = 1; i <= 11; i++) {
    assert.ok(rationales[i])
    assert.equal(typeof rationales[i], "string")
    assert.ok(rationales[i].length > 15)
    assert.ok(!/[\u{1F300}-\u{1F9FF}]/u.test(rationales[i]))
  }

  // 2. Build full bullish setup (2-1-2 Bullish Continuation on 60m with Full FTFC)
  const daily = [
    { timestamp: 100, open: 140, high: 145, low: 138, close: 144 },
    { timestamp: 200, open: 144, high: 152, low: 142, close: 150 }, // p1D High = 152 (Target T2)
    { timestamp: 300, open: 148, high: 151, low: 147, close: 150.5 }
  ]
  const hourly = [
    { timestamp: 1000, open: 145, high: 148, low: 144, close: 147.5 }, // p3
    { timestamp: 2000, open: 147.5, high: 150, low: 146, close: 149 },  // p2: 2u
    { timestamp: 3000, open: 149, high: 149.8, low: 148, close: 149.2 }, // p1: 1 (Inside bar, trig = 149.80, stop = 148.00)
    { timestamp: 4000, open: 149.3, high: 150.6, low: 149.1, close: 150.2 } // c0: 2u triggered at 149.80
  ]
  const quote = { regularMarketPrice: 150.2 }

  const res = Model.evaluateStratChecklist("AAPL", hourly, daily, quote)
  assert.equal(res.totalRules, 11)
  assert.equal(res.totalCount, 11)
  assert.equal(res.rules.length, 11)
  assert.equal(res.questions.length, 11)

  // Verify all 11 Question keys and titles
  const expectedKeys = [
    "SIGNALS",
    "CREATE_NEGATE",
    "DIRECTION",
    "MAGNITUDE",
    "CONTINUITY_TYPE",
    "MOMENTUM_RETRACEMENT",
    "TIME_EXHAUSTION",
    "STOP_DEFENSE",
    "MANAGEMENT_PLAN",
    "MARKET_SECTOR",
    "BROADENING_STAGE"
  ]
  for (let idx = 0; idx < 11; idx++) {
    const q = res.rules[idx]
    assert.equal(q.id, idx + 1)
    assert.equal(q.key, expectedKeys[idx])
    assert.ok(q.title.length > 5)
    assert.ok(q.shortTitle.length > 3)
    assert.ok(q.detail.length > 0)
    assert.ok(q.rationale.length > 10)
  }

  // Question 1: Actionable Signals
  const q1 = res.rules.find(r => r.key === "SIGNALS")
  assert.equal(q1.passed, true)
  assert.match(q1.detail, /2-1-2 Up/)

  // Question 2: Create & Negate
  const q2 = res.rules.find(r => r.key === "CREATE_NEGATE")
  assert.equal(q2.passed, true)
  assert.match(q2.detail, /Works ➔ /)
  assert.match(q2.detail, /Negated @ Stop \$148\.00/)

  // Question 3: Direction of Control
  const q3 = res.rules.find(r => r.key === "DIRECTION")
  assert.equal(q3.passed, true)

  // Question 4: Magnitude & Targets
  const q4 = res.rules.find(r => r.key === "MAGNITUDE")
  assert.equal(q4.passed, true)
  assert.match(q4.detail, /T1:/)

  // Question 5: Full vs Partial FTFC
  const q5 = res.rules.find(r => r.key === "CONTINUITY_TYPE")
  assert.equal(q5.passed, true)
  assert.match(q5.detail, /Full 4\/4 Continuity \(Full Size\)/)

  // Question 6: Momentum vs Retracement (One-Bar Test)
  const q6 = res.rules.find(r => r.key === "MOMENTUM_RETRACEMENT")
  assert.equal(q6.passed, true)
  assert.match(q6.detail, /Momentum/)

  // Question 7: Time Exhaustion
  const q7 = res.rules.find(r => r.key === "TIME_EXHAUSTION")
  assert.equal(q7.passed, true)

  // Question 8: Level of Defense
  const q8 = res.rules.find(r => r.key === "STOP_DEFENSE")
  assert.equal(q8.passed, true)
  assert.match(q8.detail, /Stop-Loss: \$148\.00/)

  // Question 9: Management Plan (Roadmap)
  const q9 = res.rules.find(r => r.key === "MANAGEMENT_PLAN")
  assert.equal(q9.passed, true)
  assert.match(q9.detail, /Enter @ Trig \$149\.80 ➔ Scale @ T1 \$152\.00/)
  assert.match(q9.detail, /Exit @ Stop \$148\.00 \[In-Force\]/)

  // Question 10: Sector & Market Context
  const q10 = res.rules.find(r => r.key === "MARKET_SECTOR")
  assert.equal(q10.passed, true)

  // Question 11: Broadening Formation Stage
  const q11 = res.rules.find(r => r.key === "BROADENING_STAGE")
  assert.equal(q11.passed, true)
  assert.match(q11.detail, /Standard Range/)

  // Tradeability & Badge formatting
  assert.equal(res.passedCount, 11)
  assert.equal(res.isTradeable, true)
  assert.equal(res.badgeText, "11/11")
  assert.match(res.statusTag, /TRADEABLE.*All 11 Questions Verified/)
})
