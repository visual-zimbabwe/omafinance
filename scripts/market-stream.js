#!/usr/bin/env node
"use strict";

const https = require("https");
const zlib = require("zlib");
const readline = require("readline");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const os = require("os");
const Model = require("../src/Model.js");

const YAHOO_WS_URL = "wss://streamer.finance.yahoo.com/?version=2";
const COINBASE_WS_URL = "wss://ws-feed.exchange.coinbase.com";
const HYPERLIQUID_WS_URL = "wss://api.hyperliquid.xyz/ws";
const TICK_FLUSH_MS = 150;
const MAX_BACKOFF_MS = 30000;
const HTTP_TIMEOUT_MS = 8000;

const keepAliveAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 16,
  maxFreeSockets: 8
});

function finiteOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function finitePositiveOrNull(v) {
  const n = finiteOrNull(v);
  return (n !== null && n > 0) ? n : null;
}

// ---------------------------------------------------------------------------
// Zero-dependency Yahoo Finance PricingData protobuf wire decoder
// ---------------------------------------------------------------------------
function zigzagDecodeBigInt(u) {
  return (u >> 1n) ^ -(u & 1n);
}

function decodeYahooPricingProtobuf(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input || ""), "base64");
  const fields = {};
  let i = 0;

  function readVarintBigInt() {
    let val = 0n;
    let shift = 0n;
    while (i < buf.length) {
      const b = BigInt(buf[i++]);
      val |= (b & 0x7fn) << shift;
      if ((b & 0x80n) === 0n) return val;
      shift += 7n;
      if (shift > 70n) return val;
    }
    return val;
  }

  while (i < buf.length) {
    const tag = Number(readVarintBigInt());
    const fieldNum = tag >>> 3;
    const wire = tag & 7;
    if (fieldNum === 0) break;

    if (wire === 0) {
      fields[fieldNum] = readVarintBigInt();
    } else if (wire === 1) {
      if (i + 8 > buf.length) break;
      fields[fieldNum] = buf.readDoubleLE(i);
      i += 8;
    } else if (wire === 2) {
      const len = Number(readVarintBigInt());
      if (len < 0 || i + len > buf.length) break;
      fields[fieldNum] = buf.subarray(i, i + len).toString("utf8");
      i += len;
    } else if (wire === 5) {
      if (i + 4 > buf.length) break;
      fields[fieldNum] = buf.readFloatLE(i);
      i += 4;
    } else {
      break;
    }
  }
  return fields;
}

