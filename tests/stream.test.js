const test = require("node:test")
const assert = require("node:assert/strict")
const os = require("node:os")
const fs = require("node:fs")
const path = require("node:path")
const { spawn } = require("node:child_process")
const Stream = require("../scripts/market-stream.js")

function encodeVarint(val) {
  let n = BigInt(val)
  const bytes = []
  while (n >= 0x80n) {
    bytes.push(Number((n & 0x7fn) | 0x80n))
    n >>= 7n
  }
  bytes.push(Number(n))
  return Buffer.from(bytes)
}

function zigzagEncode(val) {
  const n = BigInt(val)
  return (n << 1n) ^ (n >> 63n)
}

function pbString(field, str) {
  const b = Buffer.from(str, "utf8")
  return Buffer.concat([encodeVarint((field << 3) | 2), encodeVarint(b.length), b])
}

function pbFloat(field, num) {
  const b = Buffer.alloc(4)
  b.writeFloatLE(num, 0)
  return Buffer.concat([encodeVarint((field << 3) | 5), b])
}

function pbVarint(field, val) {
  return Buffer.concat([encodeVarint((field << 3) | 0), encodeVarint(val)])
}

test("decodeYahooPricingProtobuf and normalizeYahooTick handle regular, pre/post, and crypto ticks", () => {
  const regularBuf = Buffer.concat([
    pbString(1, "NVDA"),
    pbFloat(2, 152.25),
    pbVarint(3, zigzagEncode(1795000000000n)),
    pbString(4, "USD"),
    pbVarint(6, 8),
    pbVarint(7, 1), // REGULAR_MARKET
    pbFloat(8, 1.5),
    pbVarint(9, zigzagEncode(42000000n)),
    pbFloat(10, 154.0),
    pbFloat(11, 149.5),
    pbFloat(12, 2.25),
    pbFloat(15, 150.0)
  ])
  const decReg = Stream.decodeYahooPricingProtobuf(regularBuf.toString("base64"))
  const tickReg = Stream.normalizeYahooTick(decReg)
  assert.equal(tickReg.symbol, "NVDA")
  assert.ok(Math.abs(tickReg.price - 152.25) < 1e-3)
  assert.equal(tickReg.regularPrice, tickReg.price)
  assert.equal(tickReg.session, "regular")
  assert.equal(tickReg.hasExtended, false)
  assert.equal(tickReg.volume, 42000000)
  assert.equal(tickReg.timestamp, 1795000000)
  assert.ok(Math.abs(tickReg.dayHigh - 154.0) < 1e-3)
  assert.ok(Math.abs(tickReg.dayLow - 149.5) < 1e-3)

  // Post-market tick preserves RTH regularPrice (does not overwrite it) and marks extendedPrice
  const postBuf = Buffer.concat([
    pbString(1, "SPY"),
    pbFloat(2, 729.5),
    pbVarint(3, zigzagEncode(1795038930000n)),
    pbVarint(6, 20),
    pbVarint(7, 2), // POST_MARKET
    pbFloat(8, -0.1),
    pbFloat(12, -0.7)
  ])
  const tickPost = Stream.normalizeYahooTick(Stream.decodeYahooPricingProtobuf(postBuf))
  assert.equal(tickPost.symbol, "SPY")
  assert.equal(tickPost.session, "post")
  assert.equal(tickPost.hasExtended, true)
  assert.ok(Math.abs(tickPost.extendedPrice - 729.5) < 1e-3)
  assert.equal(tickPost.regularPrice, undefined)

  // Crypto tick maps to session "live"
  const cryptoBuf = Buffer.concat([
    pbString(1, "ETH-USD"),
    pbFloat(2, 2450.5),
    pbVarint(6, 41),
    pbVarint(7, 1)
  ])
  const tickCrypto = Stream.normalizeYahooTick(Stream.decodeYahooPricingProtobuf(cryptoBuf))
  assert.equal(tickCrypto.symbol, "ETH-USD")
  assert.equal(tickCrypto.session, "live")
  assert.equal(tickCrypto.hasExtended, false)

  // Overnight tick (marketHours=4) maps to extended "post" and never regular; unknown marketHours maps to "closed"
  const overnightBuf = Buffer.concat([
    pbString(1, "MPWR"),
    pbFloat(2, 1142.05),
    pbVarint(6, 8),
    pbVarint(7, 4) // OVERNIGHT_MARKET
  ])
  const tickOvernight = Stream.normalizeYahooTick(Stream.decodeYahooPricingProtobuf(overnightBuf))
  assert.equal(tickOvernight.symbol, "MPWR")
  assert.equal(tickOvernight.session, "post")
  assert.equal(tickOvernight.hasExtended, true)
  assert.ok(Math.abs(tickOvernight.extendedPrice - 1142.05) < 1e-2)
  assert.equal(tickOvernight.regularPrice, undefined)

  const unknownHoursBuf = Buffer.concat([
    pbString(1, "MPWR"),
    pbFloat(2, 1142.05),
    pbVarint(6, 8),
    pbVarint(7, 9) // unknown / closed
  ])
  const tickClosed = Stream.normalizeYahooTick(Stream.decodeYahooPricingProtobuf(unknownHoursBuf))
  assert.equal(tickClosed.session, "closed")
  assert.equal(tickClosed.regularPrice, undefined)
})

