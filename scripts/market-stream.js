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
const Holdings = require("./fetch-etf-holdings.js");

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

function normalizeYahooTick(decoded, nowDate) {
  if (!decoded || typeof decoded !== "object") return null;
  const symbol = Model.normalizeSymbol(decoded[1]);
  const price = finitePositiveOrNull(decoded[2]);
  if (!symbol || price === null) return null;

  const quoteType = decoded[6] !== undefined ? Number(decoded[6]) : 0;
  const isCrypto = quoteType === 41 || Model.isCryptoSymbol(symbol);

  let timestampMs = (nowDate instanceof Date && Number.isFinite(nowDate.getTime())) ? nowDate.getTime() : Date.now();
  if (decoded[3] !== undefined) {
    const rawTime = typeof decoded[3] === "bigint"
      ? Number(zigzagDecodeBigInt(decoded[3]))
      : Number(decoded[3]);
    if (Number.isFinite(rawTime) && rawTime > 1000000000) {
      timestampMs = rawTime > 1e12 ? rawTime : rawTime * 1000;
    }
  }

  // Proto3 omits field 7 when marketHours === 0 (PRE_MARKET).
  // Safety net: if omitted during confirmed US RTH, treat as regular so RTH ticks are not dropped.
  const hasMarketHours = decoded[7] !== undefined;
  let marketHours = hasMarketHours ? Number(decoded[7]) : 0;
  if (!isCrypto && !hasMarketHours && Model.isUsMarketOpen(new Date(timestampMs), false)) {
    marketHours = 1;
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
  } else if (marketHours === 0 || marketHours === 2 || marketHours === 3 || marketHours === 4) {
    out.session = marketHours === 0 ? "pre" : "post";
    out.extendedPrice = price;
    out.hasExtended = true;
    if (rawChange !== null) out.change = rawChange;
    if (rawChangePct !== null) {
      out.changePercent = rawChangePct;
      out.extendedChangePercent = rawChangePct;
    }
  } else {
    out.session = "closed";
    out.hasExtended = false;
    if (rawChange !== null) out.change = rawChange;
    if (rawChangePct !== null) out.changePercent = rawChangePct;
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

  clearSentForSymbols(symbols) {
    if (!Array.isArray(symbols)) {
      this.lastSentSig.clear();
      return;
    }
    for (let i = 0; i < symbols.length; i++) {
      this.lastSentSig.delete(symbols[i]);
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
    this.watchdogTimer = null;
    this.lastMessageAt = 0;
    this._watchdogActive = false;
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
      this.lastMessageAt = Date.now();
      this._watchdogActive = false;
      this.startWatchdog();
      try {
        if (this.hooks.onOpen) this.hooks.onOpen(ws, Array.from(this.symbols));
      } catch (e) {}
      if (this.hooks.onStatus) this.hooks.onStatus();
    };

    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      this.lastMessageAt = Date.now();
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
      this.stopWatchdog();
      const wasConnected = this.connected;
      this.connected = false;
      if (wasConnected && this.hooks.onStatus) this.hooks.onStatus();
      if (!this.disposed && this.symbols.size > 0) {
        this.scheduleReconnect();
      }
    };
  }

  startWatchdog() {
    this.stopWatchdog();
    const staleMs = this.hooks && Number(this.hooks.staleTimeoutMs);
    if (!Number.isFinite(staleMs) || staleMs <= 0) return;
    this.watchdogTimer = setInterval(() => {
      if (this.disposed || !this.connected || this.symbols.size === 0) return;
      const active = !this.hooks.shouldWatchdog || Boolean(this.hooks.shouldWatchdog());
      if (!active) {
        this._watchdogActive = false;
        return;
      }
      if (!this._watchdogActive) {
        this._watchdogActive = true;
        this.lastMessageAt = Date.now();
        return;
      }
      if (Date.now() - this.lastMessageAt > staleMs) {
        const syms = Array.from(this.symbols);
        if (this.hooks.onStaleReconnect) {
          try { this.hooks.onStaleReconnect(syms); } catch (e) {}
        }
        this.close(false);
        this.scheduleReconnect();
      }
    }, 15000);
    if (this.watchdogTimer.unref) this.watchdogTimer.unref();
  }

  stopWatchdog() {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    this._watchdogActive = false;
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
    this.stopWatchdog();
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
    // Store compact v2 tuple arrays ([t,o,h,l,c,v]) in RAM to minimize V8 heap footprint
    this.packedEntries = {};
    this.fetchedAt = {};
    this.accessTimes = {};
    this.protectedKeys = {};
    this.maxEntries = 600;
    this.loaded = false;
    this.dirty = false;
    this.saveTimer = null;
    this.writing = false;
  }

  setMaxEntries(maxEntries) {
    const n = Number(maxEntries);
    if (Number.isFinite(n) && n >= 600) {
      this.maxEntries = Math.floor(n);
    }
  }

  async load() {
    if (this.loaded) return this.packedEntries;
    try {
      const raw = await fsp.readFile(this.cachePath, "utf8");
      if (raw && raw.length > 2) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          const isV2 = parsed.version === 2 && parsed.entries && typeof parsed.entries === "object";
          const source = isV2 ? parsed.entries : parsed;
          const savedFetchedAt = (isV2 && parsed.fetchedAt && typeof parsed.fetchedAt === "object") ? parsed.fetchedAt : null;
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
            if (savedFetchedAt && Number.isFinite(Number(savedFetchedAt[k])) && Number(savedFetchedAt[k]) > 0) {
              this.fetchedAt[k] = Number(savedFetchedAt[k]);
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

  getFetchedAt(key) {
    const ts = Number(this.fetchedAt[key]);
    return (Number.isFinite(ts) && ts > 0) ? ts : 0;
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

  put(key, candles, protectedKeys, fetchedAtMs) {
    if (!key || !Array.isArray(candles) || candles.length === 0) return;
    const packed = typeof Model.packCandles === "function" ? Model.packCandles(candles) : candles;
    if (!Array.isArray(packed) || packed.length === 0) return;
    const nowMs = Date.now();
    this.packedEntries[key] = packed;
    this.fetchedAt[key] = (Number.isFinite(Number(fetchedAtMs)) && Number(fetchedAtMs) > 0) ? Number(fetchedAtMs) : nowMs;
    this.accessTimes[key] = nowMs;
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
      const pruned = Model.pruneChartCache(this.packedEntries, this.maxEntries, this.accessTimes, this.protectedKeys);
      this.packedEntries = pruned;
      const prunedFetchedAt = {};
      for (const k of Object.keys(pruned)) {
        if (this.fetchedAt[k] > 0) prunedFetchedAt[k] = this.fetchedAt[k];
      }
      this.fetchedAt = prunedFetchedAt;
      const payload = JSON.stringify({ version: 2, entries: pruned, fetchedAt: prunedFetchedAt });
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
// Off-Thread Strat Setup Line Alert Scanner
// ---------------------------------------------------------------------------
const ALERT_HYDRATION_TFS = ["1D", "60", "30"];
const ALERT_EVAL_TFS = ["30", "60", "1D", "1W", "1M"];

function updateTrailingCandleInPlace(candles, quote, tf, nowDate) {
  if (!Array.isArray(candles) || candles.length === 0 || !quote) return candles;
  if (quote.session && quote.session !== "regular" && quote.session !== "live") {
    return candles;
  }
  const rawPrice = quote.regularPrice != null
    ? quote.regularPrice
    : (quote.regularMarketPrice != null ? quote.regularMarketPrice : quote.price);
  const price = finitePositiveOrNull(rawPrice);
  if (price === null) return candles;

  const now = (nowDate instanceof Date && Number.isFinite(nowDate.getTime())) ? nowDate : new Date();
  if (quote.symbol && Model.isUsEquitySessionSymbol(quote.symbol)) {
    const rthSched = Model.getUsSessionSchedule(now, quote);
    if (rthSched.isWeekend || rthSched.mins < rthSched.openMins - 2 || rthSched.mins > rthSched.closeMins + 2) {
      return candles;
    }
  }
  const nowSec = Math.floor(now.getTime() / 1000);
  const last = candles[candles.length - 1];
  if (!last || !Number.isFinite(last.timestamp)) return candles;

  // Check if a bar rollover occurred; only delegate to full updateDevelopingCandle on rollover
  let rolled = false;
  if (tf === "30") {
    rolled = nowSec >= last.timestamp + 1800;
  } else if (tf === "60") {
    const dur = Model.candleDurationSec(last, "60", quote.symbol, now, quote);
    rolled = nowSec >= last.timestamp + dur;
  } else if (tf === "1D") {
    rolled = nowSec > last.timestamp && Model.marketDateEt(nowSec) !== Model.marketDateEt(last.timestamp);
  } else if (tf === "1W") {
    rolled = nowSec > last.timestamp && Model.marketWeekStartEt(nowSec) !== Model.marketWeekStartEt(last.timestamp);
  } else if (tf === "1M") {
    rolled = nowSec > last.timestamp && Model.marketDateEt(nowSec).slice(0, 7) !== Model.marketDateEt(last.timestamp).slice(0, 7);
  }

  if (rolled) {
    return Model.updateDevelopingCandle(candles, quote, tf, now);
  }

  // O(1) in-place update without array allocation
  last.close = price;
  if (!Number.isFinite(last.high) || price > last.high) last.high = price;
  if (!Number.isFinite(last.low) || price < last.low) last.low = price;
  if (tf === "1D") {
    const qTs = finiteOrNull(quote.timestamp);
    if (qTs === null || Model.marketDateEt(qTs) === Model.marketDateEt(nowSec)) {
      const dHigh = finitePositiveOrNull(quote.regularMarketDayHigh != null ? quote.regularMarketDayHigh : quote.dayHigh);
      const dLow = finitePositiveOrNull(quote.regularMarketDayLow != null ? quote.regularMarketDayLow : quote.dayLow);
      if (dHigh !== null && dHigh > last.high) last.high = dHigh;
      if (dLow !== null && dLow < last.low) last.low = dLow;
    }
  }
  return candles;
}

class SetupAlertScanner {
  constructor(options) {
    const opts = options || {};
    this.cache = opts.cache || null;
    this.fetchChart = opts.fetchChart || fetchChartPayload;
    this.resolveHoldings = opts.resolveHoldings || Holdings.resolveEtfHoldings;
    this.maxHoldingsPerBasket = Math.max(10, Number(opts.maxHoldingsPerBasket) || 75);
    this.hydrationConcurrency = Math.max(1, Number(opts.hydrationConcurrency) || 6);
    this.reconcileConcurrency = Math.max(1, Number(opts.reconcileConcurrency) || 4);
    this.snapshotThrottleMs = Math.max(10, Number(opts.snapshotThrottleMs) || 300);
    this.now = typeof opts.now === "function" ? opts.now : () => new Date();

    this.onSymbolsChanged = opts.onSymbolsChanged || null;
    this.onTrigger = opts.onTrigger || null;
    this.onSnapshot = opts.onSnapshot || null;
    this.onMeta = opts.onMeta || null;

    this.enabled = true;
    this.viewActive = false;
    this.sources = [];
    this.gateTimeframes = [];
    this.resolvedBaskets = {};
    this.firedKeys = {};
    this.liveTriggeredAt = {};
    this.symbolState = new Map();

    this.configVersion = 0;
    this.queue = [];
    this.queuedKeys = new Set();
    this.inFlightCount = 0;
    this.hydrating = false;

    this.snapshotTimer = null;
    this.lastSnapshotSig = "";
    this.lastMetaSig = "";
    this.boundaryTimer = null;
    this.lastBucket30 = -1;
    this.lastBucket60 = -1;
    this.lastMarketDateEt = "";
    this.disposed = false;
  }

  getTrackedSymbols() {
    return Array.from(this.symbolState.keys());
  }

  hasTrackedSymbol(sym) {
    return this.symbolState.has(sym);
  }

  startBoundaryTimer() {
    if (this.boundaryTimer || this.disposed) return;
    this.boundaryTimer = setInterval(() => this.checkBarBoundaries(), 15000);
    if (this.boundaryTimer.unref) this.boundaryTimer.unref();
  }

  stopBoundaryTimer() {
    if (this.boundaryTimer) {
      clearInterval(this.boundaryTimer);
      this.boundaryTimer = null;
    }
  }

  dispose() {
    this.disposed = true;
    this.stopBoundaryTimer();
    if (this.snapshotTimer) {
      clearTimeout(this.snapshotTimer);
      this.snapshotTimer = null;
    }
    this.queue = [];
    this.queuedKeys.clear();
  }

  async resolveSourceMembers(source) {
    const tok = String(source || "").trim();
    if (!tok) return { basket: "", symbols: [], meta: null };
    if (tok.charAt(0) === "@") {
      const presetSyms = Model.resolveTickerPreset(tok) || [];
      return {
        basket: tok,
        symbols: presetSyms,
        meta: { kind: "preset", count: presetSyms.length, total: presetSyms.length, capped: false }
      };
    }

    const norm = Model.normalizeSymbol(tok);
    if (!norm) return { basket: "", symbols: [], meta: null };

    // Try ETF holdings resolution (returns empty holdings for plain stocks/crypto)
    let holdingsData = null;
    if (!Model.isCryptoSymbol(norm)) {
      try {
        holdingsData = await this.resolveHoldings(norm);
      } catch (e) {
        holdingsData = null;
      }
    }

    if (holdingsData && Array.isArray(holdingsData.holdings) && holdingsData.holdings.length > 0) {
      const active = [];
      const seen = new Set();
      const sorted = holdingsData.holdings.slice().sort((a, b) => (Number(b && b.pctVal) || 0) - (Number(a && a.pctVal) || 0));
      for (let i = 0; i < sorted.length; i++) {
        const h = sorted[i];
        if (!h || h.delisted === true) continue;
        const s = Model.normalizeSymbol(h.symbol);
        if (!s || seen.has(s)) continue;
        seen.add(s);
        active.push(s);
      }
      if (active.length > 0) {
        const capped = active.length > this.maxHoldingsPerBasket;
        const selected = capped ? active.slice(0, this.maxHoldingsPerBasket) : active;
        return {
          basket: norm,
          symbols: selected,
          meta: { kind: "etf", count: selected.length, total: active.length, capped }
        };
      }
    }

    return {
      basket: "Custom",
      symbols: [norm],
      meta: { kind: "symbol", count: 1, total: 1, capped: false }
    };
  }

  async setConfig(sources, persistedFiredKeys, enabled, gateTimeframes) {
    const ver = ++this.configVersion;
    this.enabled = enabled !== false;
    this.sources = Model.normalizeAlertSources(sources);
    if (gateTimeframes !== undefined) {
      this.gateTimeframes = Model.normalizeAlertGateTimeframes(gateTimeframes);
    }
    if (persistedFiredKeys && typeof persistedFiredKeys === "object") {
      const merged = Object.assign({}, this.firedKeys, persistedFiredKeys);
      this.firedKeys = Model.normalizeFiredSetupKeys(merged, this.now().getTime());
    }

    if (!this.enabled || this.sources.length === 0) {
      this.symbolState.clear();
      this.resolvedBaskets = {};
      this.queue = [];
      this.queuedKeys.clear();
      this.hydrating = false;
      this.stopBoundaryTimer();
      if (this.onSymbolsChanged) this.onSymbolsChanged([]);
      this.emitMeta(true);
      if (this.viewActive) this.emitSnapshot(true);
      return;
    }

    const nextBasketsBySym = new Map();
    const nextResolvedBaskets = {};
    for (let i = 0; i < this.sources.length; i++) {
      const src = this.sources[i];
      const res = await this.resolveSourceMembers(src);
      if (ver !== this.configVersion || this.disposed) return;
      if (!res.basket || res.symbols.length === 0) continue;
      nextResolvedBaskets[src] = res.meta;
      for (let j = 0; j < res.symbols.length; j++) {
        const sym = res.symbols[j];
        if (!nextBasketsBySym.has(sym)) nextBasketsBySym.set(sym, []);
        const list = nextBasketsBySym.get(sym);
        if (list.indexOf(res.basket) === -1) list.push(res.basket);
      }
    }

    if (ver !== this.configVersion || this.disposed) return;
    this.resolvedBaskets = nextResolvedBaskets;

    // Remove symbols no longer tracked
    for (const existingSym of Array.from(this.symbolState.keys())) {
      if (!nextBasketsBySym.has(existingSym)) {
        this.symbolState.delete(existingSym);
      }
    }

    // Add or update retained symbols
    for (const [sym, baskets] of nextBasketsBySym.entries()) {
      let st = this.symbolState.get(sym);
      if (!st) {
        st = {
          symbol: sym,
          baskets: baskets.slice(),
          candles: { "30": [], "60": [], "1D": [], "1W": [], "1M": [] },
          fetchedAt: { "30": 0, "60": 0, "1D": 0 },
          seeded: { "30": false, "60": false, "1D": false, "1W": false, "1M": false },
          quote: null,
          activeItems: []
        };
        this.symbolState.set(sym, st);
      } else {
        st.baskets = baskets.slice();
        // Refresh basket membership on already-computed items immediately
        if (st.activeItems.length > 0) {
          this.evaluateSymbol(sym, true);
        }
      }
    }

    if (this.cache && typeof this.cache.setMaxEntries === "function") {
      this.cache.setMaxEntries(Math.max(600, this.symbolState.size * 4 + 200));
    }

    if (this.onSymbolsChanged) {
      this.onSymbolsChanged(this.getTrackedSymbols());
    }

    // Prime from disk cache first, then enqueue missing/stale TFs politely
    if (this.cache && typeof this.cache.load === "function") {
      await this.cache.load();
      if (ver !== this.configVersion || this.disposed) return;
    }

    const nowDate = this.now();
    this.queue = [];
    this.queuedKeys.clear();

    for (const [sym, st] of this.symbolState.entries()) {
      for (let ti = 0; ti < ALERT_HYDRATION_TFS.length; ti++) {
        const tf = ALERT_HYDRATION_TFS[ti];
        const key = Model.cacheKey(sym, tf);
        let loadedFromCache = null;
        if ((!st.candles[tf] || st.candles[tf].length === 0) && this.cache) {
          const cached = this.cache.getUnpacked(key);
          if (Array.isArray(cached) && cached.length > 0) {
            loadedFromCache = cached;
          }
        }
        const candidate = loadedFromCache || st.candles[tf];
        const cachedFetchedAt = (this.cache && typeof this.cache.getFetchedAt === "function") ? this.cache.getFetchedAt(key) : 0;
        const effectiveFetchedAt = st.fetchedAt[tf] || cachedFetchedAt || 0;
        const stale = !candidate || candidate.length < 2 || Model.isCandleSeriesStale(candidate, sym, tf, nowDate, effectiveFetchedAt);
        if (loadedFromCache) {
          this.applyCandlesToState(st, tf, loadedFromCache, null, true, stale ? 0 : effectiveFetchedAt, !stale);
        }
        if (stale) {
          this.enqueueFetch(sym, tf, false);
        }
      }
    }

    this.startBoundaryTimer();
    this.drainQueue(this.hydrationConcurrency);
    this.emitMeta(true);
    if (this.viewActive) this.emitSnapshot(true);
  }

  setViewActive(active) {
    const next = Boolean(active);
    this.viewActive = next;
    if (next) {
      this.emitSnapshot(true);
    }
  }

  setGateTimeframes(gateTimeframes) {
    const next = Model.normalizeAlertGateTimeframes(gateTimeframes);
    const beforeSig = (this.gateTimeframes || []).join(",");
    const afterSig = next.join(",");
    this.gateTimeframes = next;
    if (beforeSig !== afterSig) {
      this.emitMeta(true);
      if (this.viewActive) {
        this.emitSnapshot(true);
      }
    }
  }

  isGateReadyForSymbol(st) {
    if (!st) return false;
    const gateTfs = this.gateTimeframes || [];
    if (gateTfs.length === 0) return true;
    for (let i = 0; i < gateTfs.length; i++) {
      if (st.seeded[gateTfs[i]] !== true) return false;
    }
    return true;
  }

  forceRehydrate() {
    if (!this.enabled || this.symbolState.size === 0) return;
    for (const sym of this.symbolState.keys()) {
      for (let ti = 0; ti < ALERT_HYDRATION_TFS.length; ti++) {
        this.enqueueFetch(sym, ALERT_HYDRATION_TFS[ti], true);
      }
    }
    this.drainQueue(this.hydrationConcurrency);
    this.emitMeta(true);
  }

  enqueueFetch(sym, tf, force) {
    const k = Model.cacheKey(sym, tf);
    if (this.queuedKeys.has(k)) return;
    this.queuedKeys.add(k);
    this.queue.push({ sym, tf, key: k, force: Boolean(force) });
    this.hydrating = true;
  }

  drainQueue(limit) {
    const maxConc = Math.max(1, Number(limit) || this.hydrationConcurrency);
    while (this.inFlightCount < maxConc && this.queue.length > 0 && !this.disposed) {
      const job = this.queue.shift();
      if (!job) break;
      this.queuedKeys.delete(job.key);
      if (!this.symbolState.has(job.sym)) continue;
      this.inFlightCount++;
      this.runHydrationJob(job, maxConc);
    }
    if (this.inFlightCount === 0 && this.queue.length === 0) {
      if (this.hydrating) {
        this.hydrating = false;
        this.emitMeta(true);
        if (this.viewActive) this.scheduleSnapshot();
      }
    }
  }

  async runHydrationJob(job, maxConc) {
    const startVer = this.configVersion;
    try {
      const parsed = await this.fetchChart(job.sym, job.tf);
      if (this.disposed || startVer !== this.configVersion) return;
      const st = this.symbolState.get(job.sym);
      if (st && parsed && Array.isArray(parsed.candles) && parsed.candles.length > 0) {
        const quoteOnly = Object.assign({}, parsed);
        delete quoteOnly.candles;
        if (this.cache && typeof this.cache.put === "function") {
          this.cache.put(job.key, parsed.candles);
        }
        const nowMs = this.now().getTime();
        const isSeed = !st.seeded[job.tf];
        this.applyCandlesToState(st, job.tf, parsed.candles, quoteOnly, isSeed, nowMs, true);
      }
    } catch (e) {
      // Ignore transient chart errors; next boundary/tick will retry cleanly
    } finally {
      this.inFlightCount = Math.max(0, this.inFlightCount - 1);
      if (!this.disposed) {
        this.drainQueue(maxConc);
      }
    }
  }

  applyCandlesToState(st, tf, candles, quoteOnly, isSeed, fetchedAtMs, markSeeded) {
    const copy = Array.isArray(candles) ? candles.map(c => Object.assign({}, c)) : [];
    if (copy.length === 0) return;
    st.candles[tf] = copy;
    if (fetchedAtMs > 0) st.fetchedAt[tf] = fetchedAtMs;
    if (quoteOnly && quoteOnly.symbol) {
      st.quote = Model.mergeChartQuote(st.quote, quoteOnly);
    }
    if (tf === "1D") {
      st.candles["1W"] = Model.mergePeriodCandles(copy, "1W");
      st.candles["1M"] = Model.mergePeriodCandles(copy, "1M");
    }

    // Re-apply live quote onto developing bar if we already received a fresher live tick
    if (st.quote) {
      const nowDate = this.now();
      st.candles[tf] = updateTrailingCandleInPlace(st.candles[tf], st.quote, tf, nowDate);
      if (tf === "1D") {
        st.candles["1W"] = updateTrailingCandleInPlace(st.candles["1W"], st.quote, "1W", nowDate);
        st.candles["1M"] = updateTrailingCandleInPlace(st.candles["1M"], st.quote, "1M", nowDate);
      }
    }

    this.evaluateSymbol(st.symbol, isSeed);

    if (markSeeded !== false && isSeed) {
      st.seeded[tf] = true;
      if (tf === "1D") {
        st.seeded["1W"] = true;
        st.seeded["1M"] = true;
      }
      if (this.gateTimeframes && this.gateTimeframes.length > 0) {
        this.emitMeta(false);
        if (this.viewActive) {
          this.scheduleSnapshot();
        }
      }
    }
  }

  onExternalChartUpdate(sym, tf, parsed) {
    if (!this.enabled || this.disposed) return;
    if (tf !== "30" && tf !== "60" && tf !== "1D") return;
    const st = this.symbolState.get(sym);
    if (!st || !parsed || !Array.isArray(parsed.candles) || parsed.candles.length === 0) return;
    const quoteOnly = Object.assign({}, parsed);
    delete quoteOnly.candles;
    const nowMs = this.now().getTime();
    const isSeed = !st.seeded[tf];
    this.applyCandlesToState(st, tf, parsed.candles, quoteOnly, isSeed, nowMs, true);
    if (this.viewActive) this.scheduleSnapshot();
  }

  onTick(tick) {
    if (!this.enabled || !tick || !tick.symbol) return;
    const st = this.symbolState.get(tick.symbol);
    if (!st) return;

    const prevQ = st.quote;
    st.quote = prevQ ? Object.assign({}, prevQ, tick) : Object.assign({}, tick);
    const nowDate = this.now();

    for (let i = 0; i < ALERT_EVAL_TFS.length; i++) {
      const tf = ALERT_EVAL_TFS[i];
      if (st.candles[tf] && st.candles[tf].length > 0) {
        st.candles[tf] = updateTrailingCandleInPlace(st.candles[tf], st.quote, tf, nowDate);
      }
    }

    this.evaluateSymbol(st.symbol, false);
  }

  evaluateSymbol(sym, seedOnly) {
    const st = this.symbolState.get(sym);
    if (!st) return;
    const nowDate = this.now();
    const nowMs = nowDate.getTime();
    const items = Model.evaluateSymbolSetupAlerts(sym, st.candles, st.quote, st.baskets);
    const sessionOpen = Model.isAlertSessionOpen(sym, st.quote, false, nowDate);
    const gateTfs = this.gateTimeframes || [];
    const hasGate = gateTfs.length > 0;
    const gateReady = this.isGateReadyForSymbol(st);
    const qualifiedBy = (hasGate && gateReady) ? Model.getQualifyingGateTimeframes(items, gateTfs) : [];
    const passesGate = !hasGate || (gateReady && qualifiedBy.length > 0);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const tf = item.timeframe;
      const alreadyFired = Boolean(this.firedKeys[item.key]);
      const tfSeeded = st.seeded[tf] === true;

      if (seedOnly || !tfSeeded) {
        if (!alreadyFired) {
          this.firedKeys[item.key] = (item.activeTimestamp > 0) ? (item.activeTimestamp * 1000) : Math.max(1, nowMs - 300000);
        }
        item.triggeredAt = this.liveTriggeredAt[item.key] || 0;
        continue;
      }

      if (!alreadyFired && sessionOpen) {
        this.firedKeys[item.key] = nowMs;
        this.firedKeys = Model.normalizeFiredSetupKeys(this.firedKeys, nowMs);
        if (passesGate) {
          this.liveTriggeredAt[item.key] = nowMs;
          item.triggeredAt = nowMs;
          if (this.onTrigger) {
            const payload = hasGate ? Object.assign({}, item, { qualifiedBy: qualifiedBy.slice() }) : Object.assign({}, item);
            this.onTrigger(payload, Object.assign({}, this.firedKeys));
          }
        } else {
          item.triggeredAt = this.liveTriggeredAt[item.key] || 0;
        }
      } else {
        item.triggeredAt = this.liveTriggeredAt[item.key] || 0;
      }
    }

    st.activeItems = items;
    this.emitMeta(false);
    if (this.viewActive) {
      this.scheduleSnapshot();
    }
  }

  checkBarBoundaries() {
    if (this.disposed || !this.enabled || this.symbolState.size === 0) return;
    const nowDate = this.now();
    const nowSec = Math.floor(nowDate.getTime() / 1000);
    const usOpen = Model.isUsMarketOpen(nowDate, false);
    const curEtDate = Model.marketDateEt(nowSec);
    const curBucket30 = Math.floor(nowSec / 1800);
    const sched = Model.getUsSessionSchedule(nowDate);
    const curBucket60 = (!sched.isWeekend && sched.mins >= sched.openMins)
      ? Math.floor((sched.mins - sched.openMins) / 60)
      : Math.floor(nowSec / 3600);

    if (this.lastBucket30 === -1) {
      this.lastBucket30 = curBucket30;
      this.lastBucket60 = curBucket60;
      this.lastMarketDateEt = curEtDate;
      return;
    }

    const rolled30 = curBucket30 !== this.lastBucket30;
    const rolled60 = curBucket60 !== this.lastBucket60;
    const rolledDay = usOpen && curEtDate !== this.lastMarketDateEt;

    this.lastBucket30 = curBucket30;
    this.lastBucket60 = curBucket60;
    if (usOpen) this.lastMarketDateEt = curEtDate;

    if (!rolled30 && !rolled60 && !rolledDay) return;

    for (const sym of this.symbolState.keys()) {
      const isCrypto = Model.isCryptoSymbol(sym);
      if (!isCrypto && !usOpen) continue;
      if (rolled30) this.enqueueFetch(sym, "30", true);
      if (rolled60) this.enqueueFetch(sym, "60", true);
      if (rolledDay) this.enqueueFetch(sym, "1D", true);
    }

    this.drainQueue(this.reconcileConcurrency);
  }

  collectAllItems() {
    const out = [];
    const gateTfs = this.gateTimeframes || [];
    const hasGate = gateTfs.length > 0;
    for (const st of this.symbolState.values()) {
      if (!hasGate) {
        for (let i = 0; i < st.activeItems.length; i++) {
          out.push(st.activeItems[i]);
        }
        continue;
      }
      if (!this.isGateReadyForSymbol(st)) continue;
      const qualifiedBy = Model.getQualifyingGateTimeframes(st.activeItems, gateTfs);
      if (qualifiedBy.length === 0) continue;
      for (let i = 0; i < st.activeItems.length; i++) {
        out.push(Object.assign({}, st.activeItems[i], { qualifiedBy: qualifiedBy.slice() }));
      }
    }
    return out;
  }

  buildStatus() {
    let hydratedSymbols = 0;
    let qualifiedSymbols = 0;
    const gateTfs = this.gateTimeframes || [];
    const hasGate = gateTfs.length > 0;
    for (const st of this.symbolState.values()) {
      if (st.seeded["30"] || st.seeded["60"] || st.seeded["1D"]) hydratedSymbols++;
      if (hasGate && this.isGateReadyForSymbol(st) && Model.getQualifyingGateTimeframes(st.activeItems, gateTfs).length > 0) {
        qualifiedSymbols++;
      }
    }
    return {
      hydrating: this.hydrating || this.inFlightCount > 0 || this.queue.length > 0,
      totalSymbols: this.symbolState.size,
      hydratedSymbols,
      qualifiedSymbols: hasGate ? qualifiedSymbols : this.symbolState.size,
      gateTimeframes: gateTfs.slice(),
      sources: this.sources.slice(),
      resolvedBaskets: Object.assign({}, this.resolvedBaskets)
    };
  }

  emitMeta(force) {
    if (!this.onMeta) return;
    const items = this.collectAllItems();
    let inForceCount = 0;
    for (let i = 0; i < items.length; i++) {
      if (items[i].inForce) inForceCount++;
    }
    const status = this.buildStatus();
    const sig = `${items.length}|${inForceCount}|${status.hydrating}|${status.hydratedSymbols}|${status.totalSymbols}|${status.qualifiedSymbols}|${status.gateTimeframes.join(",")}|${status.sources.join(",")}`;
    if (!force && sig === this.lastMetaSig) return;
    this.lastMetaSig = sig;
    this.onMeta({
      totalCount: items.length,
      inForceCount,
      status
    });
  }

  scheduleSnapshot() {
    if (!this.viewActive || this.snapshotTimer || this.disposed) return;
    this.snapshotTimer = setTimeout(() => {
      this.snapshotTimer = null;
      this.emitSnapshot(false);
    }, this.snapshotThrottleMs);
    if (this.snapshotTimer.unref) this.snapshotTimer.unref();
  }

  emitSnapshot(force) {
    if (!this.onSnapshot) return;
    if (this.snapshotTimer) {
      clearTimeout(this.snapshotTimer);
      this.snapshotTimer = null;
    }
    const items = this.collectAllItems();
    const status = this.buildStatus();
    const payload = { items, status };
    const sig = JSON.stringify(payload);
    if (!force && sig === this.lastSnapshotSig) return;
    this.lastSnapshotSig = sig;
    this.onSnapshot(payload);
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
  const uiSymbols = new Set();
  const alertSymbols = new Set();
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

  function syncProviderSockets() {
    const combined = new Set();
    for (const s of uiSymbols) combined.add(s);
    for (const s of alertSymbols) combined.add(s);
    const routed = routeSymbols(Array.from(combined));
    yahooSock.setSymbols(routed.yahoo);
    coinbaseSock.setSymbols(routed.coinbase);
    hlSock.setSymbols(routed.hyperliquid);
    emitStatus();
  }

  const scanner = new SetupAlertScanner({
    cache,
    onSymbolsChanged: (syms) => {
      alertSymbols.clear();
      for (let i = 0; i < syms.length; i++) alertSymbols.add(syms[i]);
      syncProviderSockets();
    },
    onTrigger: (event, firedKeys) => {
      emit({ type: "setupAlertTriggered", event, firedKeys });
    },
    onSnapshot: (payload) => {
      emit({ type: "alertSnapshot", items: payload.items, status: payload.status });
    },
    onMeta: (meta) => {
      emit({ type: "alertMeta", totalCount: meta.totalCount, inForceCount: meta.inForceCount, status: meta.status });
    }
  });

  function dispatchIncomingTick(tick) {
    if (!tick || !tick.symbol) return;
    if (alertSymbols.has(tick.symbol)) {
      scanner.onTick(tick);
    }
    if (uiSymbols.has(tick.symbol)) {
      batcher.push(tick);
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
        if (tick) dispatchIncomingTick(tick);
      }
    },
    staleTimeoutMs: 45000,
    shouldWatchdog: () => Model.isUsMarketOpen(new Date(), false),
    onStaleReconnect: (syms) => batcher.clearSentForSymbols(syms),
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
      if (tick) dispatchIncomingTick(tick);
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
      for (let i = 0; i < ticks.length; i++) dispatchIncomingTick(ticks[i]);
    },
    onStatus: emitStatus
  });

  async function handleCommand(cmd) {
    if (!cmd || typeof cmd !== "object") return;
    const op = cmd.op;

    if (op === "subscribe") {
      uiSymbols.clear();
      const rawSyms = Array.isArray(cmd.symbols) ? cmd.symbols : [];
      for (let i = 0; i < rawSyms.length; i++) {
        const norm = Model.normalizeSymbol(rawSyms[i]);
        if (norm) uiSymbols.add(norm);
      }
      syncProviderSockets();
      return;
    }

    if (op === "setAlertConfig") {
      await scanner.setConfig(cmd.sources, cmd.firedKeys, cmd.enabled !== false, cmd.gateTimeframes);
      return;
    }

    if (op === "setAlertGate") {
      scanner.setGateTimeframes(cmd.gateTimeframes);
      return;
    }

    if (op === "setAlertViewActive") {
      scanner.setViewActive(cmd.active === true);
      return;
    }

    if (op === "refreshAlerts") {
      scanner.forceRehydrate();
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
            fetchedAt: cache.getFetchedAt(key),
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
        scanner.onExternalChartUpdate(sym, rk, parsed);
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
      Promise.resolve(handleCommand(cmd)).catch(() => {
        if (cmd && cmd.op === "fetchChart") {
          const sym = Model.normalizeSymbol(cmd.symbol);
          const rk = String(cmd.rangeKey || "1D");
          const key = sym ? Model.cacheKey(sym, rk) : "";
          emit({ type: "chartResult", id: cmd.id || "", symbol: sym, rangeKey: rk, key, ok: false });
        }
      });
    } catch (e) {}
  });

  function shutdown() {
    scanner.dispose();
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
  OffThreadCandleCache,
  SetupAlertScanner,
  updateTrailingCandleInPlace
};