function normalizeYahooTick(decoded) {
  if (!decoded || typeof decoded !== "object") return null;
  const symbol = Model.normalizeSymbol(decoded[1]);
  const price = finitePositiveOrNull(decoded[2]);
  if (!symbol || price === null) return null;

  const quoteType = decoded[6] !== undefined ? Number(decoded[6]) : 0;
  const marketHours = decoded[7] !== undefined ? Number(decoded[7]) : 1;
  const isCrypto = quoteType === 41 || Model.isCryptoSymbol(symbol);

  let timestampMs = Date.now();
  if (decoded[3] !== undefined) {
    const rawTime = typeof decoded[3] === "bigint"
      ? Number(zigzagDecodeBigInt(decoded[3]))
      : Number(decoded[3]);
    if (Number.isFinite(rawTime) && rawTime > 1000000000) {
      timestampMs = rawTime > 1e12 ? rawTime : rawTime * 1000;
    }
  }

  const rawChange = finiteOrNull(decoded[12]);
  const rawChangePct = finiteOrNull(decoded[8]);
  const dayHigh = finitePositiveOrNull(decoded[10]);
  const dayLow = finitePositiveOrNull(decoded[11]);
  const openPrice = finitePositiveOrNull(decoded[15]);
  let dayVolume = null;
  if (decoded[9] !== undefined) {
    const rawVol = typeof decoded[9] === "bigint"
      ? Number(zigzagDecodeBigInt(decoded[9]))
      : Number(decoded[9]);
    if (Number.isFinite(rawVol) && rawVol > 0) dayVolume = rawVol;
  }

  const out = {
    symbol,
    price,
    timestamp: Math.floor(timestampMs / 1000)
  };
  if (typeof decoded[4] === "string" && decoded[4]) out.currency = decoded[4];
  if (dayHigh !== null) out.dayHigh = dayHigh;
  if (dayLow !== null) out.dayLow = dayLow;
  if (openPrice !== null) out.open = openPrice;
  if (dayVolume !== null) out.volume = dayVolume;

  if (isCrypto) {
    out.session = "live";
    out.regularPrice = price;
    out.hasExtended = false;
    if (rawChange !== null) out.change = rawChange;
    if (rawChangePct !== null) {
      out.changePercent = rawChangePct;
      out.regularChangePercent = rawChangePct;
    }
  } else if (marketHours === 1) {
    out.session = "regular";
    out.regularPrice = price;
    out.hasExtended = false;
    if (rawChange !== null) out.change = rawChange;
    if (rawChangePct !== null) {
      out.changePercent = rawChangePct;
      out.regularChangePercent = rawChangePct;
    }
  } else if (marketHours === 0 || marketHours === 2 || marketHours === 3) {
    out.session = marketHours === 0 ? "pre" : "post";
    out.extendedPrice = price;
    out.hasExtended = true;
    if (rawChange !== null) out.change = rawChange;
    if (rawChangePct !== null) {
      out.changePercent = rawChangePct;
      out.extendedChangePercent = rawChangePct;
    }
  } else {
    out.session = "regular";
    out.regularPrice = price;
    if (rawChange !== null) out.change = rawChange;
    if (rawChangePct !== null) {
      out.changePercent = rawChangePct;
      out.regularChangePercent = rawChangePct;
    }
  }

  return out;
}

function normalizeCoinbaseTick(msg) {
  if (!msg || msg.type !== "ticker" || !msg.product_id) return null;
  const symbol = Model.normalizeSymbol(msg.product_id);
  const price = finitePositiveOrNull(msg.price);
  if (!symbol || price === null) return null;

  const open24h = finitePositiveOrNull(msg.open_24h);
  const high24h = finitePositiveOrNull(msg.high_24h);
  const low24h = finitePositiveOrNull(msg.low_24h);
  const vol24h = finitePositiveOrNull(msg.volume_24h);
  const change = open24h !== null ? (price - open24h) : null;
  const changePercent = (open24h !== null && open24h !== 0) ? ((price - open24h) / open24h) * 100 : null;

  const out = {
    symbol,
    currency: "USD",
    price,
    regularPrice: price,
    session: "live",
    hasExtended: false,
    timestamp: Math.floor(Date.now() / 1000)
  };
  if (open24h !== null) {
    out.open = open24h;
    out.previousClose = open24h;
  }
  if (high24h !== null) out.dayHigh = high24h;
  if (low24h !== null) out.dayLow = low24h;
  if (vol24h !== null) out.volume = vol24h;
  if (change !== null) out.change = change;
  if (changePercent !== null) {
    out.changePercent = changePercent;
    out.regularChangePercent = changePercent;
  }
  return out;
}