test("normalizeCoinbaseTick and normalizeHyperliquidMids normalize exchange WS messages", () => {
  const cbTick = Stream.normalizeCoinbaseTick({
    type: "ticker",
    product_id: "BTC-USD",
    price: "65000.50",
    open_24h: "64000.00",
    high_24h: "65500.00",
    low_24h: "63500.00",
    volume_24h: "12345.6"
  })
  assert.equal(cbTick.symbol, "BTC-USD")
  assert.equal(cbTick.price, 65000.5)
  assert.equal(cbTick.session, "live")
  assert.equal(cbTick.previousClose, 64000)
  assert.ok(Math.abs(cbTick.change - 1000.5) < 1e-6)

  const hlTicks = Stream.normalizeHyperliquidMids({
    channel: "allMids",
    data: { mids: { HYPE: "24.85", BTC: "65000" } }
  }, ["HYPE32196-USD", "HYPE-USD"])
  assert.equal(hlTicks.length, 2)
  assert.equal(hlTicks[0].symbol, "HYPE32196-USD")
  assert.equal(hlTicks[0].price, 24.85)
  assert.equal(hlTicks[1].symbol, "HYPE-USD")
  assert.equal(hlTicks[1].price, 24.85)
})

test("routeSymbols splits equities, Coinbase crypto, and Hyperliquid crypto cleanly", () => {
  const routed = Stream.routeSymbols(["spy", "NVDA", "BTC-USD", "ETH-USD", "HYPE32196-USD", "PEPE24478-USD", "SPY"])
  assert.deepEqual(routed.yahoo, ["SPY", "NVDA", "PEPE24478-USD"])
  assert.deepEqual(routed.coinbase, ["BTC-USD", "ETH-USD"])
  assert.deepEqual(routed.hyperliquid, ["HYPE32196-USD"])
})

test("TickBatcher coalesces burst ticks per symbol and suppresses unchanged duplicates", () => {
  const flushed = []
  const batcher = new Stream.TickBatcher(100, (batch) => flushed.push(batch))
  batcher.push({ symbol: "SPY", price: 600.1, session: "regular" })
  batcher.push({ symbol: "SPY", price: 600.25, session: "regular", volume: 1000 })
  batcher.push({ symbol: "NVDA", price: 150.0, session: "regular" })
  batcher.flush()
  assert.equal(flushed.length, 1)
  assert.equal(flushed[0].SPY.price, 600.25)
  assert.equal(flushed[0].SPY.volume, 1000)
  assert.equal(flushed[0].NVDA.price, 150.0)

  // Identical signature suppressed on second flush
  batcher.push({ symbol: "SPY", price: 600.25, session: "regular", volume: 1000 })
  batcher.flush()
  assert.equal(flushed.length, 1)

  // Changed price flushes cleanly
  batcher.push({ symbol: "SPY", price: 600.5, session: "regular", volume: 1000 })
  batcher.flush()
  assert.equal(flushed.length, 2)
  assert.equal(flushed[1].SPY.price, 600.5)
})

