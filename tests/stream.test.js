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