function normalizeHyperliquidMids(msg, subscribedSymbols) {
  if (!msg || msg.channel !== "allMids" || !msg.data || !msg.data.mids) return [];
  const mids = msg.data.mids;
  const out = [];
  const nowSec = Math.floor(Date.now() / 1000);
  for (const sym of subscribedSymbols || []) {
    const base = Model.cryptoBaseSymbol(sym);
    const price = finitePositiveOrNull(mids[base]);
    if (price === null) continue;
    out.push({
      symbol: sym,
      currency: "USD",
      price,
      regularPrice: price,
      session: "live",
      hasExtended: false,
      timestamp: nowSec
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Symbol Routing & Tick Coalescing Batcher
// ---------------------------------------------------------------------------
function routeSymbols(symbols) {
  const yahoo = [];
  const coinbase = [];
  const hyperliquid = [];
  const seen = new Set();
  for (const raw of symbols || []) {
    const sym = Model.normalizeSymbol(raw);
    if (!sym || seen.has(sym)) continue;
    seen.add(sym);
    if (Model.isHyperliquidCryptoSymbol(sym)) {
      hyperliquid.push(sym);
    } else if (Model.isCoinbaseCryptoSymbol(sym)) {
      coinbase.push(sym);
    } else {
      yahoo.push(sym);
    }
  }
  return { yahoo, coinbase, hyperliquid };
}

class TickBatcher {
  constructor(flushMs, onFlush) {
    this.flushMs = Math.max(16, Number(flushMs) || TICK_FLUSH_MS);
    this.onFlush = onFlush;
    this.pending = new Map();
    this.lastSentSig = new Map();
    this.timer = null;
  }

  push(tick) {
    if (!tick || !tick.symbol) return;
    const sym = tick.symbol;
    const prev = this.pending.get(sym);
    this.pending.set(sym, prev ? Object.assign({}, prev, tick) : tick);
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.flushMs);
      if (this.timer.unref) this.timer.unref();
    }
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending.size === 0) return;
    const batch = {};
    let count = 0;
    for (const [sym, tick] of this.pending.entries()) {
      const sig = `${tick.price}|${tick.session || ""}|${tick.dayHigh || ""}|${tick.dayLow || ""}|${tick.volume || ""}`;
      if (this.lastSentSig.get(sym) === sig) continue;
      this.lastSentSig.set(sym, sig);
      batch[sym] = tick;
      count++;
    }
    this.pending.clear();
    if (count > 0 && typeof this.onFlush === "function") {
      this.onFlush(batch);
    }
  }

  clear() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pending.clear();
  }
}

// ---------------------------------------------------------------------------
// Pooled Keep-Alive HTTPS Client (gzip/deflate aware)
// ---------------------------------------------------------------------------
function httpFetch(url, options) {
  const opts = options || {};
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const method = opts.method || "GET";
      const bodyStr = opts.body ? String(opts.body) : null;
      const headers = Object.assign({
        "User-Agent": "Mozilla/5.0",
        "Accept-Encoding": "gzip, deflate"
      }, opts.headers || {});
      if (bodyStr !== null) {
        headers["Content-Length"] = Buffer.byteLength(bodyStr);
      }

      const req = https.request({
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method,
        headers,
        agent: keepAliveAgent,
        timeout: opts.timeoutMs || HTTP_TIMEOUT_MS
      }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const rawBuf = Buffer.concat(chunks);
          const enc = String(res.headers["content-encoding"] || "").toLowerCase();
          const finish = (err, decodedBuf) => {
            if (err) {
              resolve({ ok: false, status: res.statusCode || 0, data: "" });
              return;
            }
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode || 0,
              data: decodedBuf.toString("utf8")
            });
          };
          if (enc === "gzip") {
            zlib.gunzip(rawBuf, finish);
          } else if (enc === "deflate") {
            zlib.inflate(rawBuf, finish);
          } else {
            finish(null, rawBuf);
          }
        });
      });
      req.on("error", () => resolve({ ok: false, status: 0, data: "" }));
      req.on("timeout", () => {
        req.destroy();
        resolve({ ok: false, status: 0, data: "" });
      });
      if (bodyStr !== null) req.write(bodyStr);
      req.end();
    } catch (e) {
      resolve({ ok: false, status: 0, data: "" });
    }
  });
}