test("market-stream daemon starts, reports ready over NDJSON stdio, and exits cleanly on EOF", async () => {
  const scriptPath = path.resolve(__dirname, "..", "scripts", "market-stream.js")
  const proc = spawn(process.execPath, [scriptPath], { stdio: ["pipe", "pipe", "pipe"] })
  const lines = []
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { proc.kill(); reject(new Error("daemon startup timeout")) }, 5000)
    let buf = ""
    proc.stdout.on("data", (chunk) => {
      buf += chunk.toString("utf8")
      const parts = buf.split("\n")
      buf = parts.pop()
      for (const p of parts) {
        if (!p.trim()) continue
        const msg = JSON.parse(p)
        lines.push(msg)
        if (msg.type === "ready") {
          clearTimeout(timer)
          proc.stdin.end()
        }
      }
    })
    proc.on("exit", (code) => {
      clearTimeout(timer)
      assert.equal(code, 0)
      resolve()
    })
    proc.on("error", reject)
  })
  assert.ok(lines.some(m => m.type === "ready"))
})

test("OffThreadCandleCache reads legacy v1 format, writes compact v2, and reloads cleanly", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "omafinance-cache-"))
  try {
    const legacy = {
      "SPY_1D": [
        { timestamp: 1792159200, open: 700.1000061, high: 702.5, low: 699.2, close: 701.75, volume: 100000 }
      ]
    }
    fs.writeFileSync(path.join(tmpDir, "candles.json"), JSON.stringify(legacy))

    const cache1 = new Stream.OffThreadCandleCache(tmpDir)
    await cache1.load()
    assert.equal(cache1.getKeys(["SPY_1D"]).SPY_1D[0].close, 701.75)

    cache1.put("NVDA_60", [
      { timestamp: 1792162800, open: 150.120001, high: 151.0, low: 149.8, close: 150.5, volume: 25000 }
    ])
    await cache1.flush()

    const disk = JSON.parse(fs.readFileSync(path.join(tmpDir, "candles.json"), "utf8"))
    assert.equal(disk.version, 2)
    assert.ok(Array.isArray(disk.entries.NVDA_60[0]))
    assert.equal(disk.entries.NVDA_60[0][1], 150.12)

    const cache2 = new Stream.OffThreadCandleCache(tmpDir)
    await cache2.load()
    assert.equal(cache2.getKeys(["NVDA_60"]).NVDA_60[0].open, 150.12)
    assert.equal(cache2.getKeys(["SPY_1D"]).SPY_1D[0].close, 701.75)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test("SetupAlertScanner seeds on hydration without firing, fires once on live RTH break, tracks pullback In-Force, and lazy-emits snapshots only when viewActive", async () => {
  const openRth = new Date("2026-07-15T15:10:00Z") // Wed 11:10 AM EDT
  const bar60Ts = Date.UTC(2026, 6, 15, 14, 30) / 1000
  const bar30Ts = Date.UTC(2026, 6, 15, 15, 0) / 1000
  const dayTs = Date.UTC(2026, 6, 15, 13, 30) / 1000

  const mockCharts = {
    // 60m already triggered 2d-1-2u on startup (should seed WITHOUT firing)
    "NVDA_60": {
      symbol: "NVDA",
      candles: [
        { timestamp: bar60Ts - 10800, open: 105, high: 106, low: 102, close: 103 },
        { timestamp: bar60Ts - 7200, open: 103, high: 104, low: 99, close: 100 },
        { timestamp: bar60Ts - 3600, open: 100.5, high: 102.5, low: 100, close: 102 },
        { timestamp: bar60Ts, open: 102.1, high: 103.0, low: 102.0, close: 102.8 }
      ]
    },
    // 30m currently inside bar (1) waiting to break above 103.50 (2d-1-2u)
    "NVDA_30": {
      symbol: "NVDA",
      candles: [
        { timestamp: bar30Ts - 5400, open: 105, high: 106, low: 103, close: 104 },
        { timestamp: bar30Ts - 3600, open: 104, high: 104.5, low: 101, close: 101.5 },
        { timestamp: bar30Ts - 1800, open: 102, high: 103.5, low: 101.8, close: 103.0 },
        { timestamp: bar30Ts, open: 102.8, high: 103.2, low: 102.6, close: 102.8 }
      ]
    },
    "NVDA_1D": {
      symbol: "NVDA",
      candles: [
        { timestamp: Date.UTC(2026, 4, 15, 13, 30) / 1000, open: 90, high: 95, low: 88, close: 94 },
        { timestamp: Date.UTC(2026, 5, 15, 13, 30) / 1000, open: 94, high: 100, low: 93, close: 99 },
        { timestamp: Date.UTC(2026, 6, 14, 13, 30) / 1000, open: 100, high: 105, low: 99, close: 102 },
        { timestamp: dayTs, open: 102, high: 103.2, low: 101.5, close: 102.8 }
      ]
    }
  }

  const triggered = []
  const snapshots = []
  const metas = []

  const scanner = new Stream.SetupAlertScanner({
    fetchChart: async (sym, tf) => mockCharts[`${sym}_${tf}`] || null,
    resolveHoldings: async (sym) => {
      if (sym === "SMH") return { symbol: "SMH", holdings: [{ symbol: "NVDA", pctVal: 20 }] }
      if (sym === "XLK") return { symbol: "XLK", holdings: [{ symbol: "NVDA", pctVal: 18 }] }
      return { symbol: sym, holdings: [] }
    },
    now: () => openRth,
    snapshotThrottleMs: 10,
    onTrigger: (ev) => triggered.push(ev),
    onSnapshot: (snap) => snapshots.push(snap),
    onMeta: (m) => metas.push(m)
  })

  try {
    await scanner.setConfig(["SMH", "XLK"], {}, true)
    // Wait briefly for async hydration jobs to finish
    await new Promise(r => setTimeout(r, 30))

    // 1. Seeded 60m setup must NOT fire on startup, and closed view receives 0 snapshots
    assert.equal(triggered.length, 0)
    assert.equal(snapshots.length, 0)
    assert.ok(metas.length > 0)
    assert.equal(scanner.collectAllItems().filter(i => i.timeframe === "60").length, 1)
    assert.deepEqual(scanner.collectAllItems()[0].baskets, ["SMH", "XLK"])

    // 2. Live tick breaks 30m trigger (103.50 -> 103.65): fires ONCE even though NVDA is in both SMH & XLK
    scanner.onTick({ symbol: "NVDA", price: 103.65, regularPrice: 103.65, session: "regular", timestamp: bar30Ts + 600 })
    assert.equal(triggered.length, 1)
    assert.equal(triggered[0].symbol, "NVDA")
    assert.equal(triggered[0].timeframe, "30")
    assert.equal(triggered[0].setupGroup, "2-1-2 Reversal")
    assert.equal(triggered[0].inForce, true)
    assert.deepEqual(triggered[0].baskets, ["SMH", "XLK"])

    // 3. Subsequent ticks above trigger do NOT re-fire
    scanner.onTick({ symbol: "NVDA", price: 103.9, regularPrice: 103.9, session: "regular", timestamp: bar30Ts + 605 })
    assert.equal(triggered.length, 1)

    // 4. Opening AlertsWindow immediately emits snapshot; pullback flips inForce to false without re-firing
    scanner.setViewActive(true)
    assert.equal(snapshots.length, 1)
    const snap30 = snapshots[0].items.find(i => i.timeframe === "30")
    assert.equal(snap30.inForce, true)

    scanner.onTick({ symbol: "NVDA", price: 103.1, regularPrice: 103.1, session: "regular", timestamp: bar30Ts + 610 })
    assert.equal(triggered.length, 1)
    await new Promise(r => setTimeout(r, 30))
    const latestSnap30 = snapshots[snapshots.length - 1].items.find(i => i.timeframe === "30")
    assert.equal(latestSnap30.inForce, false)

    // 5. After-hours equity break updates snapshot without firing; crypto fires 24/7
    const weekendDate = new Date("2026-07-18T15:10:00Z")
    const weekendTriggers = []
    const cryptoTs = Date.UTC(2026, 6, 18, 15, 0) / 1000
    const cryptoScanner = new Stream.SetupAlertScanner({
      fetchChart: async (sym, tf) => {
        if (tf === "30") {
          return {
            symbol: sym,
            candles: [
              { timestamp: cryptoTs - 5400, open: 105, high: 106, low: 103, close: 104 },
              { timestamp: cryptoTs - 3600, open: 104, high: 104.5, low: 101, close: 101.5 },
              { timestamp: cryptoTs - 1800, open: 102, high: 103.5, low: 101.8, close: 103.0 },
              { timestamp: cryptoTs, open: 102.8, high: 103.2, low: 102.6, close: 102.8 }
            ]
          }
        }
        return null
      },
      resolveHoldings: async () => ({ holdings: [] }),
      now: () => weekendDate,
      onTrigger: (ev) => weekendTriggers.push(ev)
    })
    try {
      await cryptoScanner.setConfig(["NVDA", "BTC-USD"], {}, true)
      await new Promise(r => setTimeout(r, 30))
      cryptoScanner.onTick({ symbol: "NVDA", price: 104.0, regularPrice: 104.0, session: "regular", timestamp: cryptoTs + 60 })
      cryptoScanner.onTick({ symbol: "BTC-USD", price: 104.0, regularPrice: 104.0, session: "live", timestamp: cryptoTs + 60 })
      assert.equal(weekendTriggers.length, 1)
      assert.equal(weekendTriggers[0].symbol, "BTC-USD")
    } finally {
      cryptoScanner.dispose()
    }
  } finally {
    scanner.dispose()
  }
})

test("OffThreadCandleCache persists fetchedAt and SetupAlertScanner rehydrates stale prior-week cache on weekends", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "omafinance-stale-cache-"))
  try {
    const c1 = new Stream.OffThreadCandleCache(tmpDir)
    await c1.load()
    const priorFri = Date.UTC(2026, 10, 13, 14, 30) / 1000
    const prevWeek = Date.UTC(2026, 10, 6, 14, 30) / 1000
    const stale1D = [
      { timestamp: prevWeek, open: 200, high: 210, low: 170, close: 180, volume: 100 },
      { timestamp: priorFri, open: 178, high: 188, low: 173, close: 184, volume: 100 }
    ]
    const savedAt = Date.UTC(2026, 10, 13, 21, 10)
    c1.put("DDOG_1D", stale1D, null, savedAt)
    await c1.flush()

    const c2 = new Stream.OffThreadCandleCache(tmpDir)
    await c2.load()
    assert.equal(c2.getFetchedAt("DDOG_1D"), savedAt)

    const fetchedCalls = []
    const sunNov22 = new Date("2026-11-22T22:55:00Z")
    const freshFri = Date.UTC(2026, 10, 20, 14, 30) / 1000
    const fresh1D = [
      ...stale1D,
      { timestamp: freshFri, open: 182, high: 182, low: 156, close: 157, volume: 120 }
    ]
    const scanner = new Stream.SetupAlertScanner({
      cache: c2,
      now: () => sunNov22,
      resolveHoldings: async () => ({ holdings: [] }),
      fetchChart: async (sym, tf) => {
        fetchedCalls.push(`${sym}_${tf}`)
        if (sym === "DDOG" && tf === "1D") return { symbol: "DDOG", candles: fresh1D }
        return null
      }
    })
    try {
      await scanner.setConfig(["DDOG"], {}, true)
      await new Promise(r => setTimeout(r, 40))
      assert.ok(fetchedCalls.includes("DDOG_1D"), "stale prior-week 1D must be refetched on weekend")
      const st = scanner.symbolState.get("DDOG")
      assert.equal(st.candles["1D"].length, 3)
      // External chart update (e.g. from GridWindow) updates tracked state immediately
      scanner.onExternalChartUpdate("DDOG", "1D", {
        symbol: "DDOG",
        candles: [
          ...fresh1D.slice(0, 2),
          { timestamp: freshFri, open: 182, high: 182, low: 155, close: 155.5, volume: 130 }
        ]
      })
      assert.equal(st.candles["1D"][2].close, 155.5)
    } finally {
      scanner.dispose()
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test("updateTrailingCandleInPlace blocks off-RTH and weekend phantom rollovers on US equities", () => {
  const Model = require("../src/Model.js")
  const sunEve = new Date("2026-11-22T23:23:00Z")
  const fri30 = [
    { timestamp: Date.UTC(2026, 10, 20, 20, 0) / 1000, open: 1161.26, high: 1163.58, low: 1147.01, close: 1149.96, volume: 100 },
    { timestamp: Date.UTC(2026, 10, 20, 20, 30) / 1000, open: 1149.31, high: 1157.00, low: 1132.78, close: 1142.05, volume: 100 }
  ]
  const fri60 = [
    { timestamp: Date.UTC(2026, 10, 20, 19, 30) / 1000, open: 1163.74, high: 1167.92, low: 1147.01, close: 1149.96, volume: 100 },
    { timestamp: Date.UTC(2026, 10, 20, 20, 30) / 1000, open: 1149.31, high: 1157.00, low: 1132.78, close: 1142.05, volume: 100 }
  ]
  const fri1D = [
    { timestamp: Date.UTC(2026, 10, 19, 14, 30) / 1000, open: 1368.30, high: 1378.06, low: 1288.08, close: 1295.86, volume: 100 },
    { timestamp: Date.UTC(2026, 10, 20, 14, 30) / 1000, open: 1260.38, high: 1271.13, low: 1132.78, close: 1142.05, volume: 100 }
  ]
  const spoofTick = { symbol: "MPWR", price: 1142.05, regularPrice: 1142.05, session: "regular" }

  const res30 = Stream.updateTrailingCandleInPlace(fri30, spoofTick, "30", sunEve)
  const res60 = Stream.updateTrailingCandleInPlace(fri60, spoofTick, "60", sunEve)
  const res1D = Stream.updateTrailingCandleInPlace(fri1D, spoofTick, "1D", sunEve)
  assert.equal(res30.length, 2)
  assert.equal(res60.length, 2)
  assert.equal(res1D.length, 2)
  assert.equal(Model.stratScenario(res30[1], res30[0]), "2d")
  assert.equal(Model.stratScenario(res60[1], res60[0]), "2d")
  assert.equal(Model.stratScenario(res1D[1], res1D[0]), "2d")
})

test("SetupAlertScanner enforces multi-TF ticker qualification gate for both push delivery and snapshots without stale bursts", async () => {
  const openRth = new Date("2026-07-15T15:10:00Z") // Wed 11:10 AM EDT
  const bar30Ts = Date.UTC(2026, 6, 15, 15, 0) / 1000
  const bar60Ts = Date.UTC(2026, 6, 15, 14, 30) / 1000

  // Weekly structure:
  //   Week 1 (Jun 22): high 108, low 102
  //   Week 2 (Jun 29): 2d (high 106, low 98)
  //   Week 3 (Jul 6):  1 inside Week 2 (high 104, low 100) -> 1W 2d-1-2u trigger = 104.00
  //   Week 4 (Jul 13..15): currently inside/below 104.00 (high 103.2, low 101.0)
  const makeUnbrokenWeekly1D = (curHigh, curClose) => ([
    { timestamp: Date.UTC(2026, 5, 22, 13, 30) / 1000, open: 103, high: 108, low: 102, close: 106 },
    { timestamp: Date.UTC(2026, 5, 29, 13, 30) / 1000, open: 105, high: 106, low: 98, close: 101 },
    { timestamp: Date.UTC(2026, 6, 6, 13, 30) / 1000, open: 101, high: 104, low: 100, close: 103 },
    { timestamp: Date.UTC(2026, 6, 15, 13, 30) / 1000, open: 102.5, high: curHigh, low: 101.0, close: curClose }
  ])

  // 30m inside bar (1) waiting to break UP above 103.50 (2d-1-2u) OR DOWN below 101.80 (2d-1-2d)
  const makeReady30 = () => ([
    { timestamp: bar30Ts - 5400, open: 105, high: 106, low: 103, close: 104 },
    { timestamp: bar30Ts - 3600, open: 104, high: 104.5, low: 101, close: 101.5 },
    { timestamp: bar30Ts - 1800, open: 102, high: 103.5, low: 101.8, close: 103.0 },
    { timestamp: bar30Ts, open: 102.8, high: 103.2, low: 102.6, close: 102.8 }
  ])

  // 60m waiting for 2u-1-2d SHORT break below 102.00 (proving both LONG & SHORT pass once 1W qualifies)
  const makeReady60Short = () => ([
    { timestamp: bar60Ts - 10800, open: 99, high: 101, low: 98, close: 100 },
    { timestamp: bar60Ts - 7200, open: 100, high: 106, low: 99.5, close: 105 }, // 2u
    { timestamp: bar60Ts - 3600, open: 104.5, high: 105.0, low: 102.0, close: 102.5 }, // 1 (short trigger=102.00)
    { timestamp: bar60Ts, open: 102.8, high: 104.2, low: 102.4, close: 103.0 }
  ])

  const mockCharts = {
    // AMD: NO 1W/1M setup yet (curHigh 103.2 < 104.00)
    "AMD_1D": { symbol: "AMD", candles: makeUnbrokenWeekly1D(103.2, 102.8) },
    "AMD_30": { symbol: "AMD", candles: makeReady30() },
    "AMD_60": { symbol: "AMD", candles: makeReady60Short() },
    // NVDA: starts NOT triggered on 1W (curHigh 103.2 < 104.00), will break 1W on live tick
    "NVDA_1D": { symbol: "NVDA", candles: makeUnbrokenWeekly1D(103.2, 102.8) },
    "NVDA_30": { symbol: "NVDA", candles: makeReady30() },
    "NVDA_60": { symbol: "NVDA", candles: makeReady60Short() }
  }

  let fetchCount = 0
  const triggered = []
  const snapshots = []
  const metas = []

  const scanner = new Stream.SetupAlertScanner({
    fetchChart: async (sym, tf) => {
      fetchCount++
      return mockCharts[`${sym}_${tf}`] || null
    },
    resolveHoldings: async () => ({ holdings: [] }),
    now: () => openRth,
    snapshotThrottleMs: 10,
    onTrigger: (ev) => triggered.push(ev),
    onSnapshot: (snap) => snapshots.push(snap),
    onMeta: (m) => metas.push(m)
  })

  try {
    scanner.setViewActive(true)
    await scanner.setConfig(["AMD", "NVDA"], {}, true, ["1W", "1M"])
    await new Promise(r => setTimeout(r, 40))

    assert.equal(triggered.length, 0)
    assert.equal(scanner.collectAllItems().length, 0)
    assert.deepEqual(scanner.buildStatus().gateTimeframes, ["1W", "1M"])
    assert.equal(scanner.buildStatus().qualifiedSymbols, 0)

    // 1. AMD breaks 30m UP (103.65 > 103.50) while NOT qualified on 1W/1M -> suppressed from push & watchlist!
    scanner.onTick({ symbol: "AMD", price: 103.65, regularPrice: 103.65, session: "regular", timestamp: bar30Ts + 300 })
    assert.equal(triggered.length, 0)
    assert.equal(scanner.collectAllItems().length, 0)

    // 2. Simultaneous break on NVDA: single tick at 104.25 breaks BOTH 1W (104.00) AND 30m (103.50) -> BOTH fire!
    scanner.onTick({ symbol: "NVDA", price: 104.25, regularPrice: 104.25, session: "regular", timestamp: bar30Ts + 310 })
    const nvdaTfs = triggered.map(e => `${e.symbol}:${e.timeframe}`).sort()
    assert.ok(nvdaTfs.includes("NVDA:1W"), "1W setup fires immediately on break")
    assert.ok(nvdaTfs.includes("NVDA:30"), "30m setup crossing on same tick as 1W also fires")
    assert.deepEqual(triggered.find(e => e.timeframe === "30").qualifiedBy, ["1W"])
    assert.equal(scanner.buildStatus().qualifiedSymbols, 1)
    assert.ok(scanner.collectAllItems().every(i => i.symbol === "NVDA"))

    // 3. Once NVDA is in the 1W-triggered subset, a counter-direction 60m SHORT break (101.90 < 102.00) ALSO passes!
    scanner.onTick({ symbol: "NVDA", price: 101.90, regularPrice: 101.90, session: "regular", timestamp: bar30Ts + 320 })
    const hit60Short = triggered.find(e => e.symbol === "NVDA" && e.timeframe === "60" && e.direction === "SHORT")
    assert.ok(hit60Short, "both LONG and SHORT setups pass once ticker qualifies on gate TF")
    assert.deepEqual(hit60Short.qualifiedBy, ["1W"])

    // 4. Clearing gate back to ANY ([]) updates snapshots immediately with ZERO refetches and ZERO stale alert bursts for AMD!
    const fetchesBeforeClear = fetchCount
    const triggersBeforeClear = triggered.length
    scanner.setGateTimeframes([])
    assert.equal(fetchCount, fetchesBeforeClear)
    assert.equal(triggered.length, triggersBeforeClear, "clearing gate must never burst previously suppressed setups")
    assert.ok(scanner.collectAllItems().some(i => i.symbol === "AMD" && i.timeframe === "30"))
    assert.ok(snapshots[snapshots.length - 1].items.some(i => i.symbol === "AMD"))

    // 5. Fail-closed guard: while 1D/1W has not seeded yet on a ticker, a 30m live break does not leak past ["1W"] gate
    const partialTriggers = []
    const partialScanner = new Stream.SetupAlertScanner({
      fetchChart: async (sym, tf) => (tf === "30" ? { symbol: sym, candles: makeReady30() } : null),
      resolveHoldings: async () => ({ holdings: [] }),
      now: () => openRth,
      onTrigger: (ev) => partialTriggers.push(ev)
    })
    try {
      await partialScanner.setConfig(["AMD"], {}, true, ["1W"])
      await new Promise(r => setTimeout(r, 30))
      partialScanner.onTick({ symbol: "AMD", price: 103.75, regularPrice: 103.75, session: "regular", timestamp: bar30Ts + 400 })
      assert.equal(partialTriggers.length, 0)
      assert.equal(partialScanner.collectAllItems().length, 0)
    } finally {
      partialScanner.dispose()
    }
  } finally {
    scanner.dispose()
  }
})
