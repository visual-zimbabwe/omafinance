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

test("computeSectorBreadth counts 2u, 2d, 1, 3, 2u Red, and 2d Green with live quotes", () => {
  const holdings = [
    { symbol: "AAA", name: "Alpha Inc", pctVal: 25 },
    { symbol: "BBB", name: "Beta Corp", pctVal: 25 },
    { symbol: "CCC", name: "Gamma Ltd", pctVal: 15 },
    { symbol: "DDD", name: "Delta Co", pctVal: 15 },
    { symbol: "EEE", name: "Epsilon Co", pctVal: 10 },
    { symbol: "FFF", name: "Zeta Co", pctVal: 10 }
  ]

  const base = { open: 100, high: 105, low: 95, close: 102 }
  const candlesMap = {
    // 2u green
    "AAA": [base, { open: 103, high: 108, low: 101, close: 107 }],
    // 2u red (broke 105 high, closed below open)
    "BBB": [base, { open: 104, high: 107, low: 98, close: 101 }],
    // 2d red (live quote pushes low below 95)
    "CCC": [base, { open: 99, high: 101, low: 96, close: 97 }],
    // 2d green (broke 95 low, closed above open)
    "DDD": [base, { open: 96, high: 102, low: 93, close: 100 }],
    // 1 inside bar
    "EEE": [base, { open: 98, high: 103, low: 97, close: 101 }],
    // 3 outside bar
    "FFF": [base, { open: 100, high: 108, low: 92, close: 104 }]
  }

  const liveQuotes = {
    "CCC": { regularMarketPrice: 92 }
  }

  const metrics = Model.computeSectorBreadth(holdings, candlesMap, liveQuotes)

  assert.equal(metrics.totalHoldings, 6)
  assert.equal(metrics.count2u, 2)
  assert.equal(metrics.count2d, 2)
  assert.equal(metrics.count1, 1)
  assert.equal(metrics.count3, 1)
  assert.equal(metrics.countF2u, 1)
  assert.equal(metrics.countF2d, 1)
  assert.equal(Math.round(metrics.pct2u), 33)
  assert.equal(Math.round(metrics.pct2d), 33)
  assert.equal(Math.round(metrics.pct1), 17)
  assert.equal(Math.round(metrics.pct3), 17)
  assert.equal(Math.round(metrics.pctF2u), 17)
  assert.equal(Math.round(metrics.pctF2d), 17)
  assert.equal(metrics.isSimultaneous2u, false)
  assert.equal(metrics.isSimultaneous2d, false)
  assert.equal(Model.detectStratAttack, undefined)
  assert.equal(Model.computeBasketAttackMetrics, undefined)
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

test("setup alert helpers normalize sources, classify Reversal vs Continuation separately, evaluate In-Force & scenarios, and persist state", () => {
  // 1. Default and normalized alert sources
  assert.deepEqual(Model.defaultAlertSources(), ["@MARKET"])
  assert.deepEqual(Model.normalizeAlertSources(undefined), ["@MARKET"])
  assert.deepEqual(Model.normalizeAlertSources([]), [])
  assert.deepEqual(Model.normalizeAlertSources([" @m ", "smh", "XLK", "@e", "@unknown", "SMH"]), ["@MARKET", "SMH", "XLK", "@ENERGY"])

  // 2. Setup group names keep Reversal & Continuation distinct
  assert.equal(Model.setupGroupName({ code: "2d-1-2u", category: "inside_reversal" }), "2-1-2 Reversal")
  assert.equal(Model.setupGroupName({ code: "2u-1-2d", category: "inside_reversal" }), "2-1-2 Reversal")
  assert.equal(Model.setupGroupName({ code: "2u-1-2u", category: "inside_continuation" }), "2-1-2 Continuation")
  assert.equal(Model.setupGroupName({ code: "2d-1-2d", category: "inside_continuation" }), "2-1-2 Continuation")
  assert.equal(Model.setupGroupName({ code: "3-1-2u", category: "inside_reversal" }), "3-1-2 Reversal")
  assert.equal(Model.setupGroupName({ code: "3-1-2u", category: "inside_continuation" }), "3-1-2 Continuation")
  assert.equal(Model.setupGroupName({ code: "2d-2u", category: "2-2_reversal" }), "2-2 Reversal")
  assert.equal(Model.setupGroupName({ code: "3-2d-2u", category: "2-2_reversal" }), "3-2-2 Reversal")
  assert.equal(Model.setupGroupName({ code: "3-2u", category: "3-2_reversal" }), "3-2 Reversal")
  assert.equal(Model.setupGroupName({ code: "1-3u", category: "1-bar_revstrat" }), "1-3 RevStrat")
  assert.equal(Model.setupGroupName({ code: "1-2d-2u", category: "2-bar_revstrat" }), "1-2-2 RevStrat")
  assert.equal(Model.setupGroupName({ code: "1-3(H)-2u", category: "2-bar_revstrat" }), "1-3-2 RevStrat")
  assert.equal(Model.setupGroupName({ code: "PMG Up", category: "other" }), "PMG")
  assert.equal(Model.setupGroupName({ code: "Kicker Dn", category: "other" }), "Kicker")

  // 3. Evaluate setup alerts: 60m 2d-1-2u triggered & In-Force when close >= trigger, not In-Force on pullback
  const baseTs = Date.UTC(2026, 6, 15, 13, 30) / 1000
  const candles60 = [
    { timestamp: baseTs - 10800, open: 105, high: 106, low: 102, close: 103 }, // p3
    { timestamp: baseTs - 7200, open: 103, high: 104, low: 99, close: 100 },   // p2: 2d
    { timestamp: baseTs - 3600, open: 100.5, high: 102.5, low: 100, close: 102 }, // p1: 1 (trig=102.5)
    { timestamp: baseTs, open: 102.0, high: 103.4, low: 101.8, close: 103.2 }  // cur: 2u green, above 102.5
  ]
  const candles30 = [
    { timestamp: baseTs - 1800, open: 103, high: 104, low: 101, close: 102 },
    { timestamp: baseTs, open: 102.5, high: 102.5, low: 102.5, close: 102.5 } // flat close === open, inside bar 1
  ]
  // Build enough daily bars across 2 months for 1D, 1W, 1M derivation
  const candles1D = [
    { timestamp: Date.UTC(2026, 4, 15, 13, 30) / 1000, open: 90, high: 95, low: 88, close: 94 },
    { timestamp: Date.UTC(2026, 5, 15, 13, 30) / 1000, open: 94, high: 101, low: 93, close: 99 },
    { timestamp: Date.UTC(2026, 6, 6, 13, 30) / 1000, open: 99, high: 105, low: 98, close: 100 },
    { timestamp: Date.UTC(2026, 6, 14, 13, 30) / 1000, open: 102, high: 104, low: 100, close: 101 },
    { timestamp: Date.UTC(2026, 6, 15, 13, 30) / 1000, open: 101, high: 103.5, low: 100.5, close: 103.2 }
  ]

  const activeInForce = Model.evaluateSymbolSetupAlerts("NVDA", { "30": candles30, "60": candles60, "1D": candles1D }, { regularPrice: 103.2 }, ["SMH", "XLK"])
  const hit60 = activeInForce.find(a => a.timeframe === "60")
  assert.ok(hit60, "60m 2d-1-2u setup detected")
  assert.equal(hit60.setupGroup, "2-1-2 Reversal")
  assert.equal(hit60.setupCode, "2d-1-2u")
  assert.equal(hit60.direction, "LONG")
  assert.equal(hit60.inForce, true)
  assert.deepEqual(hit60.baskets, ["SMH", "XLK"])
  // Uppercase scenario columns + strict close > open green / close < open red / close === open flat
  assert.equal(hit60.scenarios["60"].sc, "2U")
  assert.equal(hit60.scenarios["60"].colorTone, "up")
  assert.equal(hit60.scenarios["30"].sc, "1")
  assert.equal(hit60.scenarios["30"].colorTone, "up") // live 103.2 > open 102.5

  // Pullback below trigger (102.1 < 102.5) keeps setup triggered on the bar, flips inForce to false
  const activePulledBack = Model.evaluateSymbolSetupAlerts("NVDA", { "30": candles30, "60": candles60, "1D": candles1D }, { regularPrice: 102.1 }, ["SMH", "XLK"])
  const hit60Pb = activePulledBack.find(a => a.timeframe === "60")
  assert.ok(hit60Pb)
  assert.equal(hit60Pb.inForce, false)
  assert.equal(hit60Pb.scenarios["30"].colorTone, "down") // 102.1 < 102.5

  // Exact close === open is flat
  const snapFlat = Model.computeTimeframeScenarioSnapshot({ "30": candles30 }, null)
  assert.equal(snapFlat["30"].sc, "1")
  assert.equal(snapFlat["30"].colorTone, "flat")

  // 4. 4-level Thinkorswim Watchlist grouping: Timeframe -> Up/Down -> Basket -> Setup (with multi-basket duplication)
  const grouped = Model.buildGroupedAlertWatchlist([hit60], { sourceOrder: ["SMH", "XLK"] })
  assert.equal(grouped.totalCount, 1)
  assert.equal(grouped.inForceCount, 1)
  const kinds = grouped.rows.map(r => r.kind)
  assert.deepEqual(kinds, ["tf", "direction", "basket", "setup", "row", "basket", "setup", "row"])
  assert.equal(grouped.rows[0].label, "60m")
  assert.equal(grouped.rows[0].depth, 0)
  assert.equal(grouped.rows[1].label, "BREAKING UP")
  assert.equal(grouped.rows[1].depth, 1)
  assert.equal(grouped.rows[2].label, "SMH")
  assert.equal(grouped.rows[2].depth, 2)
  assert.equal(grouped.rows[3].label, "2-1-2 Reversal")
  assert.equal(grouped.rows[3].depth, 3)
  assert.equal(grouped.rows[4].item.symbol, "NVDA")
  assert.equal(grouped.rows[4].depth, 4)
  assert.equal(grouped.rows[5].label, "XLK")
  assert.equal(grouped.rows[6].label, "2-1-2 Reversal")
  assert.equal(grouped.rows[7].item.symbol, "NVDA")

  // Separate setup groups under the same basket & direction stay distinct, and direction collapse hides children
  const contItem = Object.assign({}, hit60, {
    key: "AMD:60:1:LONG:2u-1-2u",
    symbol: "AMD",
    setupGroup: "2-1-2 Continuation",
    setupCode: "2u-1-2u",
    baskets: ["SMH"]
  })
  const multiGrouped = Model.buildGroupedAlertWatchlist([hit60, contItem], { sourceOrder: ["SMH", "XLK"] })
  const smhSetups = multiGrouped.rows.filter(r => r.kind === "setup" && r.basket === "SMH").map(r => r.label)
  assert.deepEqual(smhSetups, ["2-1-2 Reversal", "2-1-2 Continuation"])
  const collapsedDir = Model.buildGroupedAlertWatchlist([hit60, contItem], { collapsed: { "dir:60:LONG": true } })
  assert.deepEqual(collapsedDir.rows.map(r => r.kind), ["tf", "direction"])

  // Sortable columns within groups: ticker (asc/desc), inForce (desc/asc), and timeframe scenario rank (3 > 2U > 2D > 1, green > red, missing last)
  const sortItems = [
    Object.assign({}, hit60, {
      key: "MSFT:60:1:LONG:2d-1-2u",
      symbol: "MSFT",
      inForce: false,
      triggeredAt: 300,
      baskets: ["SMH"],
      scenarios: { "30": { sc: "1", colorTone: "down" }, "60": { sc: "2U", colorTone: "up" }, "1D": { sc: "2D", colorTone: "up" } }
    }),
    Object.assign({}, hit60, {
      key: "AAPL:60:1:LONG:2d-1-2u",
      symbol: "AAPL",
      inForce: true,
      triggeredAt: 100,
      baskets: ["SMH"],
      scenarios: { "30": { sc: "3", colorTone: "up" }, "60": { sc: "2U", colorTone: "up" }, "1D": { sc: "3", colorTone: "down" } }
    }),
    Object.assign({}, hit60, {
      key: "NVDA:60:1:LONG:2d-1-2u",
      symbol: "NVDA",
      inForce: true,
      triggeredAt: 200,
      baskets: ["SMH"],
      scenarios: { "30": { sc: "3", colorTone: "down" }, "60": { sc: "2U", colorTone: "up" }, "1D": { sc: "-", colorTone: "flat" } }
    })
  ]
  const rowSymbols = (opts) => Model.buildGroupedAlertWatchlist(sortItems, opts).rows.filter(r => r.kind === "row").map(r => r.item.symbol)
  assert.deepEqual(rowSymbols({ sortKey: "ticker", sortAsc: true }), ["AAPL", "MSFT", "NVDA"])
  assert.deepEqual(rowSymbols({ sortKey: "ticker", sortAsc: false }), ["NVDA", "MSFT", "AAPL"])
  assert.deepEqual(rowSymbols({ sortKey: "inForce", sortAsc: false }), ["NVDA", "AAPL", "MSFT"])
  assert.deepEqual(rowSymbols({ sortKey: "inForce", sortAsc: true }), ["MSFT", "NVDA", "AAPL"])
  // 30m scenario desc: 3 green (AAPL) > 3 red (NVDA) > 1 red (MSFT)
  assert.deepEqual(rowSymbols({ sortKey: "30", sortAsc: false }), ["AAPL", "NVDA", "MSFT"])
  // 30m scenario asc: 1 red (MSFT) < 3 red (NVDA) < 3 green (AAPL)
  assert.deepEqual(rowSymbols({ sortKey: "30", sortAsc: true }), ["MSFT", "NVDA", "AAPL"])
  // Missing ("-") always stays at the bottom for both asc and desc
  assert.deepEqual(rowSymbols({ sortKey: "1D", sortAsc: false }), ["AAPL", "MSFT", "NVDA"])
  assert.deepEqual(rowSymbols({ sortKey: "1D", sortAsc: true }), ["MSFT", "AAPL", "NVDA"])

  // Multi-column sort locking: lock 1M first, then sub-sort ties by 1W, then lock 1W and sub-sort by ticker
  const chainedItems = [
    Object.assign({}, hit60, {
      key: "TSLA:60:1:LONG:2d-1-2u",
      symbol: "TSLA",
      inForce: true,
      triggeredAt: 100,
      baskets: ["SMH"],
      scenarios: { "1M": { sc: "2U", colorTone: "up" }, "1W": { sc: "1", colorTone: "up" }, "1D": { sc: "2U", colorTone: "up" } }
    }),
    Object.assign({}, hit60, {
      key: "NVDA:60:1:LONG:2d-1-2u",
      symbol: "NVDA",
      inForce: true,
      triggeredAt: 200,
      baskets: ["SMH"],
      scenarios: { "1M": { sc: "2U", colorTone: "up" }, "1W": { sc: "3", colorTone: "up" }, "1D": { sc: "2U", colorTone: "up" } }
    }),
    Object.assign({}, hit60, {
      key: "AMD:60:1:LONG:2d-1-2u",
      symbol: "AMD",
      inForce: true,
      triggeredAt: 300,
      baskets: ["SMH"],
      scenarios: { "1M": { sc: "2U", colorTone: "up" }, "1W": { sc: "3", colorTone: "up" }, "1D": { sc: "1", colorTone: "down" } }
    }),
    Object.assign({}, hit60, {
      key: "AVGO:60:1:LONG:2d-1-2u",
      symbol: "AVGO",
      inForce: true,
      triggeredAt: 400,
      baskets: ["SMH"],
      scenarios: { "1M": { sc: "3", colorTone: "up" }, "1W": { sc: "1", colorTone: "down" }, "1D": { sc: "1", colorTone: "down" } }
    })
  ]
  const chainedSyms = (specs) => Model.buildGroupedAlertWatchlist(chainedItems, { sortSpecs: specs }).rows.filter(r => r.kind === "row").map(r => r.item.symbol)

  // Step 1: click 1M, lock 1M, then click 1W
  let specs = Model.applyAlertSortClick([], "1M")
  assert.deepEqual(specs, [{ key: "1M", asc: false, locked: false }])
  specs = Model.toggleAlertSortLock(specs, "1M")
  assert.deepEqual(specs, [{ key: "1M", asc: false, locked: true }])
  specs = Model.applyAlertSortClick(specs, "1W")
  assert.deepEqual(specs, [
    { key: "1M", asc: false, locked: true },
    { key: "1W", asc: false, locked: false }
  ])
  // AVGO has 1M=3g (#1); among 1M=2Ug ties, AMD & NVDA have 1W=3g (AMD newer trigger), TSLA has 1W=1g
  assert.deepEqual(chainedSyms(specs), ["AVGO", "AMD", "NVDA", "TSLA"])

  // Step 2: lock 1W too, then click ticker (asc A->Z) to sort within 1M+1W ties
  specs = Model.toggleAlertSortLock(specs, "1W")
  specs = Model.applyAlertSortClick(specs, "ticker")
  assert.deepEqual(chainedSyms(specs), ["AVGO", "AMD", "NVDA", "TSLA"])
  // Flip ticker to desc (Z->A): NVDA before AMD while AVGO stays #1 (1M locked) and TSLA stays last (1W locked)
  specs = Model.applyAlertSortClick(specs, "ticker")
  assert.deepEqual(chainedSyms(specs), ["AVGO", "NVDA", "AMD", "TSLA"])

  // Step 3: click locked 1M header to flip 1M to asc (2Ug before 3g) without losing locks
  specs = Model.applyAlertSortClick(specs, "1M")
  assert.equal(specs[0].locked, true)
  assert.equal(specs[0].asc, true)
  assert.deepEqual(chainedSyms(specs), ["NVDA", "AMD", "TSLA", "AVGO"])

  // Step 4: unlock 1M promotes 1W to priority #1
  specs = Model.toggleAlertSortLock(specs, "1M")
  assert.equal(specs[0].key, "1W")
  assert.equal(specs[0].locked, true)
  assert.deepEqual(chainedSyms(specs), ["NVDA", "AMD", "TSLA", "AVGO"])

  // inForceOnly filter hides pulled-back setups
  const filteredOut = Model.buildGroupedAlertWatchlist([hit60Pb], { inForceOnly: true })
  assert.equal(filteredOut.totalCount, 0)
  assert.equal(filteredOut.rows.length, 0)

  // 5. Notification & Discord payload formatting (single + coalesced burst)
  const singleNotif = Model.formatSetupAlertNotification([hit60], 1795200000000)
  assert.match(singleNotif.title, /NVDA/)
  assert.match(singleNotif.body, /Breaking Up/)
  const singleDiscord = JSON.parse(singleNotif.discordPayload)
  assert.match(singleDiscord.content, /NVDA/)

  const burstNotif = Model.formatSetupAlertNotification([hit60, Object.assign({}, hit60, { symbol: "AMD", key: "AMD:60:1:LONG:2d-1-2u" })], 1795200000000)
  assert.match(burstNotif.title, /2 Setup Alerts Triggered/)
  assert.equal(burstNotif.logEntries.length, 2)

  // 6. State serialization & parsing persists alertSources, alertsAutoOpen, firedSetupKeys and ignores legacy symbolLevels
  const serialized = Model.serializeState(
    ["SPY"],
    ["SPY"],
    "1D",
    "2x2",
    { symbol: true, timeframe: false, crosshair: true, time: true },
    ["SPY"],
    {},
    {},
    "",
    ["60", "1D", "1W", "1M"],
    [-1, -1, -1, -1, -1],
    {
      alertSources: ["@MARKET", "SMH", "XLK"],
      alertsAutoOpen: false,
      firedSetupKeys: { [hit60.key]: Date.now() },
      alertLog: singleNotif.logEntries
    }
  )
  const parsedState = Model.parseState(serialized)
  assert.deepEqual(parsedState.alertSources, ["@MARKET", "SMH", "XLK"])
  assert.equal(parsedState.alertsAutoOpen, false)
  assert.ok(parsedState.firedSetupKeys && parsedState.firedSetupKeys[hit60.key] > 0)
  assert.equal(parsedState.alertLog.length, 1)
  assert.equal(parsedState.symbolLevels, undefined)

  // Legacy JSON containing symbolLevels parses cleanly without error
  const legacyParsed = Model.parseState(JSON.stringify({ watchlist: ["SPY"], symbolLevels: { SPY: [{ price: 500 }] } }))
  assert.deepEqual(legacyParsed.watchlist, ["SPY"])
  assert.equal(legacyParsed.symbolLevels, undefined)
})

test("Update 3: computeSectorBreadth classifies all 2u bars under Truth #1 while distinguishing failed red 2u bars", () => {
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
  const metrics = Model.computeSectorBreadth(holdings, candlesMap, null)
  assert.equal(metrics.count2u, 2) // Both AAA and BBB took out prior high -> Truth #1 Scenario 2u
  assert.equal(metrics.pct2u, 100)
  assert.equal(metrics.countF2u, 1)
  assert.equal(metrics.pctF2u, 50)
  assert.equal(metrics.countF2d, 0)
  assert.equal(metrics.pctF2d, 0)
  assert.equal(metrics.isSimultaneous2u, true)
})

test("Update 5 & 6: detectCandleShape Hammer & Shooter detection", () => {
  const hammer = Model.detectCandleShape({ open: 108, high: 109, low: 100, close: 108.5 })
  assert.equal(hammer.isHammer, true)
  assert.equal(hammer.shape, "Hammer")
  const shooter = Model.detectCandleShape({ open: 101.5, high: 110, low: 100, close: 101 })
  assert.equal(shooter.isShooter, true)
  assert.equal(shooter.shape, "Shooter")
})

test("Batch 2 Update 4: detectCandleShape removes Doji/Engulfing and 3-2 reversal requires opposite color on bar 3", () => {
  const prev = { open: 102, high: 105, low: 100, close: 104 }
  const neutralBar = Model.detectCandleShape({ open: 102.2, high: 108, low: 97, close: 102.8 }, prev)
  assert.equal(neutralBar.isDoji, undefined)
  assert.equal(neutralBar.isEngulfing, undefined)
  assert.equal(neutralBar.shape, null)

  const wideGreenBar = Model.detectCandleShape({ open: 98, high: 108, low: 97, close: 107.2 }, prev)
  assert.equal(wideGreenBar.isEngulfing, undefined)
  assert.equal(wideGreenBar.shape, null)

  // Same-color 3(green)-2u is not a 3-2 reversal
  const hourlyGreen32 = [
    { timestamp: 1000, open: 102, high: 105, low: 100, close: 104 },
    { timestamp: 2000, open: 102.2, high: 108, low: 97, close: 106.8 }, // Green 3
    { timestamp: 3000, open: 107, high: 110.5, low: 106.5, close: 110 }
  ]
  assert.equal(Model.detectStratSetupOnCandles("60", hourlyGreen32, { regularMarketPrice: 110 }), null)

  // Opposite-color 3(red)-2u(green) is a valid 3-2 Reversal Up
  const hourlyRed32 = [
    { timestamp: 1000, open: 102, high: 105, low: 100, close: 104 },
    { timestamp: 2000, open: 106.8, high: 108, low: 97, close: 101.2 }, // Red 3
    { timestamp: 3000, open: 107, high: 110.5, low: 106.5, close: 110 }
  ]
  const resRed32 = Model.detectStratSetupOnCandles("60", hourlyRed32, { regularMarketPrice: 110 })
  assert.ok(resRed32 && resRed32.valid)
  assert.equal(resRed32.name, "60m 3-2 Reversal Up")
})

test("Batch 2 Update 5: I-O-I (1-3-1-2), Pivot Machine Gun (PMG), and Kicker pattern detection", () => {
  // 1. 1-3-1-2u I-O-I in detectStratSetupOnCandles
  const ioiCandles = [
    { timestamp: 1000, open: 100, high: 110, low: 90, close: 105 },  // p4: Mother
    { timestamp: 2000, open: 102, high: 106, low: 95, close: 104 },  // p3: 1 (inside p4)
    { timestamp: 3000, open: 104, high: 109, low: 92, close: 96 },   // p2: 3 (outside p3)
    { timestamp: 4000, open: 97, high: 103, low: 95, close: 102 },   // p1: 1 (inside p2, trigger=103)
    { timestamp: 5000, open: 102, high: 105, low: 101, close: 104.5 } // cur: 2u breakout
  ]
  const setupIoi = Model.detectStratSetupOnCandles("60", ioiCandles, { regularMarketPrice: 104.5 })
  assert.ok(setupIoi && setupIoi.valid)
  assert.equal(setupIoi.name, "60m 3-1-2 Reversal Up")

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

test("alert gate timeframes normalize, qualify tickers via OR across all 5 TFs (both LONG and SHORT), and persist in state", () => {
  // 1. Normalization supports arrays, comma strings, shorthands, deduplication, and canonical order
  assert.deepEqual(Model.normalizeAlertGateTimeframes(undefined), [])
  assert.deepEqual(Model.normalizeAlertGateTimeframes([]), [])
  assert.deepEqual(Model.normalizeAlertGateTimeframes(["1m", "w", "60m", "30m", "d", "1W", "bad"]), ["30", "60", "1D", "1W", "1M"])
  assert.deepEqual(Model.normalizeAlertGateTimeframes("1M, 1W, 1w"), ["1W", "1M"])

  const nvda1W = { key: "NVDA:1W:1:LONG:2d-1-2u", symbol: "NVDA", timeframe: "1W", direction: "LONG", isLong: true }
  const nvda30Short = { key: "NVDA:30:2:SHORT:2u-1-2d", symbol: "NVDA", timeframe: "30", direction: "SHORT", isLong: false }
  const nvda60Long = { key: "NVDA:60:3:LONG:2d-2u", symbol: "NVDA", timeframe: "60", direction: "LONG", isLong: true }
  const amd30 = { key: "AMD:30:2:LONG:2d-1-2u", symbol: "AMD", timeframe: "30", direction: "LONG", isLong: true }
  const amd1D = { key: "AMD:1D:2:SHORT:2u-2d", symbol: "AMD", timeframe: "1D", direction: "SHORT", isLong: false }
  const msft1M = { key: "MSFT:1M:1:SHORT:2u-1-2d", symbol: "MSFT", timeframe: "1M", direction: "SHORT", isLong: false }
  const msft60Long = { key: "MSFT:60:3:LONG:2d-1-2u", symbol: "MSFT", timeframe: "60", direction: "LONG", isLong: true }

  const allItems = [nvda1W, nvda30Short, nvda60Long, amd30, amd1D, msft1M, msft60Long]

  // 2. Empty gate passes everything unchanged
  assert.equal(Model.itemMatchesAlertGate(amd30, [amd30, amd1D], []), true)
  assert.equal(Model.filterAlertItemsByGate(allItems, []).length, allItems.length)

  // 3. Weekly-only gate: NVDA passes across 30m (SHORT), 60m (LONG), and 1W; AMD & MSFT excluded completely
  assert.deepEqual(Model.getQualifyingGateTimeframes([nvda1W, nvda30Short], ["1W"]), ["1W"])
  assert.equal(Model.itemMatchesAlertGate(nvda30Short, [nvda1W, nvda30Short], ["1W"]), true)
  assert.equal(Model.itemMatchesAlertGate(amd30, [amd30, amd1D], ["1W"]), false)
  const weeklyOnly = Model.filterAlertItemsByGate(allItems, ["1W"])
  assert.deepEqual(weeklyOnly.map(i => i.key), [nvda1W.key, nvda30Short.key, nvda60Long.key])
  assert.deepEqual(weeklyOnly[1].qualifiedBy, ["1W"])

  // 4. Weekly OR Monthly gate: NVDA (1W) and MSFT (1M) both pass across all their TFs; AMD excluded
  const weeklyOrMonthly = Model.filterAlertItemsByGate(allItems, ["1W", "1M"])
  assert.deepEqual(weeklyOrMonthly.map(i => i.key), [nvda1W.key, nvda30Short.key, nvda60Long.key, msft1M.key, msft60Long.key])
  assert.deepEqual(weeklyOrMonthly.find(i => i.key === msft60Long.key).qualifiedBy, ["1M"])

  // 5. Persistence round-trip via serializeState / parseState (empty omitted)
  const rawGated = Model.serializeState(["SPY"], ["SPY"], "1D", "2x2", {}, [], {}, {}, "", ["60"], [-1], {
    alertGateTimeframes: ["1M", "1W"]
  })
  assert.deepEqual(Model.parseState(rawGated).alertGateTimeframes, ["1W", "1M"])

  const rawEmpty = Model.serializeState(["SPY"], ["SPY"], "1D", "2x2", {}, [], {}, {}, "", ["60"], [-1], {
    alertGateTimeframes: []
  })
  assert.equal(JSON.parse(rawEmpty).alertGateTimeframes, undefined)
})

test("sector analysis: sector definitions, query parsing, scenario matching, and sorting", () => {
  // 1. Sector Definitions & Ticker Parsing
  const smh = Model.getSectorInfo("SMH")
  assert.equal(smh.symbol, "SMH")
  assert.equal(smh.name, "VanEck Semiconductor ETF")
  const xlk = Model.getSectorInfo("xlk")
  assert.equal(xlk.symbol, "XLK")
  assert.equal(xlk.name, "Technology Select Sector SPDR Fund")
  assert.equal(Model.getSectorInfo("XYZ"), null)

  assert.deepEqual(Model.parseSectorTickers("SMH"), ["SMH"])
  assert.deepEqual(Model.parseSectorTickers("SMH,XLK,DIA"), ["SMH", "XLK", "DIA"])
  assert.deepEqual(Model.parseSectorTickers("smh, xlk, dia"), ["SMH", "XLK", "DIA"])
  assert.deepEqual(Model.parseSectorTickers("SMH, XLK, SMH, DIA"), ["SMH", "XLK", "DIA"])
  assert.deepEqual(Model.parseSectorTickers("SMH, , XLK,"), ["SMH", "XLK"])
  assert.deepEqual(Model.parseSectorTickers(""), [])
  assert.deepEqual(Model.parseSectorTickers(null), [])

  // 1b. Symbol Extraction & Ticker List Formatting
  assert.deepEqual(Model.extractSymbols(["aapl", "MSFT", "aapl", "  nvda  "]), ["AAPL", "MSFT", "NVDA"])
  assert.deepEqual(Model.extractSymbols([{ symbol: "tsm" }, { symbol: "NVDA" }, { symbol: "tsm" }]), ["TSM", "NVDA"])
  assert.deepEqual(Model.extractSymbols([{ symbol: "amd" }, "intc", { symbol: "AMD" }]), ["AMD", "INTC"])
  assert.deepEqual(Model.extractSymbols([]), [])
  assert.deepEqual(Model.extractSymbols(null), [])
  assert.deepEqual(Model.extractSymbols(undefined), [])

  assert.equal(Model.formatTickerList(["aapl", "msft", "nvda"]), "AAPL, MSFT, NVDA")
  assert.equal(Model.formatTickerList([{ symbol: "nvda" }, { symbol: "amd" }]), "NVDA, AMD")
  assert.equal(Model.formatTickerList([{ symbol: "nvda" }, { symbol: "amd" }], ","), "NVDA,AMD")
  assert.equal(Model.formatTickerList([]), "")
  assert.equal(Model.formatTickerList(null), "")

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

test("shared model helpers: cacheKey, isBasketSector, chunkSymbols, and updateDevelopingCandle with ET rollover", () => {
  // 1. cacheKey
  assert.equal(Model.cacheKey("aapl", "1D"), "AAPL_1D")
  assert.equal(Model.cacheKey("smh ", "60"), "SMH_60")
  assert.equal(Model.cacheKey("nvda"), "NVDA_1D")

  // 2. isBasketSector
  assert.equal(Model.isBasketSector("SMH"), true)
  assert.equal(Model.isBasketSector("smh"), true)
  assert.equal(Model.isBasketSector("XLK"), true)
  assert.equal(Model.isBasketSector("xlk"), true)
  assert.equal(Model.isBasketSector("SPY"), false)
  assert.equal(Model.isBasketSector("XLC"), false)

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

  // 6. updateDevelopingCandle: Extended hours (pre/post/closed) gating
  const preQuote = {
    symbol: "NVDA",
    session: "pre",
    hasExtended: true,
    price: 135.0, // Pre-market surge
    regularPrice: 125.0,
    extendedPrice: 135.0,
    dayHigh: 126.0,
    dayLow: 124.0
  }
  const postQuote = {
    symbol: "NVDA",
    session: "post",
    hasExtended: true,
    price: 120.0, // After-hours drop
    regularPrice: 125.0,
    extendedPrice: 120.0,
    dayHigh: 126.0,
    dayLow: 124.0
  }
  const closedQuote = {
    symbol: "NVDA",
    session: "closed",
    price: 125.0,
    regularPrice: 125.0
  }

  // Pre-market: candles must remain completely untouched (no rollover, no high/low wicks stretched)
  const preResult = Model.updateDevelopingCandle(updated, preQuote, "1D", nextDayDate)
  assert.equal(preResult, updated) // Same reference returned
  assert.equal(preResult.length, 1) // No phantom morning bar created
  assert.equal(preResult[0].close, 107)

  // Post-market: candles must remain completely untouched
  const postResult = Model.updateDevelopingCandle(updated, postQuote, "1D", new Date(1731335400 * 1000 + 3600 * 1000))
  assert.equal(postResult, updated)
  assert.equal(postResult[0].close, 107)

  // Closed: candles must remain untouched
  const closedResult = Model.updateDevelopingCandle(updated, closedQuote, "1D", nextDayDate)
  assert.equal(closedResult, updated)

  // Regular session: normalized quote with regularPrice and dayHigh/dayLow updates developing candle
  const regularQuote = {
    symbol: "NVDA",
    session: "regular",
    price: 109.5,
    regularPrice: 109.5,
    dayHigh: 111.0,
    dayLow: 97.0
  }
  const regResult = Model.updateDevelopingCandle(updated, regularQuote, "1D", new Date(1731335400 * 1000 + 3600 * 1000))
  assert.equal(regResult.length, 1)
  assert.equal(regResult[0].close, 109.5)
  assert.equal(regResult[0].high, 111.0)
  assert.equal(regResult[0].low, 97.0)

  // Live session (Crypto 24/7): updates developing candle
  const cryptoQuote = {
    symbol: "BTC-USD",
    session: "live",
    price: 90500,
    regularPrice: 90500
  }
  const cryptoResult = Model.updateDevelopingCandle(updated, cryptoQuote, "1D", new Date(1731335400 * 1000 + 3600 * 1000))
  assert.equal(cryptoResult.length, 1)
  assert.equal(cryptoResult[0].close, 90500)
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

  const metrics70 = Model.computeSectorBreadth(holdings, candlesMap, null)
  assert.equal(metrics70.count2u, 7)
  assert.equal(metrics70.pct2u, 70)
  assert.equal(metrics70.isSimultaneous2u, false)
  assert.equal(metrics70.isSimultaneous2d, false)

  // Now make 8th holding break 2u -> 8 out of 10 (80% -> true)
  candlesMap["SYM7"] = [
    { open: 100, high: 105, low: 95, close: 104 },
    { open: 104, high: 109, low: 103, close: 108 } // 2u Green
  ]
  const metrics80 = Model.computeSectorBreadth(holdings, candlesMap, null)
  assert.equal(metrics80.count2u, 8)
  assert.equal(metrics80.pct2u, 80)
  assert.equal(metrics80.isSimultaneous2u, true)
  assert.equal(metrics80.isSimultaneous2d, false)

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
  const metrics11of14 = Model.computeSectorBreadth(holdings14, candles14, null)
  assert.equal(metrics11of14.count2d, 11)
  assert.equal(Math.round(metrics11of14.pct2d), 79)
  assert.equal(metrics11of14.isSimultaneous2d, false)

  // Add 12th 2d break -> 12 / 14 = 85.71% -> 86%
  candles14["H11"] = [
    { open: 100, high: 105, low: 95, close: 104 },
    { open: 100, high: 101, low: 91, close: 92 } // 2d Red
  ]
  const metrics12of14 = Model.computeSectorBreadth(holdings14, candles14, null)
  assert.equal(metrics12of14.count2d, 12)
  assert.equal(Math.round(metrics12of14.pct2d), 86)
  assert.equal(metrics12of14.isSimultaneous2d, true)
})

test("Contradiction 3: Pure Canon Triggered vs. In-Force Definition (stratInForce and computeStratDetails)", () => {
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
})

test("Contradiction 7: 1-3-2 Rev Strat Canonical Validation (1-3-[Hammer/Shooter]-2)", () => {
  const hourlyBullHammer = [
    { timestamp: 1000, open: 202, high: 210, low: 200, close: 208 }, // p3
    { timestamp: 2000, open: 204, high: 208, low: 202, close: 206 }, // p2: 1 (inside p3)
    { timestamp: 3000, open: 209.5, high: 212, low: 198, close: 211 }, // p1: 3 Outside Bar Hammer
    { timestamp: 4000, open: 211.5, high: 213, low: 211, close: 212.5 } // c0: 2u triggered at 212
  ]
  const setupBull = Model.detectStratSetupOnCandles("60", hourlyBullHammer, { regularMarketPrice: 212.5 })
  assert.ok(setupBull && setupBull.valid)
  assert.match(setupBull.name, /1-3-2 RevStrat Up/)

  const hourlyBullInvalid = [
    { timestamp: 1000, open: 202, high: 210, low: 200, close: 208 }, // p3
    { timestamp: 2000, open: 204, high: 208, low: 202, close: 206 }, // p2: 1 (inside p3)
    { timestamp: 3000, open: 206, high: 212, low: 198, close: 200 }, // p1: 3 Outside Bar (not Hammer)
    { timestamp: 4000, open: 211.5, high: 213, low: 211, close: 212.5 } // c0: 2u
  ]
  assert.equal(Model.detectStratSetupOnCandles("60", hourlyBullInvalid, { regularMarketPrice: 212.5 }), null)

  const hourlyBearShooter = [
    { timestamp: 1000, open: 202, high: 210, low: 200, close: 208 }, // p3
    { timestamp: 2000, open: 204, high: 208, low: 202, close: 206 }, // p2: 1 (inside p3)
    { timestamp: 3000, open: 200, high: 212, low: 198, close: 199 }, // p1: 3 Outside Bar Shooter
    { timestamp: 4000, open: 198.5, high: 199, low: 197, close: 197.5 } // c0: 2d triggered at 198
  ]
  const setupBear = Model.detectStratSetupOnCandles("60", hourlyBearShooter, { regularMarketPrice: 197.5 })
  assert.ok(setupBear && setupBear.valid)
  assert.match(setupBear.name, /1-3-2 RevStrat Down/)

  const hourlyBearInvalid = [
    { timestamp: 1000, open: 202, high: 210, low: 200, close: 208 }, // p3
    { timestamp: 2000, open: 204, high: 208, low: 202, close: 206 }, // p2: 1 (inside p3)
    { timestamp: 3000, open: 202, high: 212, low: 198, close: 210 }, // p1: 3 Outside Bar (not Shooter)
    { timestamp: 4000, open: 198.5, high: 199, low: 197, close: 197.5 } // c0: 2d
  ]
  assert.equal(Model.detectStratSetupOnCandles("60", hourlyBearInvalid, { regularMarketPrice: 197.5 }), null)

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

test("bar count constants and clampBarCount helper", () => {
  assert.equal(Model.MIN_BAR_COUNT, 1)
  assert.equal(Model.DEFAULT_ANALYSIS_BAR_COUNT, 8)

  // Valid values at and above min (1)
  assert.equal(Model.clampBarCount(20), 20)
  assert.equal(Model.clampBarCount("45"), 45)
  assert.equal(Model.clampBarCount(8), 8)
  assert.equal(Model.clampBarCount(5), 5)
  assert.equal(Model.clampBarCount("3"), 3)
  assert.equal(Model.clampBarCount(1), 1)

  // Values below min clamped to 1
  assert.equal(Model.clampBarCount(0), 1)
  assert.equal(Model.clampBarCount(-10), 1)

  // Non-numeric and empty fallbacks still default to 8
  assert.equal(Model.clampBarCount(""), 8)
  assert.equal(Model.clampBarCount("abc"), 8)
  assert.equal(Model.clampBarCount(null), 8)
  assert.equal(Model.clampBarCount(undefined), 8)
  assert.equal(Model.clampBarCount(NaN), 8)

  // Custom fallback
  assert.equal(Model.clampBarCount("invalid", 14), 14)
  assert.equal(Model.clampBarCount("invalid", 4), 4)
  assert.equal(Model.clampBarCount("invalid", 0), 1)
})

test("scenario filter: composite tokens, shapes (h, s, 2us, 2ds, 2dh, 2uh, 3s, 3h), negation, and sequences", () => {
  const p0 = { open: 100, high: 110, low: 90, close: 105 }

  // 1. 2uh: 2u Hammer (broke high 115 > 110, low 95 > 90, closed near high with long lower wick)
  const twoUHammer = [p0, { open: 113, high: 115, low: 95, close: 114.5 }]
  assert.equal(Model.matchesScenarioQuery(twoUHammer, null, "2uh"), true)
  assert.equal(Model.matchesScenarioQuery(twoUHammer, null, "2u h"), true)
  assert.equal(Model.matchesScenarioQuery(twoUHammer, null, "h"), true)
  assert.equal(Model.matchesScenarioQuery(twoUHammer, null, "2u hammer"), true)
  assert.equal(Model.matchesScenarioQuery(twoUHammer, null, "2us"), false)
  assert.equal(Model.matchesScenarioQuery(twoUHammer, null, "s"), false)
  assert.equal(Model.matchesScenarioQuery(twoUHammer, null, "2"), true)
  assert.equal(Model.matchesScenarioQuery(twoUHammer, null, "!r"), true)
  assert.equal(Model.matchesScenarioQuery(twoUHammer, null, "!s"), true)
  assert.equal(Model.matchesScenarioQuery(twoUHammer, null, "2u !r"), true)

  // 2. 2us: 2u Shooter (broke high 115 > 110, low 95 > 90, rejected down near low with long upper wick)
  const twoUShooter = [p0, { open: 96, high: 115, low: 95, close: 95.5 }]
  assert.equal(Model.matchesScenarioQuery(twoUShooter, null, "2us"), true)
  assert.equal(Model.matchesScenarioQuery(twoUShooter, null, "2u s"), true)
  assert.equal(Model.matchesScenarioQuery(twoUShooter, null, "s"), true)
  assert.equal(Model.matchesScenarioQuery(twoUShooter, null, "2u shooter"), true)
  assert.equal(Model.matchesScenarioQuery(twoUShooter, null, "2uh"), false)
  assert.equal(Model.matchesScenarioQuery(twoUShooter, null, "h"), false)
  assert.equal(Model.matchesScenarioQuery(twoUShooter, null, "2u !r"), false) // It IS red, so !r fails
  assert.equal(Model.matchesScenarioQuery(twoUShooter, null, "2u r"), true)
  assert.equal(Model.matchesScenarioQuery(twoUShooter, null, "2ur"), true)
  assert.equal(Model.matchesScenarioQuery(twoUShooter, null, "f2u"), true)

  // 3. 2dh: 2d Hammer (broke low 85 < 90, high 108 <= 110, long lower wick)
  const twoDHammer = [p0, { open: 105, high: 108, low: 85, close: 107 }]
  assert.equal(Model.matchesScenarioQuery(twoDHammer, null, "2dh"), true)
  assert.equal(Model.matchesScenarioQuery(twoDHammer, null, "2d h"), true)
  assert.equal(Model.matchesScenarioQuery(twoDHammer, null, "h"), true)
  assert.equal(Model.matchesScenarioQuery(twoDHammer, null, "2ds"), false)
  assert.equal(Model.matchesScenarioQuery(twoDHammer, null, "f2d"), true)
  assert.equal(Model.matchesScenarioQuery(twoDHammer, null, "2dg"), true)

  // 4. 2ds: 2d Shooter (broke low 85 < 90, high 108 <= 110, rejected at high)
  const twoDShooter = [p0, { open: 87, high: 108, low: 85, close: 85.5 }]
  assert.equal(Model.matchesScenarioQuery(twoDShooter, null, "2ds"), true)
  assert.equal(Model.matchesScenarioQuery(twoDShooter, null, "2d s"), true)
  assert.equal(Model.matchesScenarioQuery(twoDShooter, null, "s"), true)
  assert.equal(Model.matchesScenarioQuery(twoDShooter, null, "2dh"), false)
  assert.equal(Model.matchesScenarioQuery(twoDShooter, null, "2dr"), true)

  // 5. 3h: 3 Hammer (broke both 115 > 110 and 85 < 90, closed top 33%)
  const threeHammer = [p0, { open: 112, high: 115, low: 85, close: 114 }]
  assert.equal(Model.matchesScenarioQuery(threeHammer, null, "3h"), true)
  assert.equal(Model.matchesScenarioQuery(threeHammer, null, "3 h"), true)
  assert.equal(Model.matchesScenarioQuery(threeHammer, null, "h"), true)
  assert.equal(Model.matchesScenarioQuery(threeHammer, null, "3s"), false)
  assert.equal(Model.matchesScenarioQuery(threeHammer, null, "3"), true)
  assert.equal(Model.matchesScenarioQuery(threeHammer, null, "outside"), true)
  assert.equal(Model.matchesScenarioQuery(threeHammer, null, "!3"), false)

  // 6. 3s: 3 Shooter (broke both 115 > 110 and 85 < 90, closed bottom 33%)
  const threeShooter = [p0, { open: 88, high: 115, low: 85, close: 86 }]
  assert.equal(Model.matchesScenarioQuery(threeShooter, null, "3s"), true)
  assert.equal(Model.matchesScenarioQuery(threeShooter, null, "3 s"), true)
  assert.equal(Model.matchesScenarioQuery(threeShooter, null, "s"), true)
  assert.equal(Model.matchesScenarioQuery(threeShooter, null, "3h"), false)
  assert.equal(Model.matchesScenarioQuery(threeShooter, null, "3"), true)

  // 7. Directional Sequences and Negation
  const insideCoil = [
    { open: 98, high: 115, low: 88, close: 105 }, // motherbar
    { open: 100, high: 108, low: 92, close: 102 }, // 1 inside bar
    { open: 105, high: 112, low: 95, close: 111 }  // 2u breakout
  ]
  assert.equal(Model.matchesScenarioQuery(insideCoil, null, "2-1-2"), true)
  assert.equal(Model.matchesScenarioQuery(insideCoil, null, "2-1-2u"), true)
  assert.equal(Model.matchesScenarioQuery(insideCoil, null, "2-1-2d"), false)
  assert.equal(Model.matchesScenarioQuery(insideCoil, null, "!3"), true)
  assert.equal(Model.matchesScenarioQuery(insideCoil, null, "!1"), true) // current is 2u, not 1

  // 8. Compound OR query with shorthands
  const nonMatchingBar = [p0, { open: 98, high: 105, low: 95, close: 102 }]
  assert.equal(Model.matchesScenarioQuery(twoUHammer, null, "3s, 2ds, 2uh"), true)
  assert.equal(Model.matchesScenarioQuery(threeShooter, null, "3s, 2ds, 2uh"), true)
  assert.equal(Model.matchesScenarioQuery(twoDShooter, null, "3s, 2ds, 2uh"), true)
  assert.equal(Model.matchesScenarioQuery(nonMatchingBar, null, "3s, 2ds, 2uh"), false)
})

test("WCAG contrast, theme-adaptive dim/semantic colors, and quotedFontFamily", () => {
  const darkBg = "#11111b"
  const darkFg = "#cdd6f4"
  const lightBg = "#eff1f5"
  const lightFg = "#4c4f69"

  // Semantic up/down colors meet WCAG AA (>= 4.5:1) on both dark and light themes
  assert.ok(Model.contrastRatio(Model.accessibleSemanticColor("up", darkBg), darkBg) >= 4.5)
  assert.ok(Model.contrastRatio(Model.accessibleSemanticColor("down", darkBg), darkBg) >= 4.5)
  assert.ok(Model.contrastRatio(Model.accessibleSemanticColor("up", lightBg), lightBg) >= 4.5)
  assert.ok(Model.contrastRatio(Model.accessibleSemanticColor("down", lightBg), lightBg) >= 4.5)

  // Dim color meets WCAG AA (>= 4.5:1) on both dark and light themes
  assert.ok(Model.contrastRatio(Model.accessibleDimColor(darkFg, darkBg), darkBg) >= 4.5)
  assert.ok(Model.contrastRatio(Model.accessibleDimColor(lightFg, lightBg), lightBg) >= 4.5)

  // contrastForeground picks dark text on bright fills and light text on dark fills
  assert.equal(Model.contrastForeground("#4ade80"), "#0b0f14")
  assert.equal(Model.contrastForeground("#11111b"), "#ffffff")

  // quotedFontFamily quotes spaced family names for Canvas 2D
  assert.equal(Model.quotedFontFamily("JetBrainsMono Nerd Font"), '"JetBrainsMono Nerd Font"')
  assert.equal(Model.quotedFontFamily("monospace"), "monospace")
})

test("updateCachedDevelopingCandles updates only matching cached timeframes in-place and pruneChartCache keeps newest entries", () => {
  const nowDate = new Date("2026-04-10T15:00:00Z")
  const baseTs = Math.floor(new Date("2026-04-10T13:30:00Z").getTime() / 1000)
  const cache = {
    "NVDA_1D": [{ timestamp: baseTs, open: 100, high: 102, low: 99, close: 101, volume: 1000 }],
    "NVDA_60": [{ timestamp: baseTs, open: 100, high: 102, low: 99, close: 101, volume: 500 }],
    "OLD_1D": [{ timestamp: 1000, open: 10, high: 11, low: 9, close: 10, volume: 10 }],
    "MID_1D": [{ timestamp: 2000, open: 20, high: 21, low: 19, close: 20, volume: 10 }]
  }
  const changed = Model.updateCachedDevelopingCandles(cache, "NVDA", { price: 105, dayHigh: 105, dayLow: 98 }, ["1D", "60", "1D", "1W"], nowDate)
  assert.deepEqual(changed, ["NVDA_1D", "NVDA_60"])
  assert.equal(cache["NVDA_1D"][cache["NVDA_1D"].length - 1].close, 105)
  assert.equal(cache["NVDA_60"][cache["NVDA_60"].length - 1].close, 105)

  const pruned = Model.pruneChartCache(cache, 2)
  assert.equal(Object.keys(pruned).length, 2)
  assert.ok(pruned["NVDA_1D"])
  assert.ok(pruned["NVDA_60"])
  assert.equal(pruned["OLD_1D"], undefined)

  // Protected keys & LRU accessTimes preserve 1W/1M charts even when candle timestamps are older
  const mixedCache = {
    "AAPL_1M": [{ timestamp: 500, open: 100, high: 101, low: 99, close: 100, volume: 10 }],
    "AAPL_1W": [{ timestamp: 900, open: 100, high: 101, low: 99, close: 100, volume: 10 }],
    "TSLA_60": [{ timestamp: 99999, open: 200, high: 201, low: 199, close: 200, volume: 10 }],
    "MSFT_60": [{ timestamp: 99998, open: 300, high: 301, low: 299, close: 300, volume: 10 }]
  }
  const accessTimes = { "AAPL_1W": 500000, "TSLA_60": 100000, "MSFT_60": 200000 }
  const protectedKeys = { "AAPL_1M": true }
  const prunedLru = Model.pruneChartCache(mixedCache, 2, accessTimes, protectedKeys)
  assert.equal(Object.keys(prunedLru).length, 2)
  assert.ok(prunedLru["AAPL_1M"])
  assert.ok(prunedLru["AAPL_1W"])
})

test("QML QVariantList non-Array sequence compatibility for breadth, scenario filter, and developing candles", () => {
  function asQmlList(arr) {
    const obj = { length: arr.length }
    for (let i = 0; i < arr.length; i++) obj[i] = arr[i]
    return obj
  }

  const cNvda = asQmlList([
    { timestamp: 1000, open: 100, high: 105, low: 98, close: 104 },
    { timestamp: 2000, open: 104, high: 112, low: 102, close: 110 },
    { timestamp: 3000, open: 110, high: 118, low: 109, close: 117 }
  ])
  const cAmd = asQmlList([
    { timestamp: 1000, open: 100, high: 105, low: 98, close: 99 },
    { timestamp: 2000, open: 99, high: 100, low: 92, close: 93 },
    { timestamp: 3000, open: 93, high: 94, low: 85, close: 86 }
  ])
  const qmlHoldings = asQmlList([
    { symbol: "NVDA", name: "NVIDIA", pctVal: 20 },
    { symbol: "AMD", name: "AMD", pctVal: 10 }
  ])

  assert.equal(Array.isArray(cNvda), false)
  assert.equal(Array.isArray(qmlHoldings), false)
  assert.equal(Model.isArrayLike(cNvda), true)

  const metrics = Model.computeSectorBreadth(
    qmlHoldings,
    { NVDA: cNvda, AMD: cAmd },
    {}
  )
  assert.equal(metrics.totalHoldings, 2)
  assert.equal(metrics.count2u, 1)
  assert.equal(metrics.count2d, 1)
  assert.equal(metrics.pct2u, 50)
  assert.equal(metrics.pct2d, 50)

  assert.equal(Model.matchesScenarioQuery(cNvda, null, "2ug"), true)
  assert.equal(Model.matchesScenarioQuery(cAmd, null, "2dr"), true)

  const sorted = Model.sortSectorHoldings(qmlHoldings, "weight", "asc", {})
  assert.equal(sorted.length, 2)
  assert.equal(sorted[0].symbol, "AMD")

  const updated = Model.updateDevelopingCandle(
    cNvda,
    { regularPrice: 120, session: "regular" },
    "1D",
    new Date(3000 * 1000)
  )
  assert.equal(Array.isArray(updated), true)
  assert.equal(updated[updated.length - 1].close, 120)
})

test("mergeChartQuote preserves real-time 1D spark quote fields and strips candles array", () => {
  const sparkQuote = {
    symbol: "NVDA",
    name: "NVIDIA Corp",
    price: 140.5,
    change: 3.5,
    changePercent: 2.55,
    previousClose: 137.0,
    regularPrice: 140.5,
    regularChangePercent: 2.55,
    closes: [138, 139, 140.5]
  }
  const chartParsed1W = {
    symbol: "NVDA",
    name: "NVIDIA Corp",
    price: 140.5,
    change: 95.5,
    changePercent: 212.22,
    previousClose: 45.0,
    regularPrice: 140.5,
    regularChangePercent: 212.22,
    ftfc: { D: "up", W: "up", M: "up" },
    closes: [45, 80, 140.5],
    candles: [{ timestamp: 1, open: 45, high: 141, low: 44, close: 140.5 }]
  }

  const merged = Model.mergeChartQuote(sparkQuote, chartParsed1W)
  assert.equal(merged.symbol, "NVDA")
  assert.equal(merged.price, 140.5)
  assert.equal(merged.change, 3.5)
  assert.equal(merged.changePercent, 2.55)
  assert.equal(merged.previousClose, 137.0)
  assert.equal(merged.regularChangePercent, 2.55)
  assert.deepEqual(merged.ftfc, { D: "up", W: "up", M: "up" })
  assert.deepEqual(merged.closes, [138, 139, 140.5])
  assert.equal(merged.candles, undefined)

  const fresh = Model.mergeChartQuote(null, chartParsed1W)
  assert.equal(fresh.symbol, "NVDA")
  assert.equal(fresh.price, 140.5)
  assert.deepEqual(fresh.ftfc, { D: "up", W: "up", M: "up" })
  assert.equal(fresh.candles, undefined)
})

test("sortSectorHoldings sorts accurately by change % across parseSpark and Yahoo quote formats", () => {
  const holdings = [
    { symbol: "AAPL", pctVal: 10 },
    { symbol: "NVDA", pctVal: 20 },
    { symbol: "AMD", pctVal: 5 }
  ]
  const sparkQuotes = {
    AAPL: { price: 200, changePercent: 0.5, regularChangePercent: 0.5 },
    NVDA: { price: 140, changePercent: 4.2, regularChangePercent: 4.2 },
    AMD: { price: 150, changePercent: -1.8, regularChangePercent: -1.8 }
  }

  const desc = Model.sortSectorHoldings(holdings, "change", "desc", sparkQuotes)
  assert.deepEqual(desc.map(h => h.symbol), ["NVDA", "AAPL", "AMD"])

  const asc = Model.sortSectorHoldings(holdings, "change", "asc", sparkQuotes)
  assert.deepEqual(asc.map(h => h.symbol), ["AMD", "AAPL", "NVDA"])
})

test("universal scenario filter: arbitrary N-bar sequences, per-bar modifiers, and ! exclusions", () => {
  // 1. 1-2dh: Inside bar (1) followed by 2d Hammer (2dh)
  const seq1_2dh = [
    { open: 100, high: 120, low: 90, close: 110 },  // c0: motherbar
    { open: 108, high: 115, low: 95, close: 102 },  // c1: 1 (inside c0, red)
    { open: 109, high: 112, low: 85, close: 111 }   // c2: 2d (broke 95 -> 85, high 112 <= 115), green hammer (body 109-111 in top 33% of 85..112)
  ]
  assert.equal(Model.matchesScenarioQuery(seq1_2dh, null, "1-2dh"), true)
  assert.equal(Model.matchesScenarioQuery(seq1_2dh, null, "1r-2dh"), true)
  assert.equal(Model.matchesScenarioQuery(seq1_2dh, null, "1-2dgh"), true)
  assert.equal(Model.matchesScenarioQuery(seq1_2dh, null, "1-2dhg"), true)
  assert.equal(Model.matchesScenarioQuery(seq1_2dh, null, "1-2d"), true)
  assert.equal(Model.matchesScenarioQuery(seq1_2dh, null, "1-2ds"), false)
  assert.equal(Model.matchesScenarioQuery(seq1_2dh, null, "2-2dh"), false)
  assert.equal(Model.matchesScenarioQuery(seq1_2dh, null, "!1-2dh"), false)
  assert.equal(Model.matchesScenarioQuery(seq1_2dh, null, "!3-1-3"), true)

  // 2. 3-1-3: Outside (3) -> Inside (1) -> Outside (3)
  const seq3_1_3 = [
    { open: 100, high: 110, low: 95, close: 105 },  // c0
    { open: 98, high: 115, low: 90, close: 112 },   // c1: 3 (115 > 110, 90 < 95)
    { open: 105, high: 110, low: 95, close: 100 },  // c2: 1 (110 <= 115, 95 >= 90, red)
    { open: 96, high: 114, low: 92, close: 112 }    // c3: 3 (114 > 110, 92 < 95, green)
  ]
  assert.equal(Model.matchesScenarioQuery(seq3_1_3, null, "3-1-3"), true)
  assert.equal(Model.matchesScenarioQuery(seq3_1_3, null, "3-1r-3g"), true)
  assert.equal(Model.matchesScenarioQuery(seq3_1_3, null, "3-1g-3g"), false)
  assert.equal(Model.matchesScenarioQuery(seq3_1_3, null, "1-3"), true)
  assert.equal(Model.matchesScenarioQuery(seq3_1_3, null, "!3-1-3"), false)
  assert.equal(Model.matchesScenarioQuery(seq3_1_3, null, "!1"), true)

  // 3. 2d-2d-2d-2dg: 4-bar sequence (requires 5 candles)
  const seq4_2dg = [
    { open: 145, high: 150, low: 140, close: 142 }, // c0
    { open: 141, high: 145, low: 130, close: 132 }, // c1: 2d (r)
    { open: 131, high: 135, low: 120, close: 122 }, // c2: 2d (r)
    { open: 121, high: 125, low: 110, close: 112 }, // c3: 2d (r)
    { open: 106, high: 118, low: 100, close: 115 }  // c4: 2dg (broke 110 -> 100, high 118 <= 125, close 115 > open 106)
  ]
  assert.equal(Model.matchesScenarioQuery(seq4_2dg, null, "2d-2d-2d-2dg"), true)
  assert.equal(Model.matchesScenarioQuery(seq4_2dg, null, "2-2-2-2g"), true)
  assert.equal(Model.matchesScenarioQuery(seq4_2dg, null, "2dr-2dr-2dr-2dg"), true)
  assert.equal(Model.matchesScenarioQuery(seq4_2dg, null, "2d-2d-2d-2dr"), false)
  assert.equal(Model.matchesScenarioQuery(seq4_2dg, null, "2d-2d-2d-2d-2dg"), false) // 5-bar sequence on 5 candles (only 4 transitions) -> false
  assert.equal(Model.matchesScenarioQuery(seq4_2dg, null, "!2d-2d-2d-2dg"), false)
  assert.equal(Model.matchesScenarioQuery(seq4_2dg, null, "!2d-2d-2d-2dr"), true)

  // 4. 3-1-2dh: Outside (3) -> Inside (1) -> 2d Hammer (2dh)
  const seq3_1_2dh = [
    { open: 100, high: 110, low: 95, close: 105 },  // c0
    { open: 108, high: 120, low: 85, close: 90 },   // c1: 3
    { open: 95, high: 110, low: 92, close: 105 },   // c2: 1g
    { open: 107, high: 109, low: 80, close: 108 }   // c3: 2dh (range 80..109 = 29, bodyBot 107 >= 99.33, upperWick 1 <= 2.9)
  ]
  assert.equal(Model.matchesScenarioQuery(seq3_1_2dh, null, "3-1-2dh"), true)
  assert.equal(Model.matchesScenarioQuery(seq3_1_2dh, null, "3-1g-2dh"), true)
  assert.equal(Model.matchesScenarioQuery(seq3_1_2dh, null, "3-1r-2dh"), false)

  // 5. 3-1r and 3-1g: Outside (3) -> Inside Red (1r) or Inside Green (1g)
  const seq3_1r = [
    { open: 100, high: 110, low: 95, close: 105 },  // c0
    { open: 96, high: 120, low: 85, close: 115 },   // c1: 3
    { open: 110, high: 115, low: 90, close: 95 }    // c2: 1r (inside c1, close 95 < open 110)
  ]
  const seq3_1g = [
    { open: 100, high: 110, low: 95, close: 105 },  // c0
    { open: 96, high: 120, low: 85, close: 115 },   // c1: 3
    { open: 95, high: 115, low: 90, close: 110 }    // c2: 1g (inside c1, close 110 > open 95)
  ]
  assert.equal(Model.matchesScenarioQuery(seq3_1r, null, "3-1r"), true)
  assert.equal(Model.matchesScenarioQuery(seq3_1r, null, "3-1g"), false)
  assert.equal(Model.matchesScenarioQuery(seq3_1g, null, "3-1g"), true)
  assert.equal(Model.matchesScenarioQuery(seq3_1g, null, "3-1r"), false)

  // 6. Exclusions (!): single, whitespace-separated, comma-separated, and mixed with inclusions
  // seq3_1r ends on a 1r bar; seq3_1_3 ends on a 3g bar; seq1_2dh ends on a 2dh bar
  assert.equal(Model.matchesScenarioQuery(seq3_1r, null, "!1"), false)
  assert.equal(Model.matchesScenarioQuery(seq3_1r, null, "! 1"), false)
  assert.equal(Model.matchesScenarioQuery(seq1_2dh, null, "!1"), true)
  assert.equal(Model.matchesScenarioQuery(seq1_2dh, null, "! 1"), true)

  // Multiple comma-separated exclusions (!1, !3) must exclude BOTH 1 and 3
  assert.equal(Model.matchesScenarioQuery(seq3_1r, null, "!1, !3"), false)
  assert.equal(Model.matchesScenarioQuery(seq3_1_3, null, "!1, !3"), false)
  assert.equal(Model.matchesScenarioQuery(seq1_2dh, null, "!1, !3"), true)

  // Mixed positive OR clauses with global comma exclusion (e.g. "1, 2dh, !r")
  assert.equal(Model.matchesScenarioQuery(seq3_1r, null, "1, 2dh, !r"), false)  // matches 1, but excluded by !r
  assert.equal(Model.matchesScenarioQuery(seq3_1g, null, "1, 2dh, !r"), true)   // matches 1 and is green (!r)
  assert.equal(Model.matchesScenarioQuery(seq1_2dh, null, "1, 2dh, !r"), true)  // matches 2dh and is green (!r)
  assert.equal(Model.matchesScenarioQuery(seq3_1_3, null, "1, 2dh, !r"), false) // neither 1 nor 2dh
})

test("parseSectorTickers expands @-prefixed ticker presets", () => {
  const IDX = ["SPY", "QQQ", "IWM", "DIA"]
  const SEC = ["XLE", "XLB", "XLI", "XLY", "XLP", "XLV", "XLF", "XLK", "XLC", "XLU", "XLRE"]
  assert.deepEqual(Model.parseSectorTickers("@INDEX"), IDX)
  assert.deepEqual(Model.parseSectorTickers("@sectors"), SEC)
  assert.deepEqual(Model.parseSectorTickers("@INDEX,@SECTORS"), IDX.concat(SEC))
  assert.deepEqual(Model.parseSectorTickers("@MARKET"), IDX.concat(SEC))
  assert.deepEqual(Model.parseSectorTickers("@m"), IDX.concat(SEC))
  assert.deepEqual(Model.parseSectorTickers("@I, @S"), IDX.concat(SEC))
  assert.deepEqual(Model.parseSectorTickers("@SECTORS, SMH, XLK"), SEC.concat(["SMH"]))
  assert.deepEqual(Model.parseSectorTickers("SMH, @INDEX"), ["SMH"].concat(IDX))
  // Plain words are real tickers, never presets; unknown presets are ignored
  assert.deepEqual(Model.parseSectorTickers("ALL"), ["ALL"])
  assert.deepEqual(Model.parseSectorTickers("@NOPE"), [])
  assert.deepEqual(Model.parseSectorTickers("@NOPE, SPY"), ["SPY"])
  assert.equal(Model.resolveTickerPreset("SECTORS"), null)
  assert.equal(Model.isPresetToken(" @index"), true)
  assert.equal(Model.isPresetToken("SPY"), false)
})

test("normalizeSectorInput and describeSectorInput preserve and label presets", () => {
  assert.equal(Model.normalizeSectorInput(" @index , smh , @s "), "@INDEX,SMH,@SECTORS")
  assert.equal(Model.normalizeSectorInput("@M,@NOPE"), "@MARKET")
  assert.equal(Model.describeSectorInput("@INDEX"), "Major Indexes")
  assert.equal(Model.describeSectorInput("@INDEX,@SECTORS"), "Major Indexes + GICS Sectors")
  assert.equal(Model.describeSectorInput("@M"), "Indexes + Sectors")
  assert.equal(Model.describeSectorInput("@SECTORS,SMH"), "GICS Sectors + SMH")
  assert.equal(Model.describeSectorInput("SPY,QQQ"), null)
  assert.equal(Model.describeSectorInput(""), null)
})

test("@ENERGY preset expands, normalizes and labels", () => {
  const EN = ["XLE", "XOP", "OIH", "XOM", "CVX", "OXY"]
  assert.deepEqual(Model.parseSectorTickers("@ENERGY"), EN)
  assert.deepEqual(Model.parseSectorTickers("@e"), EN)
  assert.deepEqual(Model.parseSectorTickers("@ENERGY, SLB"), EN.concat(["SLB"]))
  assert.equal(Model.normalizeSectorInput(" @e , slb "), "@ENERGY,SLB")
  assert.equal(Model.describeSectorInput("@ENERGY"), "Energy")
  assert.equal(Model.describeSectorInput("@INDEX,@ENERGY"), "Major Indexes + Energy")
})

test("sparkQuoteUrl builds lightweight 1d quote URL and chartCommand enables gzip compression", () => {
  const url = Model.sparkQuoteUrl(["SPY", "NVDA"])
  assert.match(url, /\/v7\/finance\/spark\?symbols=SPY%2CNVDA&range=1d&interval=1d&includePrePost=false$/)
  assert.ok(Model.chartCommand("AAPL", "1D").includes("--compressed"))
  assert.ok(Model.chartCommand("HYPE32196-USD", "60").includes("--compressed"))
})

test("extractFtfcAnchors and computeFtfcFromAnchors match extractFTFC and survive lightweight mergeQuotes", () => {
  const timestamps = [
    Date.UTC(2026, 2, 2, 14, 30) / 1000,
    Date.UTC(2026, 2, 9, 14, 30) / 1000,
    Date.UTC(2026, 2, 10, 14, 30) / 1000,
    Date.UTC(2026, 2, 10, 15, 30) / 1000
  ]
  const indicators = {
    quote: [{
      open: [100, 105, 110, 120],
      high: [106, 112, 121, 126],
      low: [99, 104, 109, 118],
      close: [105, 110, 120, 122]
    }]
  }
  const meta = { regularMarketOpen: 110 }
  const hourly = Model.mergePeriodCandles(Model.parseCandles(timestamps, indicators), "60")
  const anchors = Model.extractFtfcAnchors(hourly, meta, true)
  for (const px of [95, 102, 108, 115, 125]) {
    assert.deepEqual(
      Model.computeFtfcFromAnchors(anchors, px),
      Model.extractFTFC(timestamps, indicators, px, meta)
    )
  }

  // mergeQuotes preserves anchors from full spark and recomputes FTFC in O(1) on lightweight tick
  const hydrated = {
    SPY: {
      symbol: "SPY",
      name: "SPDR S&P 500",
      currency: "USD",
      priceHint: 2,
      previousClose: 108,
      price: 125,
      regularPrice: 125,
      ftfcAnchors: anchors,
      ftfc: Model.computeFtfcFromAnchors(anchors, 125)
    }
  }
  const merged = Model.mergeQuotes(hydrated, {
    SPY: { symbol: "SPY", price: 112, regularPrice: 112, ftfc: null }
  })
  assert.equal(merged.SPY.name, "SPDR S&P 500")
  assert.equal(merged.SPY.previousClose, 108)
  assert.deepEqual(merged.SPY.ftfc, { "60": "down", "D": "up", "W": "up", "M": "up" })
})

test("marketDateEt matches America/New_York Intl formatter across EST, EDT, DST transitions, and UTC midnight", () => {
  const samples = [
    Date.UTC(2026, 0, 15, 3, 30) / 1000,   // Jan 14 22:30 EST
    Date.UTC(2026, 0, 15, 5, 0) / 1000,    // Jan 15 00:00 EST
    Date.UTC(2026, 2, 8, 6, 59) / 1000,    // DST spring-forward -1m (Mar 8 01:59 EST)
    Date.UTC(2026, 2, 8, 7, 1) / 1000,     // DST spring-forward +1m (Mar 8 03:01 EDT)
    Date.UTC(2026, 6, 4, 3, 59) / 1000,    // Jul 3 23:59 EDT
    Date.UTC(2026, 6, 4, 4, 1) / 1000,     // Jul 4 00:01 EDT
    Date.UTC(2026, 10, 1, 5, 59) / 1000,   // DST fall-back -1m (Nov 1 01:59 EDT)
    Date.UTC(2026, 10, 1, 6, 1) / 1000     // DST fall-back +1m (Nov 1 01:01 EST)
  ]
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })
  for (const ts of samples) {
    assert.equal(Model.marketDateEt(ts), fmt.format(new Date(ts * 1000)))
  }
})

test("normalizeFiredSetupKeys prunes expired entries and enforces max cap", () => {
  const now = Date.UTC(2026, 10, 22, 15, 0)
  const old = now - 50 * 86400000
  const recent = now - 3600000
  const norm = Model.normalizeFiredSetupKeys({
    "SPY:60:1:LONG:2d-1-2u": recent,
    "QQQ:60:1:SHORT:2u-1-2d": old,
    "BAD": "not-a-number"
  }, now)
  assert.equal(norm["SPY:60:1:LONG:2d-1-2u"], recent)
  assert.equal(norm["QQQ:60:1:SHORT:2u-1-2d"], undefined)
  assert.equal(norm["BAD"], undefined)
})

test("matchesScenarioQuery bounded lookback produces identical results to full candle scan", () => {
  const candles = []
  for (let i = 0; i < 200; i++) {
    candles.push({ timestamp: 1700000000 + i * 86400, open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 1000 })
  }
  // Craft trailing 3 bars: 2u -> 1 -> 2u green
  candles.push({ timestamp: 1720000000, open: 300, high: 310, low: 299, close: 308, volume: 1000 })
  candles.push({ timestamp: 1720086400, open: 305, high: 309, low: 301, close: 304, volume: 1000 })
  candles.push({ timestamp: 1720172800, open: 305, high: 315, low: 304, close: 314, volume: 1000 })
  assert.equal(Model.matchesScenarioQuery(candles, null, "2u-1-2ug"), true)
  assert.equal(Model.matchesScenarioQuery(candles, null, "2u-1-2ug, 3-1g"), true)
  assert.equal(Model.matchesScenarioQuery(candles, null, "!1, 1-2u"), true)
  assert.equal(Model.matchesScenarioQuery(candles, null, "!2u"), false)
})

test("packCandles and unpackCandles round-trip compact v2 tuples, strip float32 noise, and support legacy v1 objects", () => {
  const raw = [
    { timestamp: 1792159200, open: 414.3500061035156, high: 415.510009765625, low: 413.75, close: 414.6300048828125, volume: 540579 },
    { timestamp: 1792162800, open: 0.000123456789, high: 0.000129999, low: 0.0001201, close: 0.000125678, volume: 987654321 }
  ]
  const packed = Model.packCandles(raw)
  assert.equal(packed.length, 2)
  assert.deepEqual(packed[0], [1792159200, 414.35, 415.51, 413.75, 414.63, 540579])
  // Sub-$1 crypto retains 6 significant digits
  assert.equal(packed[1][1], 0.000123457)
  assert.ok(JSON.stringify(packed).length < JSON.stringify(raw).length * 0.55)

  const unpacked = Model.unpackCandles(packed)
  assert.deepEqual(unpacked[0], {
    timestamp: 1792159200,
    open: 414.35,
    high: 415.51,
    low: 413.75,
    close: 414.63,
    volume: 540579
  })
  // Backward compatible with v1 object arrays
  const unpackedLegacy = Model.unpackCandles(raw)
  assert.equal(unpackedLegacy.length, 2)
  assert.equal(unpackedLegacy[0].timestamp, 1792159200)
  assert.equal(unpackedLegacy[0].close, 414.6300048828125)
})

test("price scale log zoom, vertical pan, drag/wheel factors, and step-aware compact formatting", () => {
  const lo = Math.log(100)
  const hi = Math.log(200)
  const center = (lo + hi) / 2
  const span = hi - lo

  // 1. Wheel zoom: scroll up (+120) zooms in (narrower span); scroll down (-120) zooms out (wider span)
  const fUp = Model.priceScaleWheelFactor(120)
  const fDown = Model.priceScaleWheelFactor(-120)
  assert.ok(fUp > 0 && fUp < 1)
  assert.ok(fDown > 1)
  assert.ok(Math.abs(fUp * fDown - 1) < 1e-12)

  // High-resolution trackpad deltas scale smoothly and proportionally
  const fTrackpad = Model.priceScaleWheelFactor(15)
  assert.ok(fTrackpad > fUp && fTrackpad < 1)

  // Zoom centers symmetrically around midpoint and round-trips cleanly
  const zoomedIn = Model.zoomPriceLogRange(lo, hi, fUp)
  assert.ok(zoomedIn.logSpan < span)
  assert.ok(Math.abs((zoomedIn.logMin + zoomedIn.logMax) / 2 - center) < 1e-12)
  const roundTrip = Model.zoomPriceLogRange(zoomedIn.logMin, zoomedIn.logMax, fDown)
  assert.ok(Math.abs(roundTrip.logMin - lo) < 1e-12)
  assert.ok(Math.abs(roundTrip.logMax - hi) < 1e-12)

  // 2. Drag factor: drag up (dy < 0) stretches/zooms in (< 1); drag down (dy > 0) compresses/zooms out (> 1)
  const dragUp = Model.priceScaleDragFactor(-60, 200)
  const dragDown = Model.priceScaleDragFactor(60, 200)
  assert.ok(dragUp > 0 && dragUp < 1)
  assert.ok(dragDown > 1)
  assert.ok(Math.abs(dragUp * dragDown - 1) < 1e-12)

  // 3. Vertical pan: drag down (+dy) shifts log range upward so candles follow pointer down 1:1; span invariant
  const panDown = Model.panPriceLogRange(lo, hi, 50, 200)
  assert.ok(panDown.logMin > lo && panDown.logMax > hi)
  assert.ok(Math.abs(panDown.logSpan - span) < 1e-12)
  assert.ok(Math.abs((panDown.logMin - lo) - 0.25 * span) < 1e-12)

  const panUp = Model.panPriceLogRange(panDown.logMin, panDown.logMax, -50, 200)
  assert.ok(Math.abs(panUp.logMin - lo) < 1e-12)
  assert.ok(Math.abs(panUp.logMax - hi) < 1e-12)

  // 4. Extreme zoom/pan clamping never yields NaN, Infinity, or zero span
  const ultraIn = Model.zoomPriceLogRange(lo, hi, 1e-9)
  assert.ok(isFinite(ultraIn.logMin) && isFinite(ultraIn.logMax))
  assert.ok(ultraIn.logSpan >= Model.PRICE_SCALE_MIN_LOG_SPAN - 1e-12)
  const ultraOut = Model.zoomPriceLogRange(lo, hi, 1e9)
  assert.ok(isFinite(ultraOut.logMin) && isFinite(ultraOut.logMax))
  assert.ok(ultraOut.logSpan <= Model.PRICE_SCALE_MAX_LOG_SPAN + 1e-12)
  const ultraPan = Model.panPriceLogRange(lo, hi, -1e9, 200)
  assert.ok(isFinite(ultraPan.logMin) && Math.exp(ultraPan.logMin) >= 0.0000099)

  // 5. Compact step-aware price scale formatting (no redundant $, deep-zoom decimal expansion, large-integer cleanup)
  assert.equal(Model.formatScalePrice(225.5, 2.5, 2), "225.50")
  assert.equal(Model.formatScalePrice(225, 10, 2), "225")
  assert.equal(Model.formatScalePrice(97500, 2500, 2), "97,500")
  assert.equal(Model.formatScalePrice(97542.3, null, 2), "97,542")
  assert.equal(Model.formatScalePrice(6000, 50, 2), "6,000")
  assert.equal(Model.formatScalePrice(225.125, 0.025, 2), "225.125")
  assert.equal(Model.formatScalePrice(2.405, 0.005, 2), "2.405")
  assert.equal(Model.formatScalePrice(0.0452, 0.005, 4), "0.0452")
  assert.equal(Model.formatScalePrice(null, 1, 2), "-")

  // 6. Per-cell zoom persistence accepts 1..7 bars now that MIN_BAR_COUNT is 1
  const raw = Model.serializeState(
    ["SPY"],
    [],
    "1D",
    "2+3",
    { symbol: true, timeframe: false, crosshair: true, time: true },
    ["SPY", "SPY", "SPY", "SPY", "SPY"],
    {},
    {},
    "equal",
    "1Y",
    false,
    "",
    ["30", "60", "1D", "1W", "1M"],
    [1, 3, 5, 0, 8]
  )
  const parsed = Model.parseState(raw)
  assert.deepEqual(parsed.gridZooms, [1, 3, 5, -1, 8])
})

test("normalizeYahooTick maps proto3-omitted marketHours to pre-market outside RTH and regular during RTH", () => {
  const MarketStream = require("../scripts/market-stream.js")

  // Thursday 2026-11-19 (EST = UTC-5)
  const preMarketMs = Date.UTC(2026, 10, 19, 13, 0, 0) // 08:00 ET
  const rthMs = Date.UTC(2026, 10, 19, 15, 0, 0)       // 10:00 ET
  const postMs = Date.UTC(2026, 10, 19, 22, 0, 0)      // 17:00 ET

  // Proto3 omits field 7 when marketHours === 0 (PRE_MARKET)
  const preTick = MarketStream.normalizeYahooTick({ 1: "NVDA", 2: 155.25, 3: preMarketMs })
  assert.equal(preTick.session, "pre")
  assert.equal(preTick.hasExtended, true)
  assert.equal(preTick.extendedPrice, 155.25)
  assert.equal(preTick.regularPrice, undefined)

  // Safety net: omitted field 7 during confirmed US RTH resolves to regular
  const rthOmitted = MarketStream.normalizeYahooTick({ 1: "NVDA", 2: 156.5, 3: rthMs })
  assert.equal(rthOmitted.session, "regular")
  assert.equal(rthOmitted.regularPrice, 156.5)
  assert.equal(rthOmitted.hasExtended, false)

  // Explicit field 7 = 1 (REGULAR) and 2 (POST)
  const regTick = MarketStream.normalizeYahooTick({ 1: "SPY", 2: 728.2, 3: rthMs, 7: 1n })
  assert.equal(regTick.session, "regular")
  assert.equal(regTick.regularPrice, 728.2)
  assert.equal(regTick.hasExtended, false)

  const postTick = MarketStream.normalizeYahooTick({ 1: "SPY", 2: 729.0, 3: postMs, 7: 2n })
  assert.equal(postTick.session, "post")
  assert.equal(postTick.extendedPrice, 729.0)
  assert.equal(postTick.hasExtended, true)
  assert.equal(postTick.regularPrice, undefined)

  // Crypto always stays "live"
  const cryptoTick = MarketStream.normalizeYahooTick({ 1: "BTC-USD", 2: 92000, 3: preMarketMs })
  assert.equal(cryptoTick.session, "live")
  assert.equal(cryptoTick.regularPrice, 92000)
})

test("mergeQuotes clears yesterday open/dayHigh/dayLow/volume on new trading day and pre->regular open transition", () => {
  const wedCloseSec = Math.floor(Date.UTC(2026, 10, 18, 21, 0, 0) / 1000) // Wed 16:00 ET
  const thuPreSec = Math.floor(Date.UTC(2026, 10, 19, 13, 30, 0) / 1000)  // Thu 08:30 ET
  const thuOpenSec = Math.floor(Date.UTC(2026, 10, 19, 14, 30, 5) / 1000) // Thu 09:30:05 ET
  const thuMidSec = Math.floor(Date.UTC(2026, 10, 19, 15, 15, 0) / 1000)  // Thu 10:15 ET

  const wedQuote = {
    NVDA: {
      symbol: "NVDA",
      name: "NVIDIA",
      price: 150,
      regularPrice: 150,
      previousClose: 148,
      open: 149,
      dayHigh: 155,
      dayLow: 147,
      volume: 50000000,
      session: "regular",
      timestamp: wedCloseSec
    }
  }

  // 1. Direct Wed regular -> Thu regular WS tick (omits open/dayHigh/dayLow)
  const mergedDirect = Model.mergeQuotes(wedQuote, {
    NVDA: { symbol: "NVDA", price: 160, regularPrice: 160, session: "regular", timestamp: thuOpenSec }
  })
  assert.equal(mergedDirect.NVDA.dayHigh, null)
  assert.equal(mergedDirect.NVDA.dayLow, null)
  assert.equal(mergedDirect.NVDA.open, null)
  assert.equal(mergedDirect.NVDA.volume, null)
  assert.equal(mergedDirect.NVDA.name, "NVIDIA")

  // 2. Wed regular -> Thu pre-market (08:30) -> Thu regular open (09:30)
  const mergedPre = Model.mergeQuotes(wedQuote, {
    NVDA: { symbol: "NVDA", price: 159, extendedPrice: 159, hasExtended: true, session: "pre", timestamp: thuPreSec }
  })
  assert.equal(mergedPre.NVDA.dayHigh, 155)
  const mergedAfterPre = Model.mergeQuotes(mergedPre, {
    NVDA: { symbol: "NVDA", price: 160.5, regularPrice: 160.5, hasExtended: false, session: "regular", timestamp: thuOpenSec }
  })
  assert.equal(mergedAfterPre.NVDA.dayHigh, null)
  assert.equal(mergedAfterPre.NVDA.dayLow, null)
  assert.equal(mergedAfterPre.NVDA.open, null)

  // 3. Same-day regular tick preserves today's dayHigh/dayLow/open
  const thuHydrated = {
    NVDA: { symbol: "NVDA", price: 161, regularPrice: 161, open: 160, dayHigh: 162, dayLow: 159.5, volume: 12000000, session: "regular", timestamp: thuOpenSec }
  }
  const mergedSameDay = Model.mergeQuotes(thuHydrated, {
    NVDA: { symbol: "NVDA", price: 161.5, regularPrice: 161.5, session: "regular", timestamp: thuMidSec }
  })
  assert.equal(mergedSameDay.NVDA.dayHigh, 162)
  assert.equal(mergedSameDay.NVDA.dayLow, 159.5)
  assert.equal(mergedSameDay.NVDA.open, 160)
})

test("updateDevelopingCandle preserves RTH purity, aligns 60m US equities to 09:30 ET, and rolls over 1W/1M/1Y", () => {
  // 1. Pre-market and post-market ticks never mutate RTH candles
  const wed1530Sec = Math.floor(Date.UTC(2026, 10, 18, 20, 30, 0) / 1000) // Wed 15:30 EST
  const base60 = [{ timestamp: wed1530Sec, open: 100, high: 101, low: 99, close: 100.5, volume: 1000 }]
  const preRes = Model.updateDevelopingCandle(base60, { symbol: "AAPL", price: 105, extendedPrice: 105, session: "pre" }, "60", new Date(Date.UTC(2026, 10, 19, 13, 15, 0)))
  assert.equal(preRes, base60)
  const postRes = Model.updateDevelopingCandle(base60, { symbol: "AAPL", price: 98, extendedPrice: 98, session: "post" }, "60", new Date(Date.UTC(2026, 10, 19, 22, 0, 0)))
  assert.equal(postRes, base60)

  // 2. 60m US equity aligns to 09:30 ET, 10:30 ET, and guards 09:29:59 skew
  const thu0930Sec = Math.floor(Date.UTC(2026, 10, 19, 14, 30, 0) / 1000)
  const thu1030Sec = Math.floor(Date.UTC(2026, 10, 19, 15, 30, 0) / 1000)

  const skewRes = Model.updateDevelopingCandle(base60, { symbol: "AAPL", regularPrice: 102, session: "regular" }, "60", new Date(Date.UTC(2026, 10, 19, 14, 29, 59)))
  assert.equal(skewRes.length, 2)
  assert.equal(skewRes[1].timestamp, thu0930Sec)

  const openRes = Model.updateDevelopingCandle(base60, { symbol: "AAPL", regularPrice: 102, session: "regular" }, "60", new Date(Date.UTC(2026, 10, 19, 14, 31, 0)))
  assert.equal(openRes.length, 2)
  assert.equal(openRes[1].timestamp, thu0930Sec)
  assert.equal(openRes[1].open, 102)

  const midHourRes = Model.updateDevelopingCandle(openRes, { symbol: "AAPL", regularPrice: 104, session: "regular" }, "60", new Date(Date.UTC(2026, 10, 19, 15, 15, 0)))
  assert.equal(midHourRes.length, 2)
  assert.equal(midHourRes[1].timestamp, thu0930Sec)
  assert.equal(midHourRes[1].high, 104)
  assert.equal(midHourRes[1].close, 104)

  const nextHourRes = Model.updateDevelopingCandle(midHourRes, { symbol: "AAPL", regularPrice: 103.5, session: "regular" }, "60", new Date(Date.UTC(2026, 10, 19, 15, 31, 0)))
  assert.equal(nextHourRes.length, 3)
  assert.equal(nextHourRes[2].timestamp, thu1030Sec)
  assert.equal(nextHourRes[2].open, 103.5)

  // 3. 60m crypto & non-US equity keep top-of-hour :00 alignment
  const btcBase = [{ timestamp: Math.floor(Date.UTC(2026, 10, 19, 13, 0, 0) / 1000), open: 90000, high: 91000, low: 89500, close: 90500, volume: 10 }]
  const btcRes = Model.updateDevelopingCandle(btcBase, { symbol: "BTC-USD", regularPrice: 91200, session: "live" }, "60", new Date(Date.UTC(2026, 10, 19, 14, 31, 0)))
  assert.equal(btcRes.length, 2)
  assert.equal(btcRes[1].timestamp, Math.floor(Date.UTC(2026, 10, 19, 14, 0, 0) / 1000))

  const deBase = [{ timestamp: Math.floor(Date.UTC(2026, 10, 19, 13, 0, 0) / 1000), open: 200, high: 202, low: 199, close: 201, volume: 100 }]
  const deRes = Model.updateDevelopingCandle(deBase, { symbol: "SAP.DE", regularPrice: 203, session: "regular" }, "60", new Date(Date.UTC(2026, 10, 19, 14, 31, 0)))
  assert.equal(deRes.length, 2)
  assert.equal(deRes[1].timestamp, Math.floor(Date.UTC(2026, 10, 19, 14, 0, 0) / 1000))

  // 4. 1W Monday rollover, 1M 1st-of-month rollover, 1Y Jan-1 rollover
  const prevWeekMon = Math.floor(Date.UTC(2026, 10, 9, 14, 30, 0) / 1000)  // Mon Nov 9
  const nextWeekMon = new Date(Date.UTC(2026, 10, 16, 14, 31, 0))          // Mon Nov 16 09:31 ET
  const wRes = Model.updateDevelopingCandle([{ timestamp: prevWeekMon, open: 10, high: 12, low: 9, close: 11, volume: 1 }], { symbol: "SPY", regularPrice: 12.5, session: "regular" }, "1W", nextWeekMon)
  assert.equal(wRes.length, 2)
  assert.equal(wRes[1].open, 12.5)

  const octBar = Math.floor(Date.UTC(2026, 9, 1, 13, 30, 0) / 1000)        // Oct 1
  const nov2Open = new Date(Date.UTC(2026, 10, 2, 14, 31, 0))              // Nov 2
  const mRes = Model.updateDevelopingCandle([{ timestamp: octBar, open: 10, high: 12, low: 9, close: 11, volume: 1 }], { symbol: "SPY", regularPrice: 11.8, session: "regular" }, "1M", nov2Open)
  assert.equal(mRes.length, 2)
  assert.equal(mRes[1].open, 11.8)

  const y2025 = Math.floor(Date.UTC(2025, 0, 2, 14, 30, 0) / 1000)
  const y2026Open = new Date(Date.UTC(2026, 0, 2, 14, 31, 0))
  const yRes = Model.updateDevelopingCandle([{ timestamp: y2025, open: 500, high: 600, low: 480, close: 590, volume: 1 }], { symbol: "SPY", regularPrice: 595, session: "regular" }, "1Y", y2026Open)
  assert.equal(yRes.length, 2)
  assert.equal(yRes[1].open, 595)

  // 5. 1D ignores stale previous-day dayHigh/dayLow
  const wed1D = [{ timestamp: Math.floor(Date.UTC(2026, 10, 18, 14, 30, 0) / 1000), open: 149, high: 155, low: 147, close: 150, volume: 100 }]
  const staleDayQuote = { symbol: "NVDA", regularPrice: 160, dayHigh: 155, dayLow: 147, session: "regular", timestamp: Math.floor(Date.UTC(2026, 10, 18, 21, 0, 0) / 1000) }
  const dRes = Model.updateDevelopingCandle(wed1D, staleDayQuote, "1D", new Date(Date.UTC(2026, 10, 19, 14, 30, 5)))
  assert.equal(dRes.length, 2)
  assert.equal(dRes[1].low, 160)
  assert.equal(dRes[1].high, 160)

  // 6. US equities never roll over or mutate candles on weekends or outside RTH, even if quote claims session: "regular" or omits session
  const fri30 = [
    { timestamp: Math.floor(Date.UTC(2026, 10, 20, 20, 0, 0) / 1000), open: 1161.26, high: 1163.58, low: 1147.01, close: 1149.96, volume: 100 },
    { timestamp: Math.floor(Date.UTC(2026, 10, 20, 20, 30, 0) / 1000), open: 1149.31, high: 1157.00, low: 1132.78, close: 1142.05, volume: 100 }
  ]
  const fri1D = [
    { timestamp: Math.floor(Date.UTC(2026, 10, 19, 14, 30, 0) / 1000), open: 1368.30, high: 1378.06, low: 1288.08, close: 1295.86, volume: 100 },
    { timestamp: Math.floor(Date.UTC(2026, 10, 20, 14, 30, 0) / 1000), open: 1260.38, high: 1271.13, low: 1132.78, close: 1142.05, volume: 100 }
  ]
  const sunEve = new Date(Date.UTC(2026, 10, 22, 23, 23, 0)) // Sun 18:23 ET
  const monPre = new Date(Date.UTC(2026, 10, 23, 13, 30, 0)) // Mon 08:30 ET
  const friPost = new Date(Date.UTC(2026, 10, 20, 21, 15, 0)) // Fri 16:15 ET
  const spoofRegQuote = { symbol: "MPWR", price: 1142.05, regularPrice: 1142.05, session: "regular" }
  const noSessionQuote = { symbol: "MPWR", price: 1142.05, regularPrice: 1142.05 }
  assert.equal(Model.updateDevelopingCandle(fri30, spoofRegQuote, "30", sunEve), fri30)
  assert.equal(Model.updateDevelopingCandle(fri30, spoofRegQuote, "60", sunEve), fri30)
  assert.equal(Model.updateDevelopingCandle(fri1D, spoofRegQuote, "1D", sunEve), fri1D)
  assert.equal(Model.updateDevelopingCandle(fri1D, noSessionQuote, "1D", sunEve), fri1D)
  assert.equal(Model.updateDevelopingCandle(fri1D, spoofRegQuote, "1D", monPre), fri1D)
  assert.equal(Model.updateDevelopingCandle(fri1D, spoofRegQuote, "1D", friPost), fri1D)
  assert.equal(Model.stratScenario(fri1D[1], fri1D[0]), "2d")

  // Crypto and Sunday-evening futures still roll over on weekends
  const btcSun = Model.updateDevelopingCandle(btcBase, { symbol: "BTC-USD", regularPrice: 91500, session: "live" }, "60", sunEve)
  assert.equal(btcSun.length, 2)
  const futSun = Model.updateDevelopingCandle(
    [{ timestamp: Math.floor(Date.UTC(2026, 10, 20, 20, 0, 0) / 1000), open: 6000, high: 6010, low: 5990, close: 6005, volume: 10 }],
    { symbol: "ES=F", regularPrice: 6020, session: "regular" },
    "60",
    sunEve
  )
  assert.equal(futSun.length, 2)

  // stratLivePrice does not leak extended/overnight price when regularPrice is absent
  assert.equal(Model.stratLivePrice({ price: 1150, extendedPrice: 1150, session: "post" }), null)
  assert.equal(Model.stratLivePrice({ price: 1150, regularPrice: 1142.05, extendedPrice: 1150, session: "post" }), 1142.05)
})

test("isCandleSeriesStale detects stale prior-session caches during RTH without false positives", () => {
  const wed1D = [{ timestamp: Math.floor(Date.UTC(2026, 10, 18, 14, 30, 0) / 1000), open: 100, high: 102, low: 99, close: 101, volume: 10 }]
  const thu1D = [...wed1D, { timestamp: Math.floor(Date.UTC(2026, 10, 19, 14, 30, 0) / 1000), open: 102, high: 103, low: 101, close: 102.5, volume: 10 }]
  const fri1D = [...thu1D, { timestamp: Math.floor(Date.UTC(2026, 10, 20, 14, 30, 0) / 1000), open: 102, high: 104, low: 101, close: 103, volume: 10 }]
  const priorFri1D = [{ timestamp: Math.floor(Date.UTC(2026, 10, 13, 14, 30, 0) / 1000), open: 95, high: 98, low: 94, close: 97, volume: 10 }]
  const mon1W = [{ timestamp: Math.floor(Date.UTC(2026, 10, 16, 14, 30, 0) / 1000), open: 98, high: 103, low: 97, close: 101, volume: 50 }]
  const friMidday60 = [{ timestamp: Math.floor(Date.UTC(2026, 10, 20, 16, 30, 0) / 1000), open: 102, high: 103, low: 101, close: 102.5, volume: 10 }]
  const friClose60 = [{ timestamp: Math.floor(Date.UTC(2026, 10, 20, 20, 30, 0) / 1000), open: 102, high: 103, low: 101, close: 102.5, volume: 10 }]

  const thuPre = new Date(Date.UTC(2026, 10, 19, 13, 30, 0))  // Thu 08:30 ET
  const thuRth = new Date(Date.UTC(2026, 10, 19, 15, 0, 0))   // Thu 10:00 ET
  const thuPost = new Date(Date.UTC(2026, 10, 19, 21, 30, 0)) // Thu 16:30 ET
  const satNoon = new Date(Date.UTC(2026, 10, 21, 17, 0, 0))  // Sat 12:00 ET
  const sunEve = new Date(Date.UTC(2026, 10, 22, 22, 0, 0))   // Sun 17:00 ET
  const monPre = new Date(Date.UTC(2026, 10, 23, 13, 0, 0))   // Mon 08:00 ET

  // Empty is always stale
  assert.equal(Model.isCandleSeriesStale([], "NVDA", "1D", thuRth, 0), true)

  // During RTH: yesterday's 1D is stale, today's 1D is fresh
  assert.equal(Model.isCandleSeriesStale(wed1D, "NVDA", "1D", thuRth, 0), true)
  assert.equal(Model.isCandleSeriesStale(thu1D, "NVDA", "1D", thuRth, 0), false)

  // During RTH: 1W (Monday timestamp) requires a live fetch during today's RTH
  assert.equal(Model.isCandleSeriesStale(mon1W, "NVDA", "1W", thuRth, 0), true)
  assert.equal(Model.isCandleSeriesStale(mon1W, "NVDA", "1W", thuRth, thuPre.getTime()), true)
  assert.equal(Model.isCandleSeriesStale(mon1W, "NVDA", "1W", thuRth, Date.UTC(2026, 10, 19, 14, 31, 0)), false)

  // Pre-market & weekend: yesterday's / Friday's bars are fresh, older bars are stale
  assert.equal(Model.isCandleSeriesStale(wed1D, "NVDA", "1D", thuPre, 0), false)
  assert.equal(Model.isCandleSeriesStale(priorFri1D, "NVDA", "1D", thuPre, 0), true)
  assert.equal(Model.isCandleSeriesStale(fri1D, "NVDA", "1D", satNoon, 0), false)
  assert.equal(Model.isCandleSeriesStale(fri1D, "NVDA", "1D", sunEve, 0), false)
  assert.equal(Model.isCandleSeriesStale(fri1D, "NVDA", "1D", monPre, 0), false)
  assert.equal(Model.isCandleSeriesStale(priorFri1D, "NVDA", "1D", sunEve, 0), true)
  assert.equal(Model.isCandleSeriesStale(priorFri1D, "NVDA", "1D", monPre, 0), true)
  // Missing Friday on weekend is stale until fetched once (holiday protection once fetched on Sat/Sun)
  assert.equal(Model.isCandleSeriesStale(thu1D, "NVDA", "1D", satNoon, 0), true)
  assert.equal(Model.isCandleSeriesStale(thu1D, "NVDA", "1D", satNoon, satNoon.getTime()), false)
  // Intraday cached mid-day Friday is stale on weekend; final 15:30 ET bar is fresh
  assert.equal(Model.isCandleSeriesStale(friMidday60, "NVDA", "60", sunEve, 0), true)
  assert.equal(Model.isCandleSeriesStale(friClose60, "NVDA", "60", sunEve, 0), false)
  // HTF 1W cached with no fetchedAt on weekend refetches once, then stays fresh after post-close fetch
  assert.equal(Model.isCandleSeriesStale(mon1W, "NVDA", "1W", sunEve, 0), true)
  assert.equal(Model.isCandleSeriesStale(mon1W, "NVDA", "1W", sunEve, satNoon.getTime()), false)

  // Post-market: missing today's 1D bar or mid-day fetch is stale; post-close bar is fresh
  assert.equal(Model.isCandleSeriesStale(wed1D, "NVDA", "1D", thuPost, 0), true)
  assert.equal(Model.isCandleSeriesStale(thu1D, "NVDA", "1D", thuPost, 0), false)
  assert.equal(Model.isCandleSeriesStale(thu1D, "NVDA", "1D", thuPost, thuRth.getTime()), true)
  assert.equal(Model.isCandleSeriesStale(thu1D, "NVDA", "1D", thuPost, thuPost.getTime()), false)
})

test("canonical 7-category Strat setup detector covers all approved setups and rejects removed patterns", () => {
  const c = (ts, o, h, l, cl) => ({ timestamp: ts, open: o, high: h, low: l, close: cl })

  // 1. Inside bar reversals: 2d-1-2u, 2u-1-2d, 3(red)-1-2u, 3(green)-1-2d
  const s2d12u = Model.detectStratSetupOnCandles("1D", [c(1, 105, 110, 100, 108), c(2, 107, 108, 95, 97), c(3, 98, 102, 96, 100), c(4, 101, 104, 100, 103)])
  assert.equal(s2d12u.category, "inside_reversal")
  assert.equal(s2d12u.code, "2d-1-2u")
  assert.equal(s2d12u.triggerPrice, 102)

  const s2u12d = Model.detectStratSetupOnCandles("1D", [c(1, 95, 100, 90, 96), c(2, 97, 108, 95, 106), c(3, 104, 106, 100, 102), c(4, 101, 102, 98, 99)])
  assert.equal(s2u12d.category, "inside_reversal")
  assert.equal(s2u12d.code, "2u-1-2d")

  const s3r12u = Model.detectStratSetupOnCandles("1D", [c(1, 100, 105, 98, 103), c(2, 106, 110, 92, 94), c(3, 96, 102, 94, 100), c(4, 101, 104, 100, 103)])
  assert.equal(s3r12u.category, "inside_reversal")
  assert.equal(s3r12u.code, "3-1-2u")
  assert.match(s3r12u.name, /3-1-2 Reversal Up/)

  const s3g12d = Model.detectStratSetupOnCandles("1D", [c(1, 100, 105, 98, 103), c(2, 94, 110, 92, 108), c(3, 106, 108, 100, 102), c(4, 101, 102, 98, 99)])
  assert.equal(s3g12d.category, "inside_reversal")
  assert.equal(s3g12d.code, "3-1-2d")
  assert.match(s3g12d.name, /3-1-2 Reversal Down/)

  // 2. Inside bar continuations: 2u-1-2u, 2d-1-2d, 3(green)-1-2u, 3(red)-1-2d
  const s2u12u = Model.detectStratSetupOnCandles("1D", [c(1, 95, 100, 90, 96), c(2, 97, 110, 95, 108), c(3, 106, 108, 102, 105), c(4, 106, 111, 105, 109)])
  assert.equal(s2u12u.category, "inside_continuation")
  assert.equal(s2u12u.code, "2u-1-2u")

  const s2d12d = Model.detectStratSetupOnCandles("1D", [c(1, 105, 110, 100, 104), c(2, 103, 106, 92, 94), c(3, 95, 100, 94, 96), c(4, 95, 96, 91, 92)])
  assert.equal(s2d12d.category, "inside_continuation")
  assert.equal(s2d12d.code, "2d-1-2d")

  const s3g12u = Model.detectStratSetupOnCandles("1D", [c(1, 100, 105, 98, 103), c(2, 94, 110, 92, 108), c(3, 104, 106, 100, 105), c(4, 105, 109, 104, 108)])
  assert.equal(s3g12u.category, "inside_continuation")
  assert.equal(s3g12u.code, "3-1-2u")
  assert.match(s3g12u.name, /3-1-2 Continuation Up/)

  const s3r12d = Model.detectStratSetupOnCandles("1D", [c(1, 100, 105, 98, 103), c(2, 108, 110, 92, 94), c(3, 96, 102, 94, 95), c(4, 95, 96, 91, 92)])
  assert.equal(s3r12d.category, "inside_continuation")
  assert.equal(s3r12d.code, "3-1-2d")
  assert.match(s3r12d.name, /3-1-2 Continuation Down/)

  // 3. 2-2 reversals: 2d-2u, 2u-2d, 3-2d-2u, 3-2u-2d
  const s2d2u = Model.detectStratSetupOnCandles("1D", [c(1, 102, 110, 100, 108), c(2, 106, 107, 96, 98), c(3, 99, 109, 98, 108)])
  assert.equal(s2d2u.category, "2-2_reversal")
  assert.equal(s2d2u.code, "2d-2u")

  const s32d2u = Model.detectStratSetupOnCandles("1D", [c(1, 102, 105, 100, 104), c(2, 104, 110, 96, 98), c(3, 98, 103, 93, 95), c(4, 96, 105, 95, 104)])
  assert.equal(s32d2u.category, "2-2_reversal")
  assert.equal(s32d2u.code, "3-2d-2u")

  const s32u2d = Model.detectStratSetupOnCandles("1D", [c(1, 102, 105, 100, 104), c(2, 98, 110, 96, 108), c(3, 108, 114, 103, 112), c(4, 111, 112, 101, 102)])
  assert.equal(s32u2d.category, "2-2_reversal")
  assert.equal(s32u2d.code, "3-2u-2d")

  // 4. 1-bar rev-strat: 1-3 (green bullish / red bearish)
  const s13u = Model.detectStratSetupOnCandles("1D", [c(1, 100, 110, 95, 104), c(2, 102, 106, 100, 103), c(3, 101, 108, 98, 107)])
  assert.equal(s13u.category, "1-bar_revstrat")
  assert.equal(s13u.code, "1-3u")
  assert.equal(s13u.direction, "LONG")

  const s13d = Model.detectStratSetupOnCandles("1D", [c(1, 100, 110, 95, 104), c(2, 102, 106, 100, 103), c(3, 105, 108, 98, 99)])
  assert.equal(s13d.category, "1-bar_revstrat")
  assert.equal(s13d.code, "1-3d")
  assert.equal(s13d.direction, "SHORT")

  // 5. 3-2 reversals: opposite color required (3 red -> 2u; 3 green -> 2d); same color rejected
  const s32u = Model.detectStratSetupOnCandles("1D", [c(1, 100, 105, 98, 103), c(2, 107, 110, 94, 96), c(3, 98, 112, 97, 111)])
  assert.equal(s32u.category, "3-2_reversal")
  assert.equal(s32u.code, "3-2u")

  const s32d = Model.detectStratSetupOnCandles("1D", [c(1, 100, 105, 98, 103), c(2, 96, 110, 94, 108), c(3, 106, 107, 92, 93)])
  assert.equal(s32d.category, "3-2_reversal")
  assert.equal(s32d.code, "3-2d")

  assert.equal(Model.detectStratSetupOnCandles("1D", [c(1, 100, 105, 98, 103), c(2, 96, 110, 94, 108), c(3, 108, 113, 107, 112)]), null) // 3(green)-2u rejected
  assert.equal(Model.detectStratSetupOnCandles("1D", [c(1, 100, 105, 98, 103), c(2, 108, 110, 94, 96), c(3, 95, 96, 90, 91)]), null)   // 3(red)-2d rejected

  // 6. 2-bar rev-strat: 1-2d-2u, 1-2u-2d, 1-3(hammer)-2u, 1-3(shooter)-2d
  const s122u = Model.detectStratSetupOnCandles("1D", [c(1, 100, 110, 95, 105), c(2, 102, 106, 100, 103), c(3, 102, 104, 97, 102), c(4, 103, 107, 102, 106)])
  assert.equal(s122u.category, "2-bar_revstrat")
  assert.equal(s122u.code, "1-2d-2u")

  const s132u = Model.detectStratSetupOnCandles("1D", [c(1, 100, 112, 95, 105), c(2, 102, 106, 100, 103), c(3, 107, 108, 96, 107.5), c(4, 107, 110, 106, 109)])
  assert.equal(s132u.category, "2-bar_revstrat")
  assert.equal(s132u.code, "1-3(H)-2u")

  const s132uNoHammer = Model.detectStratSetupOnCandles("1D", [c(1, 100, 112, 95, 105), c(2, 102, 106, 100, 103), c(3, 107, 108, 96, 97), c(4, 107, 110, 106, 109)])
  assert.equal(s132uNoHammer, null)

  // Reject removed setups: 2-2 continuation, 1-1-2, and scanner doji/engulfing modifiers
  assert.equal(Model.detectStratSetupOnCandles("1D", [c(1, 100, 104, 98, 103), c(2, 103, 107, 102, 106), c(3, 106, 110, 105, 109)]), null) // 2u-2u
  assert.equal(Model.detectStratSetupOnCandles("1D", [c(1, 100, 112, 92, 105), c(2, 102, 108, 96, 104), c(3, 103, 106, 98, 103), c(4, 104, 109, 103, 108)]), null) // 1-1-2u
  assert.equal(Model.matchesScenarioQuery([c(1, 102, 105, 100, 104), c(2, 102.2, 108, 97, 102.8)], null, "doji"), false)
  assert.equal(Model.matchesScenarioQuery([c(1, 102, 105, 100, 104), c(2, 98, 108, 97, 107.2)], null, "engulfing"), false)
})

test("computeTriggeredSetupLines enforces trigger gating, bar lifetime, cascade, colors, and progressive T1..TN reveal", () => {
  const c = (ts, o, h, l, cl) => ({ timestamp: ts, open: o, high: h, low: l, close: cl })

  // Color contract: Trigger uses TF color (1M yellow, 1W orange, 1D/60/30 white); all Targets are green
  assert.equal(Model.setupLineColor("1M", "trigger", false), "#FACC15")
  assert.equal(Model.setupLineColor("1W", "trigger", false), "#FB923C")
  assert.equal(Model.setupLineColor("1D", "trigger", false), "#FFFFFF")
  assert.equal(Model.setupLineColor("60", "trigger", false), "#FFFFFF")
  assert.equal(Model.setupLineColor("30", "trigger", false), "#FFFFFF")
  for (const tf of ["1M", "1W", "1D", "60", "30"]) {
    assert.equal(Model.setupLineColor(tf, "target", false), "#22C55E")
    assert.equal(Model.setupLineColor(tf, "target", true), "#15803D")
  }

  // Monthly bullish 2d-1-2u with 3 progressive targets: T1=220 (p2), T2=232 (p3), T3=245 (p5)
  const mBase = [
    c(100, 230, 245, 225, 235), // p5 peak = 245 (T3)
    c(200, 235, 228, 220, 224), // p4 lower
    c(300, 224, 232, 218, 222), // p3 peak = 232 (T2)
    c(400, 220, 220, 200, 205), // p2 (2d): high = 220 (T1)
    c(500, 206, 215, 202, 210)  // p1 (1): trigger = 215
  ]

  // 1. Before trigger break (cur high 214 <= 215): ZERO lines shown
  const untriggered = Model.computeTriggeredSetupLines({ "1M": [...mBase, c(600, 210, 214, 208, 213)] }, { regularMarketPrice: 213 }, "1M")
  assert.equal(untriggered.length, 0)

  // 2. Triggered (cur high 217 > 215), close=217 < T1 (220): shows ONLY Trigger (215) + T1 (220)
  const atTrig = Model.computeTriggeredSetupLines({ "1M": [...mBase, c(600, 210, 217, 209, 217)] }, { regularMarketPrice: 217 }, "1M")
  assert.deepEqual(atTrig.map(l => [l.label, l.price, l.kind]), [
    ["1M 2d-1-2u TRIG", 215, "trigger"],
    ["1M T1", 220, "target"]
  ])

  // 3. Close crosses L1 (220) without hitting L2 (232): shows T1=220 and T2=232
  const pastT1 = Model.computeTriggeredSetupLines({ "1M": [...mBase, c(600, 210, 226, 209, 225)] }, { regularMarketPrice: 225 }, "1M")
  assert.deepEqual(pastT1.map(l => [l.label, l.price]), [
    ["1M 2d-1-2u TRIG", 215],
    ["1M T1", 220],
    ["1M T2", 232]
  ])

  // 3b. Retrace below L1 (220) BEFORE L2 (232) was hit: T2 (232) hides, leaving Trigger + T1 (220)
  const retraceBeforeL2 = Model.computeTriggeredSetupLines({ "1M": [...mBase, c(600, 210, 226, 209, 218)] }, { regularMarketPrice: 218 }, "1M")
  assert.deepEqual(retraceBeforeL2.map(l => [l.label, l.price]), [
    ["1M 2d-1-2u TRIG", 215],
    ["1M T1", 220]
  ])

  // 4. Bar hits L2 (232) and close >= 232: old 220 drops, 232 promotes to T1, and 245 becomes T2 (max 2 targets)
  const hitL2 = Model.computeTriggeredSetupLines({ "1M": [...mBase, c(600, 210, 237, 209, 236)] }, { regularMarketPrice: 236 }, "1M")
  assert.deepEqual(hitL2.map(l => [l.label, l.price]), [
    ["1M 2d-1-2u TRIG", 215],
    ["1M T1", 232],
    ["1M T2", 245]
  ])

  // 5. After L2 (232) was hit, retrace all the way below old L1 (218 < 220): 232 STAYS as T1, 245 hides
  const retracedAfterL2 = Model.computeTriggeredSetupLines({ "1M": [...mBase, c(600, 210, 237, 209, 218)] }, { regularMarketPrice: 218 }, "1M")
  assert.deepEqual(retracedAfterL2.map(l => [l.label, l.price]), [
    ["1M 2d-1-2u TRIG", 215],
    ["1M T1", 232]
  ])

  // 6. New bar opens (inside bar after bar 600): previous month's lines disappear
  const nextMonth = Model.computeTriggeredSetupLines({
    "1M": [...mBase, c(600, 210, 237, 209, 230), c(700, 230, 232, 225, 228)]
  }, { regularMarketPrice: 228 }, "1M")
  assert.equal(nextMonth.length, 0)

  // 7. Bearish ratcheting [T1, T2] mirror: Trig=200, levels 190 -> 180 -> 168
  const wBearBase = [
    c(100, 175, 185, 168, 178), // p5 trough = 168 (L3)
    c(200, 186, 192, 184, 188), // p4 bounce above p3 trough (not a trough)
    c(300, 182, 195, 180, 192), // p3 trough = 180 (L2)
    c(400, 192, 210, 190, 208), // p2 (2u): low = 190 (L1)
    c(500, 206, 208, 200, 202)  // p1 (1): trigger = 200
  ]
  const bearAboveT1 = Model.computeTriggeredSetupLines({ "1W": [...wBearBase, c(600, 201, 202, 194, 195)] }, { regularMarketPrice: 195 }, "1W")
  assert.deepEqual(bearAboveT1.map(l => [l.label, l.price]), [["1W 2u-1-2d TRIG", 200], ["1W T1", 190]])

  const bearBelowT1 = Model.computeTriggeredSetupLines({ "1W": [...wBearBase, c(600, 201, 202, 187, 188)] }, { regularMarketPrice: 188 }, "1W")
  assert.deepEqual(bearBelowT1.map(l => [l.label, l.price]), [["1W 2u-1-2d TRIG", 200], ["1W T1", 190], ["1W T2", 180]])

  // Bar hits L2 (180) then bounces above old L1 (192 > 190): L2 (180) becomes T1, 190 dropped, 168 hidden
  const bearHitL2Bounce = Model.computeTriggeredSetupLines({ "1W": [...wBearBase, c(600, 201, 202, 180, 192)] }, { regularMarketPrice: 192 }, "1W")
  assert.deepEqual(bearHitL2Bounce.map(l => [l.label, l.price]), [["1W 2u-1-2d TRIG", 200], ["1W T1", 180]])

  // Bar hits L2 (180) and close <= 180 (178): L2 (180) is T1, L3 (168) is T2
  const bearBelowNewT1 = Model.computeTriggeredSetupLines({ "1W": [...wBearBase, c(600, 201, 202, 177, 178)] }, { regularMarketPrice: 178 }, "1W")
  assert.deepEqual(bearBelowNewT1.map(l => [l.label, l.price]), [["1W 2u-1-2d TRIG", 200], ["1W T1", 180], ["1W T2", 168]])

  // Bar hits final target L3 (168): 168 promotes to T1, no T2 beyond it
  const bearHitL3 = Model.computeTriggeredSetupLines({ "1W": [...wBearBase, c(600, 201, 202, 166, 167)] }, { regularMarketPrice: 167 }, "1W")
  assert.deepEqual(bearHitL3.map(l => [l.label, l.price]), [["1W 2u-1-2d TRIG", 200], ["1W T1", 168]])

  // 8. Cascade-down visibility + strict timeframe eligibility (1Y, 15, 5 excluded)
  const cascadeMap = {
    "1M": [...mBase, c(600, 210, 217, 209, 217)],
    "1W": [...wBearBase, c(600, 201, 202, 194, 195)]
  }
  assert.equal(Model.computeTriggeredSetupLines(cascadeMap, null, "1Y").length, 0)
  assert.equal(Model.computeTriggeredSetupLines(cascadeMap, null, "15").length, 0)
  assert.equal(Model.computeTriggeredSetupLines(cascadeMap, null, "5").length, 0)
  // On 1M cell: only 1M lines
  assert.deepEqual(Model.computeTriggeredSetupLines(cascadeMap, null, "1M").map(l => l.timeframe), ["1M", "1M"])
  // On 1W, 1D, 60, 30 cells: both 1M and 1W lines cascade down
  for (const tf of ["1W", "1D", "60", "30"]) {
    assert.deepEqual(Model.computeTriggeredSetupLines(cascadeMap, null, tf).map(l => l.timeframe), ["1M", "1M", "1W", "1W"])
  }

  // 9. State persistence for gridSync.setupLines (default true, preserves explicit false)
  assert.equal(Model.defaultGridSync().setupLines, true)
  const savedOff = Model.serializeState(["AAPL"], [], "1D", "2x2", { symbol: true, timeframe: false, crosshair: true, time: true, broadening: false, setupLines: false })
  assert.equal(Model.parseState(savedOff).gridSync.setupLines, false)
  const savedOn = Model.serializeState(["AAPL"], [], "1D", "2x2", { symbol: true, timeframe: false, crosshair: true, time: true, broadening: false, setupLines: true })
  assert.equal(Model.parseState(savedOn).gridSync.setupLines, true)
})

test("resolveHorizontalViewport supports additive TradingView-style right margin and free left/right panning", () => {
  // 1. Default ~9-bar additive right margin on standard 250-bar daily chart (defaultCount=140 -> 140 candles + 9 right slots)
  const vpStd = Model.resolveHorizontalViewport(250, -1, 140, 0, true, -1)
  assert.equal(vpStd.vCount, 140)
  assert.equal(vpStd.slotCount, 140 + Model.DEFAULT_RIGHT_OFFSET_BARS)
  assert.equal(vpStd.flushStart, 250 - vpStd.slotCount)
  assert.equal(vpStd.rightOffsetBars, Model.DEFAULT_RIGHT_OFFSET_BARS)
  assert.equal(vpStd.vStart, 110) // shows exact 140 candles [110..249] + 9 empty right slots
  assert.equal(Math.min(250, vpStd.vStart + vpStd.slotCount) - vpStd.vStart, 140)
  assert.ok(vpStd.maxStart > vpStd.vStart, "user can drag further left to expand right whitespace")

  // 2. Dragging further left (e.g. 40 bars of right whitespace) works and is preserved on new bar arrival
  const vpDraggedLeft = Model.resolveHorizontalViewport(250, -1, 140, 141, true, 40)
  assert.equal(vpDraggedLeft.vStart, 141)
  assert.equal(vpDraggedLeft.rightOffsetBars, 40)
  const vpNextBar = Model.resolveHorizontalViewport(251, -1, 140, 141, true, 40)
  assert.equal(vpNextBar.vStart, 142)
  assert.equal(vpNextBar.rightOffsetBars, 40)

  // 3. Dragging right back to flush (0 margin) and into older history (vStart < flushStart)
  const vpFlush = Model.resolveHorizontalViewport(250, -1, 140, 101, true, 0)
  assert.equal(vpFlush.vStart, 101)
  assert.equal(vpFlush.rightOffsetBars, 0)
  const vpHist = Model.resolveHorizontalViewport(250, -1, 140, 30, false, 0)
  assert.equal(vpHist.vStart, 30)
  assert.equal(vpHist.rightOffsetBars, 0)

  // 4. Full-history chart (e.g. 40 monthly bars, vCount === total): shows ALL 40 bars + 8 right slots and pans freely
  const vpMonthly = Model.resolveHorizontalViewport(40, -1, 40, 0, true, -1)
  assert.equal(vpMonthly.vCount, 40)
  assert.equal(vpMonthly.slotCount, 48)
  assert.equal(vpMonthly.flushStart, 0)
  assert.equal(vpMonthly.rightOffsetBars, 8) // floor(40 * 0.2) = 8
  assert.equal(vpMonthly.vStart, 0)
  assert.equal(Math.min(40, vpMonthly.vStart + vpMonthly.slotCount) - vpMonthly.vStart, 40)
  assert.ok(vpMonthly.maxStart >= 30)
  const vpMonthlyPanned = Model.resolveHorizontalViewport(40, -1, 40, 0, true, 20)
  assert.equal(vpMonthlyPanned.vStart, 12)
  assert.equal(vpMonthlyPanned.rightOffsetBars, 20)

  // 5. Tiny series (10 yearly bars, 1 bar) show all candles without hiding oldest bars
  const vpTiny = Model.resolveHorizontalViewport(10, -1, 10, 0, true, -1)
  assert.equal(vpTiny.slotCount, 12)
  assert.equal(vpTiny.rightOffsetBars, 2)
  assert.equal(vpTiny.vStart, 0)
  assert.equal(Math.min(10, vpTiny.vStart + vpTiny.slotCount) - vpTiny.vStart, 10)
  const vpSingle = Model.resolveHorizontalViewport(1, -1, 1, 0, true, -1)
  assert.equal(vpSingle.slotCount, 1)
  assert.equal(vpSingle.vStart, 0)
  assert.equal(vpSingle.maxStart, 0)
  assert.equal(vpSingle.rightOffsetBars, 0)

  // 6. Requested bar count N always displays exact N candles ending on the current bar (right spacing is additive)
  for (const n of [1, 2, 3, 4, 5, 8, 10, 20, 40, 140]) {
    const vp = Model.resolveHorizontalViewport(250, n, 140, 0, true, -1)
    const expectedRight = Model.defaultRightOffsetBars(n)
    assert.equal(vp.vCount, n, `vCount mismatch for N=${n}`)
    assert.equal(vp.slotCount, n + expectedRight, `slotCount mismatch for N=${n}`)
    assert.equal(vp.rightOffsetBars, expectedRight, `rightOffsetBars mismatch for N=${n}`)
    assert.equal(vp.vStart, 250 - n, `vStart mismatch for N=${n}`)
    const rendered = Math.min(250, vp.vStart + vp.slotCount) - vp.vStart
    assert.equal(rendered, n, `rendered candles must equal requested N=${n}`)
  }

  // 7. 1-bar viewport edge cases (minVisibleChartBars, carried-over offset, 2-bar series, manual pan, live bar arrival)
  assert.equal(Model.minVisibleChartBars(250, 1), 1)
  assert.equal(Model.maxChartViewStart(250, 1), 249)
  const vpOneCarriedOffset = Model.resolveHorizontalViewport(250, 1, 140, 0, true, 9)
  assert.equal(vpOneCarriedOffset.vStart, 249)
  assert.equal(vpOneCarriedOffset.rightOffsetBars, 0)

  const vpOneOfTwo = Model.resolveHorizontalViewport(2, 1, 2, 0, true, -1)
  assert.equal(vpOneOfTwo.vStart, 1)
  assert.equal(vpOneOfTwo.maxStart, 1)

  const vpOnePannedToLatest = Model.resolveHorizontalViewport(250, 1, 140, 249, false, 0)
  assert.equal(vpOnePannedToLatest.vStart, 249)

  const vpOneNextBar = Model.resolveHorizontalViewport(251, 1, 140, 249, true, -1)
  assert.equal(vpOneNextBar.vStart, 250)
  assert.equal(vpOneNextBar.maxStart, 250)
})