async function fetchChartPayload(symbol, rangeKey) {
  const sym = Model.normalizeSymbol(symbol);
  const rk = String(rangeKey || "1D");
  if (!sym) return null;

  if (Model.isHyperliquidCryptoSymbol(sym) && (rk === "30" || rk === "60" || rk === "1D" || rk === "1W")) {
    const coin = Model.cryptoBaseSymbol(sym);
    const interval = (rk === "30") ? "30m" : ((rk === "60" || rk === "60m") ? "1h" : "1d");
    const lookbackDays = (rk === "30" || rk === "60" || rk === "60m") ? 30 : 400;
    const payload = JSON.stringify({
      type: "candleSnapshot",
      req: { coin, interval, startTime: Date.now() - lookbackDays * 86400000 }
    });
    const res = await httpFetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload
    });
    if (res.ok && res.data) {
      const parsed = Model.parseChart(res.data, rk, sym);
      if (parsed && parsed.candles && parsed.candles.length > 0) return parsed;
    }
  } else {
    const url = Model.chartUrl(sym, rk);
    const res = await httpFetch(url);
    if (res.ok && res.data) {
      const parsed = Model.parseChart(res.data, rk, sym);
      if (parsed && parsed.candles && parsed.candles.length > 0) return parsed;
    }
  }

  // Fallback to Yahoo chart for crypto symbols if Coinbase/Hyperliquid failed
  if (Model.isCryptoSymbol(sym)) {
    const yRes = await httpFetch(Model.yahooChartUrl(sym, rk));
    if (yRes.ok && yRes.data) {
      const parsed = Model.parseChart(yRes.data, rk, sym);
      if (parsed && parsed.candles && parsed.candles.length > 0) return parsed;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Managed WebSocket Provider Controller
// ---------------------------------------------------------------------------
class ProviderSocket {
  constructor(name, url, hooks) {
    this.name = name;
    this.url = url;
    this.hooks = hooks;
    this.ws = null;
    this.symbols = new Set();
    this.connected = false;
    this.failures = 0;
    this.reconnectTimer = null;
    this.disposed = false;
  }

  setSymbols(nextList) {
    const next = new Set(nextList || []);
    const added = [];
    const removed = [];
    for (const s of next) {
      if (!this.symbols.has(s)) added.push(s);
    }
    for (const s of this.symbols) {
      if (!next.has(s)) removed.push(s);
    }
    this.symbols = next;

    if (this.symbols.size === 0) {
      this.close(false);
      return;
    }

    if (!this.ws) {
      this.connect();
      return;
    }

    if (this.connected && (added.length > 0 || removed.length > 0)) {
      try {
        if (this.hooks.onUpdate) {
          this.hooks.onUpdate(this.ws, added, removed, Array.from(this.symbols));
        }
      } catch (e) {}
    }
  }

  connect() {
    if (this.disposed || this.symbols.size === 0 || this.ws) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (typeof WebSocket === "undefined") return;

    let ws;
    try {
      ws = new WebSocket(this.url);
    } catch (e) {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.connected = true;
      this.failures = 0;
      try {
        if (this.hooks.onOpen) this.hooks.onOpen(ws, Array.from(this.symbols));
      } catch (e) {}
      if (this.hooks.onStatus) this.hooks.onStatus();
    };

    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      try {
        if (this.hooks.onMessage) this.hooks.onMessage(ev.data, Array.from(this.symbols));
      } catch (e) {}
    };

    ws.onerror = () => {
      // onclose handles reconnect
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      const wasConnected = this.connected;
      this.connected = false;
      if (wasConnected && this.hooks.onStatus) this.hooks.onStatus();
      if (!this.disposed && this.symbols.size > 0) {
        this.scheduleReconnect();
      }
    };
  }

  scheduleReconnect() {
    if (this.disposed || this.symbols.size === 0 || this.reconnectTimer) return;
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * Math.pow(2, Math.min(5, this.failures)));
    this.failures++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
    if (this.reconnectTimer.unref) this.reconnectTimer.unref();
  }

  close(dispose) {
    if (dispose) this.disposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const ws = this.ws;
    this.ws = null;
    const wasConnected = this.connected;
    this.connected = false;
    if (ws) {
      try { ws.close(); } catch (e) {}
    }
    if (wasConnected && this.hooks.onStatus) this.hooks.onStatus();
  }
}

// ---------------------------------------------------------------------------
// Off-Thread Compact Candle Cache Store (Phase 3 ready)
// ---------------------------------------------------------------------------
class OffThreadCandleCache {
  constructor(cacheDir) {
    this.cacheDir = cacheDir || path.join(os.homedir(), ".cache", "omafinance");
    this.cachePath = path.join(this.cacheDir, "candles.json");
    this.legacyAttackPath = path.join(this.cacheDir, "attack.json");
    // Store compact v2 tuple arrays ([t,o,h,l,c,v]) in RAM to minimize V8 heap footprint
    this.packedEntries = {};
    this.accessTimes = {};
    this.protectedKeys = {};
    this.loaded = false;
    this.dirty = false;
    this.saveTimer = null;
    this.writing = false;
  }

  async load() {
    if (this.loaded) return this.packedEntries;
    try {
      // Remove legacy dead attack.json cache file if present
      fsp.unlink(this.legacyAttackPath).catch(() => {});
      const raw = await fsp.readFile(this.cachePath, "utf8");
      if (raw && raw.length > 2) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          const isV2 = parsed.version === 2 && parsed.entries && typeof parsed.entries === "object";
          const source = isV2 ? parsed.entries : parsed;
          const keys = Object.keys(source);
          for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            const val = source[k];
            if (!Array.isArray(val) || val.length === 0) continue;
            if (isV2 && Array.isArray(val[0])) {
              this.packedEntries[k] = val;
            } else {
              const packed = typeof Model.packCandles === "function" ? Model.packCandles(val) : val;
              if (Array.isArray(packed) && packed.length > 0) {
                this.packedEntries[k] = packed;
              }
            }
          }
          // Auto-migrate legacy v1 17MB cache file down to compact v2 (~5MB)
          if (!isV2 && Object.keys(this.packedEntries).length > 0) {
            this.dirty = true;
            this.scheduleSave();
          }
        }
      }
    } catch (e) {
      // Missing or invalid cache starts clean
    }
    this.loaded = true;
    return this.packedEntries;
  }

  getUnpacked(key) {
    const packed = this.packedEntries[key];
    if (!Array.isArray(packed) || packed.length === 0) return null;
    this.accessTimes[key] = Date.now();
    return typeof Model.unpackCandles === "function" ? Model.unpackCandles(packed) : packed;
  }

  getKeys(keys) {
    const out = {};
    for (const k of keys || []) {
      const unpacked = this.getUnpacked(k);
      if (unpacked && unpacked.length > 0) {
        out[k] = unpacked;
      }
    }
    return out;
  }

  put(key, candles, protectedKeys) {
    if (!key || !Array.isArray(candles) || candles.length === 0) return;
    const packed = typeof Model.packCandles === "function" ? Model.packCandles(candles) : candles;
    if (!Array.isArray(packed) || packed.length === 0) return;
    this.packedEntries[key] = packed;
    this.accessTimes[key] = Date.now();
    if (protectedKeys && typeof protectedKeys === "object") {
      this.protectedKeys = protectedKeys;
    }
    this.dirty = true;
    this.scheduleSave();
  }

  setProtectedKeys(protectedKeys) {
    if (protectedKeys && typeof protectedKeys === "object") {
      this.protectedKeys = protectedKeys;
    }
  }

  scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, 8000);
    if (this.saveTimer.unref) this.saveTimer.unref();
  }

  async flush() {
    if (!this.dirty || this.writing) return;
    this.dirty = false;
    this.writing = true;
    try {
      await fsp.mkdir(this.cacheDir, { recursive: true });
      const pruned = Model.pruneChartCache(this.packedEntries, 600, this.accessTimes, this.protectedKeys);
      this.packedEntries = pruned;
      const payload = JSON.stringify({ version: 2, entries: pruned });
      const tmpPath = this.cachePath + ".tmp." + process.pid;
      await fsp.writeFile(tmpPath, payload, "utf8");
      await fsp.rename(tmpPath, this.cachePath);
    } catch (e) {
      // Ignore write failures cleanly
    } finally {
      this.writing = false;
      if (this.dirty) this.scheduleSave();
    }
  }
}

// ---------------------------------------------------------------------------
// Stdio NDJSON Daemon Runtime
// ---------------------------------------------------------------------------
function startDaemon() {
  function emit(obj) {
    try {
      process.stdout.write(JSON.stringify(obj) + "\n");
    } catch (e) {}
  }

  const batcher = new TickBatcher(TICK_FLUSH_MS, (quotes) => {
    emit({ type: "ticks", quotes });
  });

  const cache = new OffThreadCandleCache();
  const inFlightCharts = new Map();
  let lastStatusSig = "";

  function emitStatus() {
    const status = {
      type: "streamStatus",
      yahoo: yahooSock.connected,
      coinbase: coinbaseSock.connected,
      hyperliquid: hlSock.connected,
      active: yahooSock.connected || coinbaseSock.connected || hlSock.connected
    };
    const sig = `${status.yahoo}|${status.coinbase}|${status.hyperliquid}`;
    if (sig !== lastStatusSig) {
      lastStatusSig = sig;
      emit(status);
    }
  }

  const yahooSock = new ProviderSocket("yahoo", YAHOO_WS_URL, {
    onOpen: (ws, syms) => {
      ws.send(JSON.stringify({ subscribe: syms }));
    },
    onUpdate: (ws, added, removed) => {
      if (removed.length > 0) ws.send(JSON.stringify({ unsubscribe: removed }));
      if (added.length > 0) ws.send(JSON.stringify({ subscribe: added }));
    },
    onMessage: (raw) => {
      const msg = JSON.parse(String(raw || "{}"));
      if (msg.type === "pricing" && msg.message) {
        const dec = decodeYahooPricingProtobuf(msg.message);
        const tick = normalizeYahooTick(dec);
        if (tick) batcher.push(tick);
      }
    },
    onStatus: emitStatus
  });

  const coinbaseSock = new ProviderSocket("coinbase", COINBASE_WS_URL, {
    onOpen: (ws, syms) => {
      ws.send(JSON.stringify({ type: "subscribe", product_ids: syms, channels: ["ticker"] }));
    },
    onUpdate: (ws, added, removed) => {
      if (removed.length > 0) {
        ws.send(JSON.stringify({ type: "unsubscribe", product_ids: removed, channels: ["ticker"] }));
      }
      if (added.length > 0) {
        ws.send(JSON.stringify({ type: "subscribe", product_ids: added, channels: ["ticker"] }));
      }
    },
    onMessage: (raw) => {
      const msg = JSON.parse(String(raw || "{}"));
      const tick = normalizeCoinbaseTick(msg);
      if (tick) batcher.push(tick);
    },
    onStatus: emitStatus
  });

  const hlSock = new ProviderSocket("hyperliquid", HYPERLIQUID_WS_URL, {
    onOpen: (ws) => {
      ws.send(JSON.stringify({ method: "subscribe", subscription: { type: "allMids" } }));
    },
    onUpdate: () => {
      // allMids streams all coins; filtering happens in onMessage using current symbol set
    },
    onMessage: (raw, syms) => {
      const msg = JSON.parse(String(raw || "{}"));
      const ticks = normalizeHyperliquidMids(msg, syms);
      for (let i = 0; i < ticks.length; i++) batcher.push(ticks[i]);
    },
    onStatus: emitStatus
  });

  async function handleCommand(cmd) {
    if (!cmd || typeof cmd !== "object") return;
    const op = cmd.op;

    if (op === "subscribe") {
      const routed = routeSymbols(cmd.symbols || []);
      yahooSock.setSymbols(routed.yahoo);
      coinbaseSock.setSymbols(routed.coinbase);
      hlSock.setSymbols(routed.hyperliquid);
      emitStatus();
      return;
    }

    if (op === "fetchSpark") {
      const syms = Array.isArray(cmd.symbols) ? cmd.symbols : [];
      if (syms.length === 0) {
        emit({ type: "sparkResult", id: cmd.id || "", ok: true, quotes: {} });
        return;
      }
      const url = cmd.lightweight ? Model.sparkQuoteUrl(syms) : Model.sparkUrl(syms);
      const res = await httpFetch(url);
      const quotes = (res.ok && res.data) ? Model.parseSpark(res.data) : {};
      const keys = Object.keys(quotes);
      // Strip bulky candles array from spark quotes to minimize IPC JSON size
      for (let i = 0; i < keys.length; i++) {
        if (quotes[keys[i]] && quotes[keys[i]].candles !== undefined) {
          delete quotes[keys[i]].candles;
        }
      }
      emit({ type: "sparkResult", id: cmd.id || "", ok: keys.length > 0, quotes });
      return;
    }

    if (op === "fetchChart") {
      const sym = Model.normalizeSymbol(cmd.symbol);
      const rk = String(cmd.rangeKey || "1D");
      const key = Model.cacheKey(sym, rk);
      if (!sym) {
        emit({ type: "chartResult", id: cmd.id || "", symbol: "", rangeKey: rk, ok: false });
        return;
      }

      if (!cmd.force) {
        await cache.load();
        const hit = cache.getUnpacked(key);
        if (Array.isArray(hit) && hit.length > 0) {
          emit({
            type: "chartResult",
            id: cmd.id || "",
            symbol: sym,
            rangeKey: rk,
            key,
            ok: true,
            fromCache: true,
            candles: hit
          });
          return;
        }
      }

      let promise = inFlightCharts.get(key);
      if (!promise) {
        promise = fetchChartPayload(sym, rk).finally(() => {
          inFlightCharts.delete(key);
        });
        inFlightCharts.set(key, promise);
      }

      const parsed = await promise;
      if (parsed && Array.isArray(parsed.candles) && parsed.candles.length > 0) {
        const quoteOnly = Object.assign({}, parsed);
        delete quoteOnly.candles;
        cache.put(key, parsed.candles);
        emit({
          type: "chartResult",
          id: cmd.id || "",
          symbol: sym,
          rangeKey: rk,
          key,
          ok: true,
          candles: parsed.candles,
          quote: quoteOnly
        });
      } else {
        emit({ type: "chartResult", id: cmd.id || "", symbol: sym, rangeKey: rk, key, ok: false });
      }
      return;
    }

    if (op === "fetchSearch") {
      const q = String(cmd.query || "");
      const res = await httpFetch(Model.searchUrl(q), { timeoutMs: 5000 });
      const results = (res.ok && res.data) ? Model.parseSearch(res.data) : [];
      emit({ type: "searchResult", id: cmd.id || "", query: q, ok: res.ok, results });
      return;
    }

    if (op === "cacheGet") {
      await cache.load();
      const entries = cache.getKeys(cmd.keys || []);
      emit({ type: "cacheEntries", id: cmd.id || "", entries });
      return;
    }

    if (op === "cachePut") {
      await cache.load();
      cache.put(cmd.key, cmd.candles, cmd.protectedKeys);
      return;
    }

    if (op === "cacheFlush") {
      await cache.load();
      if (cmd.protectedKeys) cache.setProtectedKeys(cmd.protectedKeys);
      await cache.flush();
      emit({ type: "cacheFlushed", id: cmd.id || "" });
      return;
    }
  }

  // Preload disk cache asynchronously on startup (off Qt UI thread)
  cache.load().then(() => {
    emit({ type: "ready", cachedKeys: Object.keys(cache.packedEntries).length });
  });

  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", (line) => {
    const trimmed = String(line || "").trim();
    if (!trimmed) return;
    try {
      const cmd = JSON.parse(trimmed);
      handleCommand(cmd);
    } catch (e) {}
  });

  function shutdown() {
    batcher.clear();
    yahooSock.close(true);
    coinbaseSock.close(true);
    hlSock.close(true);
    cache.flush().finally(() => process.exit(0));
  }

  rl.on("close", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (require.main === module) {
  startDaemon();
}

module.exports = {
  decodeYahooPricingProtobuf,
  normalizeYahooTick,
  normalizeCoinbaseTick,
  normalizeHyperliquidMids,
  routeSymbols,
  TickBatcher,
  OffThreadCandleCache
};
