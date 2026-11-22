function defaultWatchlist() {
  return []
}

function defaultPinned() {
  return []
}

function defaultDetailRange() {
  return "1D"
}

function defaultGridMode() {
  return "2x2"
}

function defaultGridSync() {
  return { symbol: true, timeframe: false, crosshair: true, time: true, broadening: false, setupLines: true }
}

function defaultGridSplits() {
  return {
    "2x2": { rowRatio: 0.5, colTopRatio: 0.5, colBotRatio: 0.5 },
    "2+3": { rowRatio: 0.5, colTopRatio: 0.5, colBotRatios: [0.333, 0.333, 0.334] }
  }
}

function defaultState() {
  return { watchlist: defaultWatchlist().slice(), pinned: defaultPinned(), detailRange: defaultDetailRange(), layouts: {} }
}

function normalizeSymbol(value) {
  return String(value || "").replace(/^\s+|\s+$/g, "").toUpperCase()
}

function finiteOrNull(value) {
  if (value === null || value === undefined) return null
  if (typeof value === "string" && value.replace(/^\s+|\s+$/g, "") === "") return null
  var n = Number(value)
  return isFinite(n) ? n : null
}

function isArrayLike(v) {
  return Boolean(v && typeof v === "object" && typeof v.length === "number" && v.length >= 0)
}

function toArray(v) {
  if (Array.isArray(v)) return v
  if (!isArrayLike(v)) return []
  return Array.prototype.slice.call(v)
}

function normalizeTimeframeList(raw) {
  if (!isArrayLike(raw) || raw.length === 0) return null
  var valid = ["30", "60", "1D", "1W", "1M", "1Y", "All"]
  var out = []
  for (var i = 0; i < raw.length; i++) {
    var tf = String(raw[i] || "").replace(/^\s+|\s+$/g, "")
    if (valid.indexOf(tf) !== -1) out.push(tf)
  }
  return out.length > 0 ? out : null
}

var MIN_BAR_COUNT = 1
var DEFAULT_ANALYSIS_BAR_COUNT = 8
var DEFAULT_RIGHT_OFFSET_BARS = 9

function defaultRightOffsetBars(vCount) {
  var c = isFinite(vCount) ? Math.floor(vCount) : 0
  if (c <= 2) return 0
  return Math.min(DEFAULT_RIGHT_OFFSET_BARS, Math.max(1, Math.floor(c * 0.2)))
}

function minVisibleChartBars(total, vCount) {
  var t = isFinite(total) ? Math.max(0, Math.floor(total)) : 0
  if (t <= 1) return t
  var c = isFinite(vCount) ? Math.max(1, Math.floor(vCount)) : t
  return Math.min(t, Math.max(2, Math.round(c * 0.15)))
}

function maxChartViewStart(total, vCount) {
  var t = isFinite(total) ? Math.max(0, Math.floor(total)) : 0
  if (t <= 1) return 0
  return Math.max(0, t - minVisibleChartBars(t, vCount))
}

// Resolve horizontal candlestick viewport with TradingView-style right-side whitespace.
// rightOffsetBars < 0 uses the default (~9 bar) right margin scaled safely for short series.
function resolveHorizontalViewport(total, viewCount, defaultCount, viewStart, followLatest, rightOffsetBars) {
  var t = isFinite(total) ? Math.max(0, Math.floor(total)) : 0
  if (t === 0) {
    return { vStart: 0, vCount: 0, flushStart: 0, maxStart: 0, minVisibleBars: 0, rightOffsetBars: 0 }
  }
  var defC = (isFinite(defaultCount) && defaultCount > 0) ? Math.min(t, Math.floor(defaultCount)) : t
  var vCount = (isFinite(viewCount) && viewCount > 0 && viewCount < t) ? Math.max(MIN_BAR_COUNT, Math.floor(viewCount)) : defC
  var flushStart = Math.max(0, t - vCount)
  var minVis = minVisibleChartBars(t, vCount)
  var maxStart = Math.max(0, t - minVis)
  var maxRight = Math.max(0, maxStart - flushStart)
  var desiredRight = (isFinite(rightOffsetBars) && rightOffsetBars >= 0)
    ? Math.floor(rightOffsetBars)
    : defaultRightOffsetBars(vCount)
  var clampedRight = Math.max(0, Math.min(maxRight, desiredRight))

  var vStart
  if (followLatest) {
    vStart = Math.min(maxStart, flushStart + clampedRight)
  } else {
    var rawStart = isFinite(viewStart) ? Math.floor(viewStart) : flushStart
    vStart = Math.max(0, Math.min(maxStart, rawStart))
  }
  var effectiveRight = Math.max(0, vStart - flushStart)
  return {
    vStart: vStart,
    vCount: vCount,
    flushStart: flushStart,
    maxStart: maxStart,
    minVisibleBars: minVis,
    rightOffsetBars: effectiveRight
  }
}

var PRICE_SCALE_MIN_LOG_SPAN = 0.0005
var PRICE_SCALE_MAX_LOG_SPAN = 14
var PRICE_SCALE_MIN_LOG = Math.log(0.00001)
var PRICE_SCALE_MAX_LOG = Math.log(1e9)

function clampPriceLogBounds(lo, hi) {
  var span = Math.max(PRICE_SCALE_MIN_LOG_SPAN, Math.min(PRICE_SCALE_MAX_LOG_SPAN, hi - lo))
  var minV = lo
  var maxV = lo + span
  if (minV < PRICE_SCALE_MIN_LOG) {
    minV = PRICE_SCALE_MIN_LOG
    maxV = Math.min(PRICE_SCALE_MAX_LOG, minV + span)
  }
  if (maxV > PRICE_SCALE_MAX_LOG) {
    maxV = PRICE_SCALE_MAX_LOG
    minV = Math.max(PRICE_SCALE_MIN_LOG, maxV - span)
  }
  return { logMin: minV, logMax: maxV, logSpan: Math.max(PRICE_SCALE_MIN_LOG_SPAN, maxV - minV) }
}

function zoomPriceLogRange(logMin, logMax, factor) {
  var curMin = isFinite(logMin) ? logMin : 0
  var curMax = isFinite(logMax) ? logMax : curMin + 0.01
  var curSpan = Math.max(PRICE_SCALE_MIN_LOG_SPAN, curMax - curMin)
  var f = (isFinite(factor) && factor > 0) ? factor : 1
  var nextSpan = Math.max(PRICE_SCALE_MIN_LOG_SPAN, Math.min(PRICE_SCALE_MAX_LOG_SPAN, curSpan * f))
  var center = (curMin + curMax) / 2
  return clampPriceLogBounds(center - nextSpan / 2, center + nextSpan / 2)
}

function panPriceLogRange(logMin, logMax, deltaY, innerH) {
  var curMin = isFinite(logMin) ? logMin : 0
  var curMax = isFinite(logMax) ? logMax : curMin + 0.01
  var curSpan = Math.max(PRICE_SCALE_MIN_LOG_SPAN, curMax - curMin)
  var h = (isFinite(innerH) && innerH > 0) ? innerH : 1
  var dy = isFinite(deltaY) ? deltaY : 0
  var dLog = (dy / h) * curSpan
  return clampPriceLogBounds(curMin + dLog, curMax + dLog)
}

function priceScaleDragFactor(deltaY, innerH) {
  var dy = isFinite(deltaY) ? deltaY : 0
  var h = (isFinite(innerH) && innerH > 0) ? innerH : 180
  var denom = Math.max(80, h * 0.45)
  return Math.exp(dy / denom)
}

function priceScaleWheelFactor(angleDeltaY) {
  var d = isFinite(angleDeltaY) ? angleDeltaY : 0
  if (d === 0) return 1
  return Math.pow(0.88, d / 120)
}

function clampBarCount(count, fallback) {
  var n = parseInt(count, 10)
  if (!isFinite(n) || isNaN(n)) {
    return (fallback !== undefined && isFinite(fallback)) ? Math.max(MIN_BAR_COUNT, Math.round(fallback)) : DEFAULT_ANALYSIS_BAR_COUNT
  }
  return Math.max(MIN_BAR_COUNT, n)
}

function normalizeZoomList(raw) {
  if (!isArrayLike(raw) || raw.length === 0) return null
  var out = []
  for (var i = 0; i < raw.length; i++) {
    var n = parseInt(raw[i], 10)
    if (isFinite(n) && n >= MIN_BAR_COUNT) out.push(n)
    else out.push(-1)
  }
  return out.length > 0 ? out : null
}

function parseLayouts(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  var out = {}
  for (var name in raw) {
    if (!name || typeof name !== "string") continue
    var item = raw[name]
    if (!item || typeof item !== "object") continue
    var ws = (item.workspace !== undefined && item.workspace !== null) ? item.workspace : 2
    var windows = []
    if (Array.isArray(item.windows)) {
      for (var i = 0; i < item.windows.length; i++) {
        var w = item.windows[i]
        if (typeof w === "string") {
          var sym = normalizeSymbol(w)
          if (sym) windows.push({ symbol: sym, workspace: ws })
        } else if (w && typeof w === "object") {
          var s = normalizeSymbol(w.symbol)
          if (s) {
            var winObj = {
              symbol: s,
              workspace: (w.workspace !== undefined && w.workspace !== null) ? w.workspace : ws
            }
            var tfs = normalizeTimeframeList(w.timeframes)
            if (tfs) winObj.timeframes = tfs
            var zs = normalizeZoomList(w.zooms)
            if (zs) winObj.zooms = zs
            if (w.gridMode === "2x2" || w.gridMode === "2+3" || w.gridMode === "1x1") {
              winObj.gridMode = w.gridMode
            }
            windows.push(winObj)
          }
        }
      }
    }
    if (windows.length > 0) {
      out[name] = {
        workspace: ws,
        windows: windows
      }
    }
  }
  return out
}

function saveLayout(layouts, name, windows, defaultWorkspace) {
  var current = parseLayouts(layouts)
  var trimmedName = String(name || "").replace(/^\s+|\s+$/g, "")
  if (!trimmedName) return current
  var ws = (defaultWorkspace !== undefined && defaultWorkspace !== null) ? defaultWorkspace : 2
  var list = []
  if (Array.isArray(windows)) {
    for (var i = 0; i < windows.length; i++) {
      var w = windows[i]
      if (typeof w === "string") {
        var sym = normalizeSymbol(w)
        if (sym) list.push({ symbol: sym, workspace: ws })
      } else if (w && typeof w === "object") {
        var s = normalizeSymbol(w.symbol)
        if (s) {
          var savedWin = {
            symbol: s,
            workspace: (w.workspace !== undefined && w.workspace !== null) ? w.workspace : ws
          }
          var tfs = normalizeTimeframeList(w.timeframes)
          if (tfs) savedWin.timeframes = tfs
          var zs = normalizeZoomList(w.zooms)
          if (zs) savedWin.zooms = zs
          if (w.gridMode === "2x2" || w.gridMode === "2+3" || w.gridMode === "1x1") {
            savedWin.gridMode = w.gridMode
          }
          list.push(savedWin)
        }
      }
    }
  }
  if (list.length > 0) {
    current[trimmedName] = {
      workspace: ws,
      windows: list
    }
  }
  return current
}

function deleteLayout(layouts, name) {
  var current = parseLayouts(layouts)
  var trimmedName = String(name || "").replace(/^\s+|\s+$/g, "")
  if (trimmedName && current[trimmedName]) {
    delete current[trimmedName]
  }
  return current
}

function normalizeSymbolLevels(rawLevels) {
  var out = {}
  if (!rawLevels || typeof rawLevels !== "object") return out
  for (var rawSym in rawLevels) {
    if (!Object.prototype.hasOwnProperty.call(rawLevels, rawSym)) continue
    var sym = normalizeSymbol(rawSym)
    if (!sym || !Array.isArray(rawLevels[rawSym])) continue
    var arr = rawLevels[rawSym]
    var cleaned = []
    for (var i = 0; i < arr.length && cleaned.length < 60; i++) {
      var lvl = arr[i]
      if (!lvl || typeof lvl !== "object") continue
      var p = finiteOrNull(lvl.price)
      if (p === null || p <= 0) continue
      var cond = String(lvl.alertCondition || "CROSSES").toUpperCase()
      if (cond !== "CROSSES_ABOVE" && cond !== "CROSSES_BELOW" && cond !== "CROSSES") {
        cond = "CROSSES"
      }
      var tone = String(lvl.tone || "fg")
      if (tone !== "up" && tone !== "down" && tone !== "fg") tone = "fg"
      var item = {
        id: lvl.id ? String(lvl.id) : ("lvl_" + sym + "_" + Math.round(p * 10000) + "_" + i),
        price: p,
        sourceTf: lvl.sourceTf ? String(lvl.sourceTf) : "1D",
        anchorTs: isFinite(lvl.anchorTs) ? Number(lvl.anchorTs) : 0,
        ohlcField: lvl.ohlcField ? String(lvl.ohlcField) : "scale",
        text: (lvl.text !== undefined && lvl.text !== null) ? String(lvl.text) : "",
        tone: tone,
        offsets: (lvl.offsets && typeof lvl.offsets === "object") ? lvl.offsets : ({}),
        alertEnabled: Boolean(lvl.alertEnabled),
        alertCondition: cond,
        alertTriggered: Boolean(lvl.alertTriggered),
        alertTriggeredAt: isFinite(lvl.alertTriggeredAt) ? Number(lvl.alertTriggeredAt) : 0,
        allowExtended: Boolean(lvl.allowExtended)
      }
      cleaned.push(item)
    }
    if (cleaned.length > 0) out[sym] = cleaned
  }
  return out
}

function normalizeAlertLog(rawLog) {
  if (!Array.isArray(rawLog)) return []
  var out = []
  for (var i = 0; i < rawLog.length && out.length < 50; i++) {
    var item = rawLog[i]
    if (!item || typeof item !== "object" || !item.symbol) continue
    var sym = normalizeSymbol(item.symbol)
    if (!sym) continue
    var ts = isFinite(item.timestamp) ? Number(item.timestamp) : (isFinite(item.timestampMs) ? Number(item.timestampMs) : Date.now())
    var sumTxt = String(item.summary || item.body || "")
    out.push({
      id: item.id ? String(item.id) : ("alrt_" + sym + "_" + (ts || i)),
      timestamp: ts,
      timestampMs: ts,
      symbol: sym,
      kind: item.kind === "PRICE" ? "PRICE" : "STRAT",
      eventType: String(item.eventType || "TRIGGERED"),
      direction: String(item.direction || ""),
      timeframe: String(item.timeframe || "60"),
      price: finiteOrNull(item.price),
      triggerPrice: finiteOrNull(item.triggerPrice),
      title: String(item.title || ""),
      summary: sumTxt,
      body: sumTxt,
      muted: item.muted === true
    })
  }
  return out
}

function appendAlertLog(logList, entry, maxEntries) {
  var limit = (isFinite(maxEntries) && maxEntries > 0) ? Math.floor(maxEntries) : 50
  var current = normalizeAlertLog(logList)
  if (!entry || typeof entry !== "object" || !entry.symbol) return current
  var normalized = normalizeAlertLog([entry])
  if (normalized.length === 0) return current
  var head = normalized[0]
  var filtered = [head]
  for (var i = 0; i < current.length && filtered.length < limit; i++) {
    if (current[i].id !== head.id) {
      filtered.push(current[i])
    }
  }
  return filtered
}

function parseState(raw) {
  var fallback = defaultState()
  try {
    var data = JSON.parse(String(raw || ""))
    if (!data || typeof data !== "object") return fallback

    var src = Array.isArray(data.watchlist) ? data.watchlist : fallback.watchlist
    var list = []
    var seen = {}
    for (var i = 0; i < src.length; i++) {
      var symbol = normalizeSymbol(src[i])
      if (!symbol || seen[symbol]) continue
      seen[symbol] = true
      list.push(symbol)
    }
    var res = {
      watchlist: list,
      pinned: parsePinned(data.pinned, list),
      detailRange: normalizeRange(data.detailRange)
    }
    if (data.gridMode !== undefined) res.gridMode = (data.gridMode === "2+3" || data.gridMode === "1x1") ? data.gridMode : "2x2"
    if (data.gridSync !== undefined && typeof data.gridSync === "object") {
      res.gridSync = {
        symbol: data.gridSync.symbol !== false,
        timeframe: data.gridSync.timeframe === true,
        crosshair: data.gridSync.crosshair !== false,
        time: data.gridSync.time !== false
      }
      if (data.gridSync.broadening !== undefined) {
        res.gridSync.broadening = data.gridSync.broadening === true
      }
      if (data.gridSync.setupLines !== undefined) {
        res.gridSync.setupLines = data.gridSync.setupLines !== false
      }
    }
    if (Array.isArray(data.gridSymbols)) {
      var gSymbols = []
      for (var si = 0; si < data.gridSymbols.length; si++) {
        gSymbols.push(normalizeSymbol(data.gridSymbols[si]))
      }
      res.gridSymbols = gSymbols
    }
    var gTimeframes = normalizeTimeframeList(data.gridTimeframes)
    if (gTimeframes) res.gridTimeframes = gTimeframes
    var gZooms = normalizeZoomList(data.gridZooms)
    if (gZooms) res.gridZooms = gZooms
    if (data.gridSplits !== undefined && typeof data.gridSplits === "object") res.gridSplits = data.gridSplits
    if (data.layouts !== undefined && typeof data.layouts === "object") res.layouts = parseLayouts(data.layouts)
    if (data.discordWebhook !== undefined) res.discordWebhook = String(data.discordWebhook || "").trim()
    if (data.symbolLevels !== undefined && typeof data.symbolLevels === "object") {
      res.symbolLevels = normalizeSymbolLevels(data.symbolLevels)
    }
    if (data.alertLog !== undefined && Array.isArray(data.alertLog)) {
      res.alertLog = normalizeAlertLog(data.alertLog)
    }
    if (data.alertsMutedUntil !== undefined) {
      res.alertsMutedUntil = normalizeAlertsMutedUntil(data.alertsMutedUntil)
    }
    return res
  } catch (e) {
    return fallback
  }
}

function serializeState(watchlist, pinned, detailRange, gridMode, gridSync, gridSymbols, gridSplits, layouts, arg9, arg10, arg11, arg12, arg13, arg14, arg15) {
  var list = Array.isArray(watchlist) ? watchlist.slice() : []
  var obj = {
    watchlist: list,
    pinned: parsePinned(pinned, list),
    detailRange: normalizeRange(detailRange)
  }
  if (gridMode !== undefined) obj.gridMode = gridMode
  if (gridSync !== undefined) obj.gridSync = gridSync
  if (gridSymbols !== undefined) obj.gridSymbols = gridSymbols
  if (gridSplits !== undefined) obj.gridSplits = gridSplits
  if (layouts !== undefined && layouts !== null && Object.keys(layouts).length > 0) obj.layouts = parseLayouts(layouts)

  var discordWebhook = ""
  var gridTimeframes = null
  var gridZooms = null
  var extra = null

  if (typeof arg9 === "string" && (arg9.startsWith("http") || arg9 === "") && (Array.isArray(arg10) || Array.isArray(arg11))) {
    discordWebhook = arg9
    gridTimeframes = arg10
    gridZooms = arg11
    if (arg12 && typeof arg12 === "object" && !Array.isArray(arg12)) extra = arg12
  } else if (arguments.length >= 12) {
    discordWebhook = arg12
    gridTimeframes = arg13
    gridZooms = arg14
    if (arg15 && typeof arg15 === "object" && !Array.isArray(arg15)) extra = arg15
  } else if (typeof arg9 === "string" && arg9.startsWith("http")) {
    discordWebhook = arg9
  }

  var normTfs = normalizeTimeframeList(gridTimeframes)
  if (normTfs) obj.gridTimeframes = normTfs
  var normZooms = normalizeZoomList(gridZooms)
  if (normZooms) obj.gridZooms = normZooms
  if (discordWebhook) obj.discordWebhook = discordWebhook

  if (extra) {
    if (extra.symbolLevels && typeof extra.symbolLevels === "object") {
      var normLevels = normalizeSymbolLevels(extra.symbolLevels)
      if (Object.keys(normLevels).length > 0) obj.symbolLevels = normLevels
    }
    if (Array.isArray(extra.alertLog) && extra.alertLog.length > 0) {
      var normLog = normalizeAlertLog(extra.alertLog)
      if (normLog.length > 0) obj.alertLog = normLog
    }
    if (extra.alertsMutedUntil !== undefined && isAlertsMuted(extra.alertsMutedUntil, new Date())) {
      obj.alertsMutedUntil = normalizeAlertsMutedUntil(extra.alertsMutedUntil)
    }
  }

  return JSON.stringify(obj, null, 2) + "\n"
}

function gridTimeframes(gridMode) {
  if (gridMode === "2+3") return ["60", "1D", "1W", "1M", "1Y"]
  if (gridMode === "1x1") return ["1D"]
  return ["60", "1D", "1W", "1M"]
}

function addSymbol(watchlist, symbol) {
  var list = Array.isArray(watchlist) ? watchlist.slice() : []
  var next = normalizeSymbol(symbol)
  if (!next || list.indexOf(next) !== -1 || list.length >= 30) return list
  list.push(next)
  return list
}

function removeSymbol(watchlist, symbol) {
  var drop = normalizeSymbol(symbol)
  var list = Array.isArray(watchlist) ? watchlist : []
  var out = []
  for (var i = 0; i < list.length; i++) {
    if (normalizeSymbol(list[i]) !== drop) out.push(list[i])
  }
  return out
}

function parsePinned(raw, watchlist) {
  var list = Array.isArray(watchlist) ? watchlist : []
  var src = []
  if (Array.isArray(raw)) src = raw
  else if (typeof raw === "string" && raw) src = [raw]
  var out = []
  var seen = {}
  for (var i = 0; i < src.length; i++) {
    var symbol = normalizeSymbol(src[i])
    if (!symbol || seen[symbol] || list.indexOf(symbol) === -1) continue
    seen[symbol] = true
    out.push(symbol)
  }
  return out
}

function isPinned(pinned, symbol) {
  var next = normalizeSymbol(symbol)
  var pins = Array.isArray(pinned) ? pinned : []
  return next !== "" && pins.indexOf(next) !== -1
}

function togglePinned(pinned, watchlist, symbol) {
  var next = normalizeSymbol(symbol)
  if (!next) return parsePinned(pinned, watchlist)
  var pins = parsePinned(pinned, watchlist)
  var idx = pins.indexOf(next)
  if (idx !== -1) {
    pins.splice(idx, 1)
    return pins
  }
  if (watchlist && watchlist.indexOf(next) !== -1) pins.push(next)
  return pins
}

function barSymbol(pinned, watchlist, index) {
  var pins = Array.isArray(pinned) ? pinned : []
  if (pins.length > 0) {
    var len = pins.length
    var i = ((parseInt(index, 10) || 0) % len + len) % len
    return pins[i]
  }
  var list = Array.isArray(watchlist) ? watchlist : []
  return list.length ? list[0] : ""
}

function searchUrl(query) {
  return "https://query2.finance.yahoo.com/v1/finance/search?q="
    + encodeURIComponent(String(query || ""))
    + "&quotesCount=8&newsCount=0"
}

function sparkUrl(symbols) {
  var list = Array.isArray(symbols) ? symbols.slice() : []
  return "https://query1.finance.yahoo.com/v7/finance/spark?symbols="
    + encodeURIComponent(list.join(","))
    + "&range=1mo&interval=60m&includePrePost=false"
}

function sparkQuoteUrl(symbols) {
  var list = Array.isArray(symbols) ? symbols.slice() : []
  return "https://query1.finance.yahoo.com/v7/finance/spark?symbols="
    + encodeURIComponent(list.join(","))
    + "&range=1d&interval=1d&includePrePost=false"
}

function armedAlertSymbols(symbolLevels) {
  var out = []
  var seen = {}
  if (!symbolLevels || typeof symbolLevels !== "object") return out
  var syms = Object.keys(symbolLevels)
  for (var i = 0; i < syms.length; i++) {
    var sym = normalizeSymbol(syms[i])
    if (!sym || seen[sym]) continue
    var lvls = symbolLevels[syms[i]]
    if (!isArrayLike(lvls)) continue
    for (var j = 0; j < lvls.length; j++) {
      var lvl = lvls[j]
      if (lvl && lvl.alertEnabled && !lvl.alertTriggered) {
        seen[sym] = true
        out.push(sym)
        break
      }
    }
  }
  return out
}

function quoteSymbolsForView(watchlist, detailSymbol, view) {
  var detail = normalizeSymbol(detailSymbol)
  if (view === "detail" && detail) return [detail]
  return Array.isArray(watchlist) ? watchlist.slice() : []
}

function chartRanges() {
  return ["30", "60", "1D", "1W", "1M", "1Y"]
}

function normalizeRange(value) {
  var key = String(value || "")
  var ranges = chartRanges()
  return ranges.indexOf(key) !== -1 ? key : defaultDetailRange()
}

function chartSpec(range) {
  switch (String(range || "1D")) {
    case "1":
    case "1m": return { range: "5d", interval: "1m" }
    case "5":
    case "5m": return { range: "1mo", interval: "5m" }
    case "15":
    case "15m": return { range: "1mo", interval: "15m" }
    case "30": return { range: "1mo", interval: "30m" }
    case "60":
    case "60m": return { range: "1mo", interval: "60m" }
    case "1W":
    case "W":
    case "1w":
    case "week": return { range: "5y", interval: "1wk" }
    case "1M": return { range: "10y", interval: "1mo" }
    case "1Y": return { range: "max", interval: "1mo" }
    default: return { range: "1y", interval: "1d" }
  }
}

function rangeChangeAmount(quote, rangeKey) {
  if (!quote) return null
  var key = String(rangeKey || "1D")
  var last = finiteOrNull(quote.price)
  var closes = quote.closes || []
  var nums = []
  var i
  for (i = 0; i < closes.length; i++) {
    var n = Number(closes[i])
    if (isFinite(n)) nums.push(n)
  }
  if (last === null && nums.length) last = nums[nums.length - 1]
  if (key === "1D") {
    var prev = finiteOrNull(quote.previousClose)
    if (prev != null && last !== null) return last - prev
    return finiteOrNull(quote.change)
  }
  if (nums.length < 2 || last === null) return finiteOrNull(quote.change)
  var first = nums[0]
  if (first == null) return null
  return last - first
}

function rangeChangePercent(quote, rangeKey) {
  if (!quote) return null
  var key = String(rangeKey || "1D")
  var last = finiteOrNull(quote.price)
  var closes = quote.closes || []
  var nums = []
  var i
  for (i = 0; i < closes.length; i++) {
    var n = finiteOrNull(closes[i])
    if (n !== null) nums.push(n)
  }
  if (last === null && nums.length) last = nums[nums.length - 1]
  if (key === "1D") {
    var prev = finiteOrNull(quote.previousClose)
    if (prev && last !== null) return ((last - prev) / prev) * 100
    return finiteOrNull(quote.changePercent)
  }
  if (nums.length < 2 || last === null) return finiteOrNull(quote.changePercent)
  var first = nums[0]
  if (!first) return null
  return ((last - first) / first) * 100
}

function isCryptoSymbol(symbol) {
  var s = normalizeSymbol(symbol)
  return s.endsWith("-USD") || s.endsWith("-USDT") || s.endsWith("-EUR") || s.endsWith("-GBP")
}

function cryptoBaseSymbol(symbol) {
  var s = normalizeSymbol(symbol)
  var base = s.replace(/-(USD|USDT|EUR|GBP|CAD)$/, "")
  base = base.replace(/[0-9]{3,}$/, "")
  return base
}

function isHyperliquidCryptoSymbol(symbol) {
  var base = cryptoBaseSymbol(symbol)
  return base === "HYPE"
}

function isCoinbaseCryptoSymbol(symbol) {
  var s = normalizeSymbol(symbol)
  // Yahoo uses CoinMarketCap numeric IDs for collision tickers (e.g. HYPE32196-USD, PEPE24478-USD)
  if (/[0-9]{3,}-USD$/i.test(s)) return false
  return s.endsWith("-USD") || s.endsWith("-USDT") || s.endsWith("-EUR") || s.endsWith("-GBP")
}

function yahooChartUrl(symbol, rangeKey) {
  var sym = normalizeSymbol(symbol)
  var spec = chartSpec(rangeKey)
  var prepost = "false"
  if (spec.period1 !== undefined && spec.period2 !== undefined) {
    return "https://query1.finance.yahoo.com/v8/finance/chart/"
      + encodeURIComponent(sym)
      + "?period1=" + spec.period1
      + "&period2=" + spec.period2
      + "&interval=" + spec.interval
      + "&includePrePost=" + prepost
  }
  return "https://query1.finance.yahoo.com/v8/finance/chart/"
    + encodeURIComponent(sym)
    + "?range=" + spec.range
    + "&interval=" + spec.interval
    + "&includePrePost=" + prepost
}

function chartUrl(symbol, rangeKey) {
  var sym = normalizeSymbol(symbol)
  var rk = String(rangeKey || "1D")
  if (isCoinbaseCryptoSymbol(sym) && (rk === "30" || rk === "60" || rk === "1D" || rk === "1W")) {
    var gran = (rk === "30") ? "1800" : ((rk === "60") ? "3600" : "86400")
    return "https://api.exchange.coinbase.com/products/" + encodeURIComponent(sym) + "/candles?granularity=" + gran
  }
  return yahooChartUrl(sym, rk)
}

function chartCommand(symbol, rangeKey) {
  var sym = normalizeSymbol(symbol)
  var rk = String(rangeKey || "1D")
  if (isHyperliquidCryptoSymbol(sym) && (rk === "30" || rk === "60" || rk === "1D" || rk === "1W")) {
    var coin = cryptoBaseSymbol(sym)
    var interval = (rk === "30") ? "30m" : ((rk === "60" || rk === "60m") ? "1h" : "1d")
    var lookbackDays = (rk === "30" || rk === "60" || rk === "60m") ? 30 : 400
    var startTime = Date.now() - (lookbackDays * 86400000)
    var payload = JSON.stringify({
      type: "candleSnapshot",
      req: {
        coin: coin,
        interval: interval,
        startTime: startTime
      }
    })
    return [
      "curl", "-fsS", "--compressed", "--max-time", "8", "-A", "Mozilla/5.0",
      "-X", "POST",
      "-H", "Content-Type: application/json",
      "-d", payload,
      "https://api.hyperliquid.xyz/info"
    ]
  }
  return ["curl", "-fsS", "--compressed", "--max-time", "8", "-A", "Mozilla/5.0", chartUrl(sym, rk)]
}

function collectPeriods(value) {
  var out = []
  function walk(v) {
    if (!v) return
    if (Array.isArray(v)) {
      for (var i = 0; i < v.length; i++) walk(v[i])
      return
    }
    if (typeof v === "object" && v.start != null && v.end != null) {
      var a = Number(v.start)
      var b = Number(v.end)
      if (isFinite(a) && isFinite(b)) out.push({ start: a, end: b })
    }
  }
  walk(value)
  return out
}

function inWindows(windows, now) {
  for (var i = 0; i < windows.length; i++) {
    if (now >= windows[i].start && now < windows[i].end) return true
  }
  return false
}

function sessionFromMeta(meta) {
  if (!meta) return "closed"
  if (String(meta.instrumentType || "") === "CRYPTOCURRENCY") return "live"
  var now = Date.now() / 1000
  var periods = meta.tradingPeriods || {}
  var current = meta.currentTradingPeriod || {}
  var pre = collectPeriods(periods.pre).concat(collectPeriods(current.pre))
  var regular = collectPeriods(periods.regular).concat(collectPeriods(current.regular))
  var post = collectPeriods(periods.post).concat(collectPeriods(current.post))
  if (inWindows(regular, now)) return "regular"
  if (inWindows(pre, now)) return "pre"
  if (inWindows(post, now)) return "post"
  return "closed"
}

function rangeCaption(rangeKey, quote) {
  switch (String(rangeKey || "1D")) {
    case "30": return "30-Minute Candles (1 Month)"
    case "60":
    case "60m": return "60-Minute Candles (1 Month)"
    case "1D": return "1-Day Candles (1 Year)"
    case "1W": return "1-Week Candles (5 Years)"
    case "1M": return "1-Month Candles (10 Years)"
    case "1Y": return "1-Year Candles (All Time)"
    default: return ""
  }
}

function extendedLabel(quote) {
  if (!quote || !quote.hasExtended) return ""
  if (quote.session === "pre") return "Pre-Market"
  return "After Hours"
}

function parseSearch(raw) {
  try {
    var data = JSON.parse(String(raw || "{}"))
    var quotes = data.quotes || []
    var out = []
    var seen = {}
    for (var i = 0; i < quotes.length; i++) {
      var row = quotes[i]
      if (!row || !row.symbol) continue
      var type = String(row.quoteType || "")
      if (type === "OPTION") continue
      var symbol = normalizeSymbol(row.symbol)
      if (!symbol || seen[symbol]) continue
      seen[symbol] = true
      out.push({
        symbol: symbol,
        name: String(row.shortname || row.longname || symbol),
        type: type,
        exchange: String(row.exchDisp || row.exchange || "")
      })
    }
    return out
  } catch (e) {
    return []
  }
}

function numericCloses(indicators) {
  var quote = indicators && indicators.quote && indicators.quote[0] ? indicators.quote[0] : null
  var closes = quote && quote.close ? quote.close : []
  var out = []
  for (var i = 0; i < closes.length; i++) {
    if (closes[i] === null || closes[i] === undefined || closes[i] === "") continue
    var n = Number(closes[i])
    if (isFinite(n)) out.push(n)
  }
  return out
}

function aggregateYearlyCandles(candles) {
  var map = {}
  var years = []
  for (var i = 0; i < candles.length; i++) {
    var c = candles[i]
    if (!c || !c.timestamp) continue
    var d = new Date(c.timestamp * 1000)
    var yr = d.getUTCFullYear()
    if (!map[yr]) {
      map[yr] = {
        timestamp: Math.floor(Date.UTC(yr, 0, 1, 0, 0, 0) / 1000),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0
      }
      years.push(yr)
    } else {
      var existing = map[yr]
      existing.high = Math.max(existing.high, c.high)
      existing.low = Math.min(existing.low, c.low)
      existing.close = c.close
      existing.volume += (c.volume || 0)
    }
  }
  var out = []
  for (var k = 0; k < years.length; k++) {
    out.push(map[years[k]])
  }
  return out
}

function mergePeriodCandles(candles, rangeKey) {
  if (!candles || candles.length === 0) return []
  var range = String(rangeKey || "1D")
  if (range === "1Y") {
    return aggregateYearlyCandles(candles)
  }
  if (candles.length <= 1) return candles.slice()
  var out = []

  function isSamePeriod(c1, c2) {
    if (!c1 || !c2 || !c1.timestamp || !c2.timestamp) return false
    var t1 = c1.timestamp
    var t2 = c2.timestamp
    if (t1 === t2) return true

    if (range === "1M") {
      var d1 = new Date(t1 * 1000)
      var d2 = new Date(t2 * 1000)
      return d1.getUTCFullYear() === d2.getUTCFullYear() && d1.getUTCMonth() === d2.getUTCMonth()
    }

    if (range === "1W") {
      function getUtcMonday(t) {
        var dt = new Date(t * 1000)
        var day = dt.getUTCDay()
        var diff = dt.getUTCDate() - day + (day === 0 ? -6 : 1)
        return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), diff)).getTime()
      }
      return getUtcMonday(t1) === getUtcMonday(t2)
    }

    if (range === "1D") {
      var d1d = new Date(t1 * 1000)
      var d2d = new Date(t2 * 1000)
      return d1d.getUTCFullYear() === d2d.getUTCFullYear()
        && d1d.getUTCMonth() === d2d.getUTCMonth()
        && d1d.getUTCDate() === d2d.getUTCDate()
    }

    if (range === "60" || range === "30") {
      var d1h = new Date(t1 * 1000)
      var d2h = new Date(t2 * 1000)
      if (d1h.getUTCFullYear() !== d2h.getUTCFullYear() ||
          d1h.getUTCMonth() !== d2h.getUTCMonth() ||
          d1h.getUTCDate() !== d2h.getUTCDate()) {
        return false
      }
      var bucketSec = range === "30" ? 1800 : 3600
      var offsetSec = t1 % bucketSec
      if (Math.floor((t1 - offsetSec) / bucketSec) === Math.floor((t2 - offsetSec) / bucketSec)) {
        return true
      }
      if (range === "30" && (t2 - t1 === 1800) && !c2.volume) {
        return true
      }
      return false
    }

    return false
  }

  for (var i = 0; i < candles.length; i++) {
    var c = candles[i]
    if (!c) continue
    if (out.length > 0 && isSamePeriod(out[out.length - 1], c)) {
      var last = out[out.length - 1]
      last.high = Math.max(last.high, c.high)
      last.low = Math.min(last.low, c.low)
      last.close = c.close
      last.volume = (last.volume || 0) + (c.volume || 0)
    } else {
      out.push({
        timestamp: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0
      })
    }
  }

  return out
}

function parseCandles(timestamps, indicators) {
  var quote = indicators && indicators.quote && indicators.quote[0] ? indicators.quote[0] : null
  if (!quote || !quote.close) return []
  var ts = Array.isArray(timestamps) ? timestamps : []
  var opens = quote.open || []
  var highs = quote.high || []
  var lows = quote.low || []
  var closes = quote.close || []
  var volumes = quote.volume || []
  var out = []
  var len = closes.length
  for (var i = 0; i < len; i++) {
    var c = finiteOrNull(closes[i])
    var t = i < ts.length ? finiteOrNull(ts[i]) : null
    if (c === null) {
      if (out.length === 0 || t === null) continue
      c = out[out.length - 1].close
    }
    var o = finiteOrNull(opens[i])
    var h = finiteOrNull(highs[i])
    var l = finiteOrNull(lows[i])
    var v = finiteOrNull(volumes[i])
    if (o === null) o = c
    if (h === null) h = Math.max(o, c)
    if (l === null) l = Math.min(o, c)
    h = Math.max(h, o, c)
    l = Math.min(l, o, c)
    out.push({
      timestamp: t,
      open: o,
      high: h,
      low: l,
      close: c,
      volume: v != null ? v : 0
    })
  }
  return out
}

function extractFtfcAnchors(hourlyCandles, meta, hasExplicitOpen) {
  var N = isArrayLike(hourlyCandles) ? hourlyCandles.length : 0
  if (!N) return null

  var lastCandle = hourlyCandles[N - 1]
  var lastDate = new Date(lastCandle.timestamp * 1000)

  // 60m: open of current 60m bar
  var open60 = null
  if (hasExplicitOpen && lastCandle.open != null) {
    open60 = lastCandle.open
  } else if (N >= 2) {
    open60 = hourlyCandles[N - 2].close
  } else {
    open60 = lastCandle.open != null ? lastCandle.open : lastCandle.close
  }

  // D (Daily): regularMarketOpen, first bar open, or prior day close
  var dayOpen = meta ? finiteOrNull(meta.regularMarketOpen) : null
  if (dayOpen === 0) dayOpen = null
  if (dayOpen === null) {
    for (var i = 0; i < N; i++) {
      var d = new Date(hourlyCandles[i].timestamp * 1000)
      if (d.getUTCFullYear() === lastDate.getUTCFullYear() &&
          d.getUTCMonth() === lastDate.getUTCMonth() &&
          d.getUTCDate() === lastDate.getUTCDate()) {
        if (hasExplicitOpen && hourlyCandles[i].open != null) {
          dayOpen = hourlyCandles[i].open
        } else if (i > 0) {
          dayOpen = hourlyCandles[i - 1].close
        } else {
          dayOpen = hourlyCandles[i].close
        }
        break
      }
    }
  }
  if (dayOpen === null) {
    var prev = meta ? (finiteOrNull(meta.chartPreviousClose) || finiteOrNull(meta.previousClose)) : null
    dayOpen = prev !== null ? prev : hourlyCandles[0].close
  }

  // W (Weekly): Monday open if explicit, else prior week close
  var dayOfWeek = lastDate.getUTCDay()
  var diffToMon = lastDate.getUTCDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
  var mondayUtc = Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth(), diffToMon, 0, 0, 0) / 1000
  var weekOpen = null
  for (var w = 0; w < N; w++) {
    if (hourlyCandles[w].timestamp >= mondayUtc) {
      if (hasExplicitOpen && hourlyCandles[w].open != null) {
        weekOpen = hourlyCandles[w].open
      } else if (w > 0) {
        weekOpen = hourlyCandles[w - 1].close
      } else {
        weekOpen = hourlyCandles[w].close
      }
      break
    }
  }
  if (weekOpen === null) weekOpen = hourlyCandles[0].close

  // M (Monthly): 1st of current month open if explicit, else first bar close
  var monthUtc = Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth(), 1, 0, 0, 0) / 1000
  var monthOpen = null
  for (var m = 0; m < N; m++) {
    if (hourlyCandles[m].timestamp >= monthUtc) {
      monthOpen = hasExplicitOpen && hourlyCandles[m].open != null
        ? hourlyCandles[m].open
        : (hourlyCandles[m].open != null ? hourlyCandles[m].open : hourlyCandles[m].close)
      break
    }
  }
  if (monthOpen === null) monthOpen = hourlyCandles[0].close

  return {
    open60: open60,
    openD: dayOpen,
    openW: weekOpen,
    openM: monthOpen,
    hourBucket: Math.floor((Number(lastCandle.timestamp) || 0) / 3600),
    anchoredAt: Date.now()
  }
}

function computeFtfcFromAnchors(anchors, livePrice) {
  var p = finiteOrNull(livePrice)
  var fallback = { "60": "flat", "D": "flat", "W": "flat", "M": "flat" }
  if (!anchors || p === null) return fallback
  function tone(curr, ref) {
    if (curr === null || ref === null || ref === undefined) return "flat"
    return curr >= ref ? "up" : "down"
  }
  return {
    "60": tone(p, anchors.open60),
    "D": tone(p, anchors.openD),
    "W": tone(p, anchors.openW),
    "M": tone(p, anchors.openM)
  }
}

function extractFTFC(timestamps, indicators, price, meta) {
  var quote = indicators && indicators.quote && indicators.quote[0] ? indicators.quote[0] : null
  var hasExplicitOpen = !!(quote && quote.open && quote.open.length)
  var p = finiteOrNull(price)
  var rawCandles = parseCandles(timestamps, indicators)
  var hourlyCandles = mergePeriodCandles(rawCandles, "60")
  if (!hourlyCandles.length || p === null) {
    return { "60": "flat", "D": "flat", "W": "flat", "M": "flat" }
  }
  var anchors = extractFtfcAnchors(hourlyCandles, meta, hasExplicitOpen)
  return computeFtfcFromAnchors(anchors, p)
}

function timeframeColor(quote, tf, upColor, downColor, dimColor) {
  if (!quote || !quote.ftfc) return dimColor || ""
  var t = quote.ftfc[tf]
  if (t === "up") return upColor || ""
  if (t === "down") return downColor || ""
  return dimColor || ""
}

function quoteFromChart(result, fallbackSymbol, rangeKey) {
  if (!result || !result.meta) return null
  var meta = result.meta
  var symbol = normalizeSymbol(meta.symbol || fallbackSymbol)
  if (!symbol) return null

  var regularPrice = finiteOrNull(meta.regularMarketPrice)
  var prev = finiteOrNull(meta.chartPreviousClose)
  if (prev === null) prev = finiteOrNull(meta.previousClose)
  var regularPct = finiteOrNull(meta.regularMarketChangePercent)
  if (regularPct === null && regularPrice != null && prev !== null && prev !== 0)
    regularPct = ((regularPrice - prev) / prev) * 100

  var fullday = finiteOrNull(meta.fulldayPrice)
  var fulldayPct = finiteOrNull(meta.fulldayChangePercent)
  var session = sessionFromMeta(meta)
  var hasPrePost = !!meta.hasPrePostMarketData
  var extendedPct = null
  if (regularPrice && fullday != null && regularPrice !== 0)
    extendedPct = ((fullday - regularPrice) / regularPrice) * 100
  if (extendedPct == null && isFinite(fulldayPct)) extendedPct = fulldayPct
  var hasExtended = hasPrePost && fullday != null && regularPrice != null
    && Math.abs(fullday - regularPrice) >= 0.005
  var useExtended = hasExtended && session !== "regular" && session !== "live"
  var latest = useExtended ? fullday : regularPrice
  var latestPct = useExtended ? (fulldayPct != null ? fulldayPct : extendedPct) : regularPct
  var latestChange = null
  if (useExtended) {
    latestChange = finiteOrNull(meta.fulldayChange)
    if (latestChange == null && fullday != null && regularPrice != null)
      latestChange = fullday - regularPrice
  } else {
    latestChange = finiteOrNull(meta.regularMarketChange)
    if (latestChange == null && regularPrice != null && isFinite(prev))
      latestChange = regularPrice - prev
  }
  var openPx = finiteOrNull(meta.regularMarketOpen)
  if (openPx === 0) openPx = null

  var rawCandles = parseCandles(result.timestamp, result.indicators)
  var candles
  if (rangeKey === "1Y") {
    candles = aggregateYearlyCandles(rawCandles)
  } else {
    candles = mergePeriodCandles(rawCandles, rangeKey)
  }

  var candlePrice = regularPrice != null ? regularPrice : latest
  if (candles.length > 0 && candlePrice !== null) {
    var lastCandle = candles[candles.length - 1]
    lastCandle.close = candlePrice
    if (lastCandle.high !== null) {
      lastCandle.high = Math.max(lastCandle.high, candlePrice)
    } else {
      lastCandle.high = candlePrice
    }
    if (lastCandle.low !== null) {
      lastCandle.low = Math.min(lastCandle.low, candlePrice)
    } else {
      lastCandle.low = candlePrice
    }
    if (lastCandle.open === null) {
      lastCandle.open = candlePrice
    }
    if (rangeKey === "1D") {
      var dHigh = finiteOrNull(meta.regularMarketDayHigh)
      var dLow = finiteOrNull(meta.regularMarketDayLow)
      if (dHigh !== null) lastCandle.high = Math.max(lastCandle.high, dHigh)
      if (dLow !== null) lastCandle.low = Math.min(lastCandle.low, dLow)
    }
  }

  var closes = []
  for (var k = 0; k < candles.length; k++) {
    closes.push(candles[k].close)
  }

  var ftfcPrice = regularPrice != null ? regularPrice : latest
  var granularity = String(meta.dataGranularity || "")
  var isHourly = granularity === "1h" || granularity === "60m" || rangeKey === "60"
  var q0 = result.indicators && result.indicators.quote && result.indicators.quote[0] ? result.indicators.quote[0] : null
  var hasExplicitOpen = !!(q0 && q0.open && q0.open.length)
  var ftfcAnchors = null
  var ftfc = null
  if (isHourly) {
    var hourlyCandles = (rangeKey === "60" || rangeKey === "60m") ? candles : mergePeriodCandles(rawCandles, "60")
    ftfcAnchors = extractFtfcAnchors(hourlyCandles, meta, hasExplicitOpen)
    ftfc = ftfcAnchors ? computeFtfcFromAnchors(ftfcAnchors, ftfcPrice) : { "60": "flat", "D": "flat", "W": "flat", "M": "flat" }
  }

  return {
    symbol: symbol,
    name: String(meta.shortName || meta.longName || symbol),
    currency: String(meta.currency || "USD"),
    price: latest,
    previousClose: prev,
    change: latestChange,
    changePercent: latestPct,
    regularPrice: regularPrice,
    regularChangePercent: regularPct,
    extendedPrice: fullday,
    extendedChangePercent: extendedPct,
    hasExtended: hasExtended,
    session: session,
    timestamp: finiteOrNull(meta.regularMarketTime),
    dayHigh: finiteOrNull(meta.regularMarketDayHigh),
    dayLow: finiteOrNull(meta.regularMarketDayLow),
    volume: finiteOrNull(meta.regularMarketVolume),
    open: openPx,
    fiftyTwoWeekHigh: finiteOrNull(meta.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: finiteOrNull(meta.fiftyTwoWeekLow),
    priceHint: meta.priceHint,
    yahooRange: meta.range ? String(meta.range) : "",
    instrumentType: String(meta.instrumentType || meta.quoteType || ""),
    closes: closes,
    candles: candles,
    ftfc: ftfc,
    ftfcAnchors: ftfcAnchors
  }
}

function parseSpark(raw) {
  try {
    var data = JSON.parse(String(raw || "{}"))
    var results = data.spark && data.spark.result ? data.spark.result : []
    var out = {}
    for (var i = 0; i < results.length; i++) {
      var item = results[i]
      var resp = item && item.response && item.response[0] ? item.response[0] : null
      var quote = quoteFromChart(resp, item && item.symbol, "1D")
      if (quote) out[quote.symbol] = quote
    }
    return out
  } catch (e) {
    return {}
  }
}

function extractFTFCFromCandles(hourlyCandles, price) {
  var N = hourlyCandles ? hourlyCandles.length : 0
  var p = finiteOrNull(price)
  var fallback = { "60": "flat", "D": "flat", "W": "flat", "M": "flat" }
  if (!N || p === null) return fallback

  var lastCandle = hourlyCandles[N - 1]
  var lastDate = new Date(lastCandle.timestamp * 1000)

  // 60m: open of current 60m bar
  var open60 = lastCandle.open != null ? lastCandle.open : (N >= 2 ? hourlyCandles[N - 2].close : lastCandle.close)

  // D (Daily): first bar of current UTC day
  var dayOpen = null
  for (var i = 0; i < N; i++) {
    var d = new Date(hourlyCandles[i].timestamp * 1000)
    if (d.getUTCFullYear() === lastDate.getUTCFullYear() &&
        d.getUTCMonth() === lastDate.getUTCMonth() &&
        d.getUTCDate() === lastDate.getUTCDate()) {
      dayOpen = hourlyCandles[i].open != null ? hourlyCandles[i].open : hourlyCandles[i].close
      break
    }
  }
  if (dayOpen === null) dayOpen = hourlyCandles[0].close

  // W (Weekly): Monday open of current week
  var dayOfWeek = lastDate.getUTCDay()
  var diffToMon = lastDate.getUTCDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
  var mondayUtc = Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth(), diffToMon, 0, 0, 0) / 1000
  var weekOpen = null
  for (var w = 0; w < N; w++) {
    if (hourlyCandles[w].timestamp >= mondayUtc) {
      weekOpen = hourlyCandles[w].open != null ? hourlyCandles[w].open : hourlyCandles[w].close
      break
    }
  }
  if (weekOpen === null) weekOpen = hourlyCandles[0].close

  // M (Monthly): 1st of current month
  var monthUtc = Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth(), 1, 0, 0, 0) / 1000
  var monthOpen = null
  for (var m = 0; m < N; m++) {
    if (hourlyCandles[m].timestamp >= monthUtc) {
      monthOpen = hourlyCandles[m].open != null ? hourlyCandles[m].open : hourlyCandles[m].close
      break
    }
  }
  if (monthOpen === null) monthOpen = hourlyCandles[0].close

  function tone(curr, ref) {
    if (curr === null || ref === null) return "flat"
    return curr >= ref ? "up" : "down"
  }

  return {
    "60": tone(p, open60),
    "D": tone(p, dayOpen),
    "W": tone(p, weekOpen),
    "M": tone(p, monthOpen)
  }
}

function parseCoinbaseChart(raw, fallbackSymbol, rangeKey) {
  try {
    var data = typeof raw === "string" ? JSON.parse(raw) : raw
    if (!Array.isArray(data) || data.length === 0) return null
    var symbol = normalizeSymbol(fallbackSymbol)
    var rawCandles = []
    for (var i = data.length - 1; i >= 0; i--) {
      var b = data[i]
      if (!Array.isArray(b) || b.length < 5) continue
      var t = finiteOrNull(b[0])
      var l = finiteOrNull(b[1])
      var h = finiteOrNull(b[2])
      var o = finiteOrNull(b[3])
      var c = finiteOrNull(b[4])
      var v = finiteOrNull(b[5])
      if (t === null || c === null) continue
      if (o === null) o = c
      if (h === null) h = Math.max(o, c)
      if (l === null) l = Math.min(o, c)
      rawCandles.push({
        timestamp: t,
        open: o,
        high: h,
        low: l,
        close: c,
        volume: v != null ? v : 0
      })
    }
    if (rawCandles.length === 0) return null
    var rk = String(rangeKey || "1D")
    var candles = mergePeriodCandles(rawCandles, rk)
    var closes = []
    for (var k = 0; k < candles.length; k++) {
      closes.push(candles[k].close)
    }
    var last = candles[candles.length - 1]
    var prev = candles.length > 1 ? candles[candles.length - 2] : null
    var prevClose = prev ? prev.close : last.open
    var change = last.close - prevClose
    var changePercent = (prevClose !== 0) ? (change / prevClose) * 100 : 0
    var ftfcAnchors = (rk === "60") ? extractFtfcAnchors(candles, null, true) : null
    var ftfc = ftfcAnchors ? computeFtfcFromAnchors(ftfcAnchors, last.close) : null

    return {
      symbol: symbol,
      name: symbol,
      currency: "USD",
      price: last.close,
      previousClose: prevClose,
      change: change,
      changePercent: changePercent,
      regularPrice: last.close,
      regularChangePercent: changePercent,
      extendedPrice: null,
      extendedChangePercent: null,
      hasExtended: false,
      session: "live",
      dayHigh: last.high,
      dayLow: last.low,
      volume: last.volume,
      open: last.open,
      fiftyTwoWeekHigh: null,
      fiftyTwoWeekLow: null,
      priceHint: 2,
      yahooRange: "",
      closes: closes,
      candles: candles,
      ftfc: ftfc,
      ftfcAnchors: ftfcAnchors
    }
  } catch (e) {
    return null
  }
}

function parseHyperliquidChart(raw, fallbackSymbol, rangeKey) {
  try {
    var data = typeof raw === "string" ? JSON.parse(raw) : raw
    if (!Array.isArray(data) || data.length === 0 || !data[0] || data[0].t === undefined) return null
    var symbol = normalizeSymbol(fallbackSymbol)
    var rawCandles = []
    for (var i = 0; i < data.length; i++) {
      var b = data[i]
      if (!b || b.t === undefined) continue
      var t = Math.floor(Number(b.t) / 1000)
      var o = finiteOrNull(b.o)
      var h = finiteOrNull(b.h)
      var l = finiteOrNull(b.l)
      var c = finiteOrNull(b.c)
      var v = finiteOrNull(b.v)
      if (!isFinite(t) || c === null) continue
      if (o === null) o = c
      if (h === null) h = Math.max(o, c)
      if (l === null) l = Math.min(o, c)
      rawCandles.push({
        timestamp: t,
        open: o,
        high: h,
        low: l,
        close: c,
        volume: v != null ? v : 0
      })
    }
    if (rawCandles.length === 0) return null
    var rk = String(rangeKey || "1D")
    var candles = mergePeriodCandles(rawCandles, rk)
    var closes = []
    for (var k = 0; k < candles.length; k++) {
      closes.push(candles[k].close)
    }
    var last = candles[candles.length - 1]
    var prev = candles.length > 1 ? candles[candles.length - 2] : null
    var prevClose = prev ? prev.close : last.open
    var change = last.close - prevClose
    var changePercent = (prevClose !== 0) ? (change / prevClose) * 100 : 0
    var ftfcAnchors = (rk === "60") ? extractFtfcAnchors(candles, null, true) : null
    var ftfc = ftfcAnchors ? computeFtfcFromAnchors(ftfcAnchors, last.close) : null

    return {
      symbol: symbol,
      name: symbol,
      currency: "USD",
      price: last.close,
      previousClose: prevClose,
      change: change,
      changePercent: changePercent,
      regularPrice: last.close,
      regularChangePercent: changePercent,
      extendedPrice: null,
      extendedChangePercent: null,
      hasExtended: false,
      session: "live",
      dayHigh: last.high,
      dayLow: last.low,
      volume: last.volume,
      open: last.open,
      fiftyTwoWeekHigh: null,
      fiftyTwoWeekLow: null,
      priceHint: priceDecimals(last.close, 2),
      yahooRange: "",
      closes: closes,
      candles: candles,
      ftfc: ftfc,
      ftfcAnchors: ftfcAnchors
    }
  } catch (e) {
    return null
  }
}

function parseChart(raw, rangeKey, fallbackSymbol) {
  try {
    if (Array.isArray(raw)) {
      if (raw.length > 0 && raw[0] && raw[0].t !== undefined) {
        return parseHyperliquidChart(raw, fallbackSymbol, rangeKey)
      }
      return parseCoinbaseChart(raw, fallbackSymbol, rangeKey)
    }
    if (raw && typeof raw === "object" && raw.chart && raw.chart.result) {
      return quoteFromChart(raw.chart.result[0], fallbackSymbol || "", rangeKey)
    }
    var str = String(raw || "").trim()
    if (str.charAt(0) === "[") {
      var parsedArr = JSON.parse(str)
      if (Array.isArray(parsedArr) && parsedArr.length > 0 && parsedArr[0] && parsedArr[0].t !== undefined) {
        return parseHyperliquidChart(parsedArr, fallbackSymbol, rangeKey)
      }
      return parseCoinbaseChart(parsedArr, fallbackSymbol, rangeKey)
    }
    var data = JSON.parse(str || "{}")
    if (Array.isArray(data)) {
      if (data.length > 0 && data[0] && data[0].t !== undefined) {
        return parseHyperliquidChart(data, fallbackSymbol, rangeKey)
      }
      return parseCoinbaseChart(data, fallbackSymbol, rangeKey)
    }
    var result = data.chart && data.chart.result && data.chart.result[0] ? data.chart.result[0] : null
    return quoteFromChart(result, fallbackSymbol || "", rangeKey)
  } catch (e) {
    return null
  }
}

function mergeQuotes(current, incoming) {
  var out = {}
  var key
  if (current) {
    for (key in current) {
      if (Object.prototype.hasOwnProperty.call(current, key)) out[key] = current[key]
    }
  }
  if (incoming) {
    for (key in incoming) {
      if (!Object.prototype.hasOwnProperty.call(incoming, key)) continue
      var inc = incoming[key]
      var prev = out[key]
      if (prev && inc && typeof prev === "object" && typeof inc === "object") {
        var merged = Object.assign({}, prev, inc)
        var incIsRth = !inc.session || inc.session === "regular" || inc.session === "live"
        var prevTs = finiteOrNull(prev.timestamp)
        var incTs = finiteOrNull(inc.timestamp)
        var isNewRegularDay = incIsRth && (
          (prevTs !== null && incTs !== null && marketDateEt(incTs) > marketDateEt(prevTs)) ||
          (prev.session === "pre" && inc.session === "regular")
        )
        if (isNewRegularDay) {
          if (inc.open == null) merged.open = null
          if (inc.dayHigh == null) merged.dayHigh = null
          if (inc.dayLow == null) merged.dayLow = null
          if (inc.volume == null) merged.volume = null
          if (inc.regularMarketDayHigh == null && merged.regularMarketDayHigh !== undefined) merged.regularMarketDayHigh = null
          if (inc.regularMarketDayLow == null && merged.regularMarketDayLow !== undefined) merged.regularMarketDayLow = null
        }
        if (!inc.name && prev.name) merged.name = prev.name
        if (!inc.currency && prev.currency) merged.currency = prev.currency
        if ((inc.priceHint === undefined || inc.priceHint === null) && prev.priceHint !== undefined) merged.priceHint = prev.priceHint
        if (inc.previousClose == null && prev.previousClose != null) merged.previousClose = prev.previousClose
        if (!isNewRegularDay && inc.open == null && prev.open != null) merged.open = prev.open
        if (!isNewRegularDay && inc.dayHigh == null && prev.dayHigh != null) merged.dayHigh = prev.dayHigh
        if (!isNewRegularDay && inc.dayLow == null && prev.dayLow != null) merged.dayLow = prev.dayLow
        if (!isNewRegularDay && inc.volume == null && prev.volume != null) merged.volume = prev.volume
        if (inc.fiftyTwoWeekHigh == null && prev.fiftyTwoWeekHigh != null) merged.fiftyTwoWeekHigh = prev.fiftyTwoWeekHigh
        if (inc.fiftyTwoWeekLow == null && prev.fiftyTwoWeekLow != null) merged.fiftyTwoWeekLow = prev.fiftyTwoWeekLow
        if (!inc.ftfcAnchors && prev.ftfcAnchors) merged.ftfcAnchors = prev.ftfcAnchors
        if (!inc.closes || inc.closes.length === 0) {
          if (prev.closes && prev.closes.length > 0) merged.closes = prev.closes
        }
        if (!inc.ftfc) {
          var ftfcPx = merged.regularPrice != null ? merged.regularPrice : merged.price
          if (merged.ftfcAnchors && ftfcPx != null) {
            merged.ftfc = computeFtfcFromAnchors(merged.ftfcAnchors, ftfcPx)
          } else if (prev.ftfc) {
            merged.ftfc = prev.ftfc
          }
        }
        out[key] = merged
      } else {
        out[key] = inc
      }
    }
  }
  return out
}

function backoffDelay(baseMs, failures, maxMs) {
  var base = Math.max(1, parseInt(baseMs, 10) || 1)
  var count = Math.max(0, Math.min(10, parseInt(failures, 10) || 0))
  var ceiling = Math.max(base, parseInt(maxMs, 10) || base)
  return Math.min(ceiling, base * Math.pow(2, count))
}

function delayedLoaderDelayMs() {
  return 100
}

function shouldShowDelayedLoader(loading, startedAt, now, delayMs) {
  if (!loading) return false
  var started = Number(startedAt)
  var current = Number(now)
  var delay = delayMs == null || delayMs === undefined ? delayedLoaderDelayMs() : Number(delayMs)
  if (!isFinite(started) || started <= 0) return false
  if (!isFinite(current) || !isFinite(delay) || delay < 0) return false
  return (current - started) >= delay
}

function withCommas(text) {
  var parts = String(text).split(".")
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return parts.join(".")
}

function priceDecimals(price, hint) {
  var n = Number(price)
  var abs = Math.abs(n)
  var h = parseInt(hint, 10)
  if (isFinite(h) && h >= 0 && h <= 8) {
    if (isFinite(abs) && abs > 0 && abs < 1) return Math.max(h, 4)
    return h
  }
  if (!isFinite(abs)) return 2
  if (abs >= 1) return 2
  if (abs >= 0.01) return 4
  return 6
}

function formatPrice(price, currency, hint) {
  var n = finiteOrNull(price)
  if (n === null) return "-"
  var body = withCommas(n.toFixed(priceDecimals(n, hint)))
  var code = String(currency || "USD")
  if (code === "USD") return "$" + body
  return body + " " + code
}

function formatScalePrice(price, step, hint) {
  var n = finiteOrNull(price)
  if (n === null) return "-"
  var abs = Math.abs(n)
  var baseDec = priceDecimals(n, hint)
  var dec = baseDec
  var s = finiteOrNull(step)
  if (s !== null && s > 0) {
    if (s < 1) {
      var stepDec = Math.min(6, Math.max(0, Math.ceil(-Math.log10(s) - 1e-9)))
      var scaled = s * Math.pow(10, stepDec)
      if (Math.abs(scaled - Math.round(scaled)) > 0.05 && stepDec < 6)
        stepDec += 1
      dec = Math.max(baseDec, stepDec)
    } else if (Math.abs(n - Math.round(n)) < 1e-6 && (abs >= 1000 || (abs >= 10 && s >= 5))) {
      dec = 0
    }
  } else if (abs >= 10000) {
    dec = 0
  }
  return withCommas(n.toFixed(dec))
}

function formatPercent(pct) {
  var n = finiteOrNull(pct)
  if (n === null) return "-"
  var sign = n > 0 ? "+" : ""
  return sign + n.toFixed(2) + "%"
}

function formatChange(amount, currency, hint) {
  var n = Number(amount)
  if (!isFinite(n)) return "-"
  var sign = n > 0 ? "+" : (n < 0 ? "-" : "")
  var decimals = Math.abs(n) >= 0.01 ? 2 : priceDecimals(n, hint)
  var body = withCommas(Math.abs(n).toFixed(decimals))
  if (String(currency || "USD") === "USD") return sign + "$" + body
  return sign + body + " " + String(currency)
}

function formatQuoteChange(quote, style) {
  if (!quote) return "-"
  if (style === "dollars") return formatChange(quote.change, quote.currency, quote.priceHint)
  return formatPercent(quote.changePercent)
}

function amountFromPercent(price, pct) {
  var p = Number(price)
  var c = Number(pct)
  if (!isFinite(p) || !isFinite(c) || c === -100) return null
  return p * c / (100 + c)
}

function formatChangePair(pct, amount, price, currency, hint) {
  var dollars = amount
  if (dollars == null || !isFinite(Number(dollars)))
    dollars = amountFromPercent(price, pct)
  var p = formatPercent(pct)
  var a = formatChange(dollars, currency, hint)
  if (p === "-" && a === "-") return "-"
  if (a === "-") return p
  if (p === "-") return a
  return a + " (" + p + ")"
}

function formatCompact(value) {
  var n = finiteOrNull(value)
  if (n === null) return "-"
  var abs = Math.abs(n)
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + "T"
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + "B"
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + "M"
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + "K"
  return String(Math.round(n))
}

function changeTone(pct) {
  var n = finiteOrNull(pct)
  if (n === null || n === 0) return "flat"
  return n > 0 ? "up" : "down"
}

function barLabel(pinned, quote, vertical, showTicker, showPrice, showChange, style) {
  var symbol = normalizeSymbol(pinned)
  if (!symbol) return "$"
  var parts = []
  if (showTicker !== false) parts.push(symbol)
  var hasPrice = quote && quote.price !== null && quote.price !== undefined
  var hasChange = quote && (style === "dollars"
    ? quote.change !== null && quote.change !== undefined
    : quote.changePercent !== null && quote.changePercent !== undefined)
  var price = hasPrice ? formatPrice(quote.price, quote.currency, quote.priceHint) : ""
  var change = hasChange ? formatQuoteChange(quote, style) : ""
  if (showPrice !== false && price && price !== "-") parts.push(price)
  if (showChange !== false && change && change !== "-") parts.push(change)
  return parts.length ? parts.join(vertical ? "\n" : "  ") : "$"
}

function barLabelTone(quote, showTicker, showPrice, showChange, style) {
  if ((showTicker === false && showPrice === false && showChange === false) || !quote) return "flat"
  return changeTone(style === "dollars" ? quote.change : quote.changePercent)
}

function suggestionMeta(row) {
  if (!row) return ""
  var parts = []
  if (row.type) parts.push(row.type)
  if (row.exchange) parts.push(row.exchange)
  return parts.join(" · ")
}

function isFavorite(watchlist, symbol) {
  var next = normalizeSymbol(symbol)
  var list = Array.isArray(watchlist) ? watchlist : []
  return next !== "" && list.indexOf(next) !== -1
}

function insightsUrl(symbol) {
  return "https://query1.finance.yahoo.com/ws/insights/v2/finance/insights?symbol="
    + encodeURIComponent(normalizeSymbol(symbol))
}

function quotePageUrl(symbol) {
  return "https://finance.yahoo.com/quote/"
    + encodeURIComponent(normalizeSymbol(symbol)) + "/"
}

function decodeYahooHtml(html) {
  var s = String(html || "")
  if (s.indexOf("\\\"") !== -1) s = s.split("\\\"").join("\"")
  return s
}

function extractRawFmt(decoded, key) {
  var token = "\"" + key + "\":{\"raw\":"
  var i = decoded.indexOf(token)
  if (i < 0) return { raw: null, fmt: "" }
  var rest = decoded.slice(i + token.length)
  var m = String(rest).match(/^(-?[0-9.eE+]+)(?:,\"fmt\":\"([^\"]*)\")?/)
  if (!m) return { raw: null, fmt: "" }
  return { raw: Number(m[1]), fmt: m[2] || "" }
}

function extractQuoted(decoded, key) {
  var token = "\"" + key + "\":\""
  var i = decoded.indexOf(token)
  if (i < 0) return ""
  var rest = decoded.slice(i + token.length)
  var end = rest.indexOf("\"")
  if (end < 0) return ""
  return rest.slice(0, end)
}

function extractEarningsDate(decoded) {
  var token = "\"earningsDate\":["
  var i = decoded.indexOf(token)
  if (i < 0) return { raw: null, fmt: "", estimated: false }
  var rest = decoded.slice(i, i + 600)
  var m = rest.match(/\"raw\":(-?\d+),\"fmt\":\"([^\"]*)\"/)
  var estimated = rest.indexOf("isEarningsDateEst") !== -1 && rest.indexOf("true") !== -1
  if (!m) return { raw: null, fmt: "", estimated: estimated }
  return { raw: Number(m[1]), fmt: m[2], estimated: estimated }
}

function parseQuotePage(html) {
  var decoded = decodeYahooHtml(html)
  var earnings = extractEarningsDate(decoded)
  var marketCap = extractRawFmt(decoded, "marketCap")
  var trailingPE = extractRawFmt(decoded, "trailingPE")
  var forwardPE = extractRawFmt(decoded, "forwardPE")
  var trailingEps = extractRawFmt(decoded, "trailingEps")
  var dividendYield = extractRawFmt(decoded, "dividendYield")
  var dividendRate = extractRawFmt(decoded, "dividendRate")
  var exDividendDate = extractRawFmt(decoded, "exDividendDate")
  var dividendDate = extractRawFmt(decoded, "dividendDate")
  var targetMean = extractRawFmt(decoded, "targetMeanPrice")
  var averageVolume = extractRawFmt(decoded, "averageVolume")
  var beta = extractRawFmt(decoded, "beta")
  var circulating = extractRawFmt(decoded, "circulatingSupply")
  var volume24 = extractRawFmt(decoded, "volume24Hr")
  return {
    marketCap: marketCap.raw,
    trailingPE: trailingPE.raw,
    forwardPE: forwardPE.raw,
    trailingEps: trailingEps.raw,
    dividendYield: dividendYield.raw,
    dividendRate: dividendRate.raw,
    exDividendDate: exDividendDate.fmt || "",
    dividendDate: dividendDate.fmt || "",
    earningsDate: earnings.fmt || "",
    earningsEstimated: earnings.estimated,
    targetMeanPrice: targetMean.raw,
    averageVolume: averageVolume.raw,
    beta: beta.raw,
    sector: extractQuoted(decoded, "sector"),
    industry: extractQuoted(decoded, "industry"),
    circulatingSupply: circulating.raw,
    volume24Hr: volume24.raw
  }
}

function parseInsights(raw) {
  try {
    var data = JSON.parse(String(raw || "{}"))
    var result = data.finance && data.finance.result ? data.finance.result : null
    if (!result) return {}
    var rec = result.recommendation || {}
    var valuation = result.instrumentInfo && result.instrumentInfo.valuation ? result.instrumentInfo.valuation : {}
    var technicals = result.instrumentInfo && result.instrumentInfo.keyTechnicals ? result.instrumentInfo.keyTechnicals : {}
    var snapshot = result.companySnapshot || {}
    return {
      rating: rec.rating ? String(rec.rating) : "",
      targetPrice: finiteOrNull(rec.targetPrice),
      valuation: valuation.description ? String(valuation.description) : "",
      valuationDiscount: valuation.discount ? String(valuation.discount) : "",
      support: finiteOrNull(technicals.support),
      resistance: finiteOrNull(technicals.resistance),
      sector: snapshot.sectorInfo ? String(snapshot.sectorInfo) : ""
    }
  } catch (e) {
    return {}
  }
}

function isInsightsResponse(raw) {
  try {
    var data = JSON.parse(String(raw || "{}"))
    return !!(data.finance && data.finance.error == null && data.finance.result)
  } catch (e) {
    return false
  }
}

function formatIsoDate(iso) {
  var text = String(iso || "")
  var parts = text.split("-")
  if (parts.length < 3) return text
  var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  var month = parseInt(parts[1], 10) - 1
  var day = parseInt(parts[2], 10)
  if (month < 0 || month > 11 || !isFinite(day)) return text
  return months[month] + " " + day + ", " + parts[0]
}

function yieldPercent(value) {
  var n = finiteOrNull(value)
  if (n === null || n === 0) return "-"
  if (n > 0 && n <= 1) n = n * 100
  return n.toFixed(2) + "%"
}

function formatRatio(value) {
  var n = finiteOrNull(value)
  if (n === null) return "-"
  return n.toFixed(2)
}

function nextDividendIso(exIso) {
  var iso = String(exIso || "")
  if (!iso) return { iso: "", estimated: false }
  var stamp = Date.parse(iso + "T00:00:00Z")
  if (!isFinite(stamp)) return { iso: "", estimated: false }
  if (stamp >= Date.now() - 86400000) return { iso: iso, estimated: false }
  var next = new Date(stamp + 91 * 86400000)
  var y = next.getUTCFullYear()
  var m = next.getUTCMonth() + 1
  var d = next.getUTCDate()
  var mm = (m < 10 ? "0" : "") + m
  var dd = (d < 10 ? "0" : "") + d
  return { iso: y + "-" + mm + "-" + dd, estimated: true }
}

function formatCandleTime(timestamp, rangeKey) {
  var t = Number(timestamp)
  if (!isFinite(t) || t <= 0) return ""
  var d = new Date(t * 1000)
  var range = String(rangeKey || "1D")
  var days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  var hours = d.getHours()
  var minutes = d.getMinutes()
  var ampm = hours >= 12 ? "PM" : "AM"
  var h12 = hours % 12 || 12
  var mStr = (minutes < 10 ? "0" : "") + minutes
  var timeStr = h12 + ":" + mStr + " " + ampm

  if (range === "60" || range === "30" || range === "15" || range === "5" || range === "1") {
    var dayName = days[d.getDay()]
    var mon60 = months[d.getMonth()]
    var day60 = d.getDate()
    var year60 = d.getFullYear()
    return dayName + ", " + mon60 + " " + day60 + ", " + year60 + " " + timeStr
  }
  if (range === "1Y") return String(d.getUTCFullYear())
  if (range === "1M" || range === "All") return months[d.getUTCMonth()] + " " + d.getUTCFullYear()
  if (range === "1D" || range === "D" || range === "day" || range === "1d") {
    var dayNameUtc = days[d.getUTCDay()]
    return dayNameUtc + ", " + months[d.getUTCMonth()] + " " + d.getUTCDate() + ", " + d.getUTCFullYear()
  }
  return months[d.getUTCMonth()] + " " + d.getUTCDate() + ", " + d.getUTCFullYear()
}

function formatTimeAxisLabel(timestamp, rangeKey, prevTimestamp) {
  var t = Number(timestamp)
  if (!isFinite(t) || t <= 0) return ""
  var d = new Date(t * 1000)
  var prevD = (prevTimestamp && Number(prevTimestamp) > 0) ? new Date(Number(prevTimestamp) * 1000) : null
  var range = String(rangeKey || "1D")
  var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  var hours = d.getHours()
  var minutes = d.getMinutes()
  var ampm = hours >= 12 ? "PM" : "AM"
  var h12 = hours % 12 || 12
  var mStr = (minutes < 10 ? "0" : "") + minutes

  if (range === "60" || range === "30" || range === "15" || range === "5" || range === "1") {
    var isNewDay = !prevD || d.getDate() !== prevD.getDate() || d.getMonth() !== prevD.getMonth() || d.getFullYear() !== prevD.getFullYear()
    if (isNewDay) return months[d.getMonth()] + " " + d.getDate()
    return h12 + ":" + mStr + " " + ampm
  }
  if (range === "1Y") return String(d.getUTCFullYear())
  if (range === "1M") return months[d.getUTCMonth()] + " '" + String(d.getUTCFullYear()).slice(-2)
  return months[d.getUTCMonth()] + " " + d.getUTCDate()
}

function stratScenario(current, prev) {
  if (!current || !prev) return "-"
  var ch = Number(current.high)
  var cl = Number(current.low)
  var ph = Number(prev.high)
  var pl = Number(prev.low)
  if (!isFinite(ch) || !isFinite(cl) || !isFinite(ph) || !isFinite(pl)) return "-"

  var breaksHigh = ch > ph
  var breaksLow = cl < pl

  if (breaksHigh && breaksLow) return "3"
  if (breaksHigh) return "2u"
  if (breaksLow) return "2d"
  return "1"
}

// Live price for Strat evaluation. Accepts raw Yahoo meta fields (regularMarketPrice)
// as well as the normalized quote objects built by quoteFromChart (regularPrice / price),
// so the grid's 2s live quote is honored instead of the 15s-stale candle close.
function stratLivePrice(liveQuote) {
  if (!liveQuote) return null
  var keys = ["regularMarketPrice", "regularPrice", "price"]
  for (var i = 0; i < keys.length; i++) {
    var v = finiteOrNull(liveQuote[keys[i]])
    if (v !== null) return v
  }
  return null
}

function detectCandleShape(candle) {
  var empty = { isHammer: false, isShooter: false, shape: null, bodyRatio: 0, upperWickRatio: 0, lowerWickRatio: 0 }
  if (!candle) return empty
  var o = Number(candle.open)
  var h = Number(candle.high)
  var l = Number(candle.low)
  var c = Number(candle.close)
  if (!isFinite(o) || !isFinite(h) || !isFinite(l) || !isFinite(c)) return empty
  var range = h - l
  if (range <= 0) return empty
  var bodyTop = Math.max(o, c)
  var bodyBot = Math.min(o, c)
  var body = bodyTop - bodyBot
  var upperWick = h - bodyTop
  var lowerWick = bodyBot - l
  var bodyRatio = body / range
  var upperRatio = upperWick / range
  var lowerRatio = lowerWick / range
  // Canonical TheStrat 33% Range Rule (thestrat.ai/docs/hammer & shooter):
  // Hammer: body in top 33% of range (lower wick >= 66.7%), opposing upper wick <= 10%
  // Shooter: body in bottom 33% of range (upper wick >= 66.7%), opposing lower wick <= 10%
  var isHammer = (bodyBot >= (l + (range * (2 / 3)) - 1e-9)) && (upperRatio <= 0.10)
  var isShooter = (bodyTop <= (l + (range / 3) + 1e-9)) && (lowerRatio <= 0.10)
  var shape = isHammer ? "Hammer" : (isShooter ? "Shooter" : null)
  return {
    isHammer: isHammer,
    isShooter: isShooter,
    shape: shape,
    bodyRatio: bodyRatio,
    upperWickRatio: upperRatio,
    lowerWickRatio: lowerRatio
  }
}

function detectPivotMachineGun(candles, isLong) {
  var empty = { isPMG: false, count: 0, pivots: [], topTarget: null, triggerPrice: null }
  if (!isArrayLike(candles) || candles.length < 6) return empty
  var n = candles.length
  var p1 = candles[n - 2]
  if (!p1) return empty
  var firstPivot = isLong ? Number(p1.high) : Number(p1.low)
  if (!isFinite(firstPivot)) return empty

  var pivots = [firstPivot]
  var lastPivotVal = firstPivot
  var idx = n - 2

  while (idx >= 1) {
    var curBar = candles[idx]
    var prevBar = candles[idx - 1]
    if (!curBar || !prevBar) break

    var curVal = isLong ? Number(curBar.high) : Number(curBar.low)
    var prevVal = isLong ? Number(prevBar.high) : Number(prevBar.low)
    if (!isFinite(curVal) || !isFinite(prevVal)) break

    // Progression in trade direction (allows equal extremes <= / >=)
    if (isLong ? (prevVal >= lastPivotVal - 0.0001) : (prevVal <= lastPivotVal + 0.0001)) {
      if (Math.abs(prevVal - lastPivotVal) >= 0.005) {
        pivots.push(prevVal)
        lastPivotVal = prevVal
      }
      idx--
    } else {
      // Check if prevBar is an inside bar (Scenario 1) relative to its predecessor(s)
      var foundMother = false
      if (idx >= 2) {
        var mIdx = idx - 2
        while (mIdx >= 0) {
          var motherBar = candles[mIdx]
          var childBar = candles[mIdx + 1]
          if (!motherBar || !childBar) break
          if (stratScenario(childBar, motherBar) === "1") {
            var motherVal = isLong ? Number(motherBar.high) : Number(motherBar.low)
            if (isFinite(motherVal) && (isLong ? (motherVal >= lastPivotVal - 0.0001) : (motherVal <= lastPivotVal + 0.0001))) {
              if (Math.abs(prevVal - lastPivotVal) >= 0.005 && (isLong ? prevVal > lastPivotVal : prevVal < lastPivotVal)) {
                pivots.push(prevVal)
              }
              if (Math.abs(motherVal - lastPivotVal) >= 0.005) {
                pivots.push(motherVal)
                lastPivotVal = motherVal
              }
              idx = mIdx
              foundMother = true
              break
            }
          } else {
            break
          }
          mIdx--
        }
      }
      if (!foundMother) {
        if (stratScenario(curBar, prevBar) === "1") {
          if (isLong ? (prevVal >= lastPivotVal - 0.0001) : (prevVal <= lastPivotVal + 0.0001)) {
            if (Math.abs(prevVal - lastPivotVal) >= 0.005) {
              pivots.push(prevVal)
              lastPivotVal = prevVal
            }
            idx--
            continue
          }
        }
        break
      }
    }
  }

  if (pivots.length < 5) return empty
  return {
    isPMG: true,
    count: pivots.length,
    triggerPrice: firstPivot,
    pivots: pivots,
    topTarget: pivots[pivots.length - 1]
  }
}

function detectKickerPattern(candles, livePrice) {
  var empty = { isKicker: false, direction: null, gapType: null, triggerPrice: null, stopPrice: null, label: null }
  if (!isArrayLike(candles) || candles.length < 2) return empty
  var n = candles.length
  var p1 = candles[n - 2]
  var cur = candles[n - 1]
  if (!p1 || !cur) return empty
  var p1O = Number(p1.open), p1H = Number(p1.high), p1L = Number(p1.low), p1C = Number(p1.close)
  var curO = Number(cur.open), curH = Number(cur.high), curL = Number(cur.low), curC = Number(cur.close)
  var lp = finiteOrNull(livePrice)
  if (lp !== null) {
    curC = lp
    if (lp > curH) curH = lp
    if (lp < curL) curL = lp
  }
  if (!isFinite(p1O) || !isFinite(p1H) || !isFinite(p1L) || !isFinite(p1C)) return empty
  if (!isFinite(curO) || !isFinite(curH) || !isFinite(curL) || !isFinite(curC)) return empty
  var p1Range = p1H - p1L
  if (p1Range <= 0) return empty
  var p1BodyRatio = Math.abs(p1C - p1O) / p1Range
  if (p1BodyRatio < 0.50) return empty

  var p1BearishCloseNearLow = (p1C < p1O) && ((p1C - p1L) / p1Range <= 0.25)
  if (p1BearishCloseNearLow && curC >= curO && curH > p1H && curL > p1L) {
    var fullGapUp = curO > p1H
    var partialGapUp = !fullGapUp && (curO >= p1H - 0.25 * p1Range) && (curO >= p1O)
    if (fullGapUp || partialGapUp) {
      return {
        isKicker: true,
        direction: "LONG",
        gapType: fullGapUp ? "FULL" : "PARTIAL",
        triggerPrice: fullGapUp ? curO : p1H,
        stopPrice: curL,
        label: (fullGapUp ? "Full-Gap " : "Partial-Gap ") + "Bullish Kicker"
      }
    }
  }

  var p1BullishCloseNearHigh = (p1C > p1O) && ((p1H - p1C) / p1Range <= 0.25)
  if (p1BullishCloseNearHigh && curC <= curO && curL < p1L && curH < p1H) {
    var fullGapDown = curO < p1L
    var partialGapDown = !fullGapDown && (curO <= p1L + 0.25 * p1Range) && (curO <= p1O)
    if (fullGapDown || partialGapDown) {
      return {
        isKicker: true,
        direction: "SHORT",
        gapType: fullGapDown ? "FULL" : "PARTIAL",
        triggerPrice: fullGapDown ? curO : p1L,
        stopPrice: curH,
        label: (fullGapDown ? "Full-Gap " : "Partial-Gap ") + "Bearish Kicker"
      }
    }
  }

  return empty
}

var SETUP_LINE_TIMEFRAMES = ["1M", "1W", "1D", "60", "30"]

function isSetupLineTimeframe(tf) {
  var key = String(tf || "")
  for (var i = 0; i < SETUP_LINE_TIMEFRAMES.length; i++) {
    if (SETUP_LINE_TIMEFRAMES[i] === key) return true
  }
  return false
}

function setupTimeframeLabel(tf) {
  var key = String(tf || "")
  if (key === "30") return "30m"
  if (key === "60") return "60m"
  return key
}

// Colors for automatic GridWindow setup lines (both line stroke and right-edge text):
// - Target lines & target text (T1..TN): green across all timeframes
// - Trigger lines & trigger text: 1M yellow, 1W orange, 1D/60/30 white
function setupLineColor(tf, kind, isLightBg) {
  if (kind === "target") {
    return isLightBg ? "#15803D" : "#22C55E"
  }
  var key = String(tf || "")
  if (key === "1M") return isLightBg ? "#B45309" : "#FACC15"
  if (key === "1W") return isLightBg ? "#C2410C" : "#FB923C"
  return isLightBg ? "#111827" : "#FFFFFF"
}

// Canonical 7-category TheStrat setup detector (single source of truth for checklist & GridWindow setup lines):
// 1. Inside bar reversals:     2d-1-2u / 2u-1-2d, 3(red)-1-2u / 3(green)-1-2d
// 2. Inside bar continuations: 2u-1-2u / 2d-1-2d, 3(green)-1-2u / 3(red)-1-2d
// 3. 2-2 reversals:            2d-2u / 2u-2d, 3-2d-2u / 3-2u-2d
// 4. 1-bar rev-strat:          1-3 (green bullish / red bearish)
// 5. 3-2 reversals:            3(red)-2u / 3(green)-2d
// 6. 2-bar rev-strat:          1-2d-2u / 1-2u-2d, 1-3(hammer)-2u / 1-3(shooter)-2d
// 7. Other:                    PMG, Kicker
function detectStratSetupOnCandles(tf, candles, liveQuote, options) {
  if (!isArrayLike(candles) || candles.length < 2) return null
  var opts = (options && typeof options === "object") ? options : ({})
  var preferredDirection = opts.preferredDirection ? String(opts.preferredDirection).toUpperCase() : null
  var requireTriggered = opts.requireTriggered !== false

  var n = candles.length
  var curRaw = candles[n - 1]
  var p1 = candles[n - 2]
  var p2 = n >= 3 ? candles[n - 3] : null
  var p3 = n >= 4 ? candles[n - 4] : null
  if (!curRaw || !p1) return null

  var cur = {
    timestamp: curRaw.timestamp,
    open: Number(curRaw.open),
    high: Number(curRaw.high),
    low: Number(curRaw.low),
    close: Number(curRaw.close)
  }
  var livePx = stratLivePrice(liveQuote)
  if (livePx !== null && isFinite(livePx)) {
    cur.close = livePx
    if (!isFinite(cur.high) || livePx > cur.high) cur.high = livePx
    if (!isFinite(cur.low) || livePx < cur.low) cur.low = livePx
  }
  if (!isFinite(cur.open) || !isFinite(cur.high) || !isFinite(cur.low) || !isFinite(cur.close)) return null

  var p1Open = Number(p1.open), p1High = Number(p1.high), p1Low = Number(p1.low), p1Close = Number(p1.close)
  if (!isFinite(p1Open) || !isFinite(p1High) || !isFinite(p1Low) || !isFinite(p1Close)) return null

  var tfKey = String(tf || "60")
  var tfLbl = setupTimeframeLabel(tfKey)
  var sc_cur = stratScenario(cur, p1)
  var sc_p1 = p2 ? stratScenario(p1, p2) : "-"
  var sc_p2 = (p2 && p3) ? stratScenario(p2, p3) : "-"

  var p1Green = p1Close >= p1Open
  var p1Red = p1Close < p1Open
  var p2Green = p2 ? (Number(p2.close) >= Number(p2.open)) : false
  var p2Red = p2 ? (Number(p2.close) < Number(p2.open)) : false
  var curGreen = cur.close >= cur.open

  var brokeHigh = cur.high > p1High
  var brokeLow = cur.low < p1Low
  var p1Shape = detectCandleShape(p1)
  var kickerInfo = detectKickerPattern(candles, livePx)

  function buildForDirection(dirIsLong) {
    var dir = dirIsLong ? "LONG" : "SHORT"
    var pmgInfo = detectPivotMachineGun(candles, dirIsLong)
    var hasKicker = Boolean(kickerInfo.isKicker && kickerInfo.direction === dir)
    var trigBroke = dirIsLong ? brokeHigh : brokeLow
    var category = null
    var code = null
    var name = null
    var triggerPrice = dirIsLong ? p1High : p1Low
    var anchorTs = p1.timestamp
    var ohlcField = dirIsLong ? "high" : "low"
    var invalidReason = null
    var triggered = trigBroke

    // 7A. Full-Gap Kicker promotes directly
    if (hasKicker && kickerInfo.gapType === "FULL") {
      category = "other"
      code = dirIsLong ? "Kicker Up" : "Kicker Dn"
      name = tfLbl + " Kicker " + (dirIsLong ? "Up" : "Down")
      triggerPrice = kickerInfo.triggerPrice
      anchorTs = cur.timestamp
      ohlcField = "open"
      triggered = true
    } else if (sc_p1 === "1") {
      if (sc_cur === "3") {
        // 4. 1-bar rev-strat (1-3)
        if (!preferredDirection && (dirIsLong !== curGreen)) {
          return null
        }
        category = "1-bar_revstrat"
        code = dirIsLong ? "1-3u" : "1-3d"
        name = tfLbl + " 1-3 RevStrat " + (dirIsLong ? "Up" : "Down")
      } else if (sc_p2 === "2d") {
        if (dirIsLong) {
          category = "inside_reversal"
          code = "2d-1-2u"
          name = tfLbl + " 2-1-2 Up"
        } else {
          category = "inside_continuation"
          code = "2d-1-2d"
          name = tfLbl + " 2-1-2 Down"
        }
      } else if (sc_p2 === "2u") {
        if (!dirIsLong) {
          category = "inside_reversal"
          code = "2u-1-2d"
          name = tfLbl + " 2-1-2 Down"
        } else {
          category = "inside_continuation"
          code = "2u-1-2u"
          name = tfLbl + " 2-1-2 Up"
        }
      } else if (sc_p2 === "3") {
        // Differentiate 3-1-2 reversal vs continuation by bar 3 color vs bar 2 direction color
        if (dirIsLong) {
          category = p2Red ? "inside_reversal" : "inside_continuation"
          code = "3-1-2u"
          name = tfLbl + (p2Red ? " 3-1-2 Reversal Up" : " 3-1-2 Continuation Up")
        } else {
          category = p2Green ? "inside_reversal" : "inside_continuation"
          code = "3-1-2d"
          name = tfLbl + (p2Green ? " 3-1-2 Reversal Down" : " 3-1-2 Continuation Down")
        }
      } else if (sc_p2 === "-" && p2 && !p3) {
        // Minimal 3-bar series (no p3 to classify p2): treat p2 as directional motherbar by color
        if (dirIsLong) {
          category = p2Red ? "inside_reversal" : "inside_continuation"
          code = p2Red ? "2d-1-2u" : "2u-1-2u"
          name = tfLbl + " 2-1-2 Up"
        } else {
          category = p2Green ? "inside_reversal" : "inside_continuation"
          code = p2Green ? "2u-1-2d" : "2d-1-2d"
          name = tfLbl + " 2-1-2 Down"
        }
      }
      // Note: sc_p2 === "1" (1-1-2 / generic 1-2 break) is intentionally excluded
    } else if ((sc_p1 === "2d" && dirIsLong) || (sc_p1 === "2u" && !dirIsLong)) {
      if (sc_p2 === "1") {
        // 6A. 2-bar rev-strat: 1-2d-2u / 1-2u-2d
        category = "2-bar_revstrat"
        code = dirIsLong ? "1-2d-2u" : "1-2u-2d"
        name = tfLbl + " 1-2-2 RevStrat " + (dirIsLong ? "Up" : "Down")
      } else if (sc_p2 === "3") {
        // 3B. 2-2 reversal: 3-2d-2u / 3-2u-2d
        category = "2-2_reversal"
        code = dirIsLong ? "3-2d-2u" : "3-2u-2d"
        name = tfLbl + " 3-2-2 Reversal " + (dirIsLong ? "Up" : "Down")
      } else {
        // 3A. 2-2 reversal: 2d-2u / 2u-2d
        category = "2-2_reversal"
        code = dirIsLong ? "2d-2u" : "2u-2d"
        name = tfLbl + " 2-2 Reversal " + (dirIsLong ? "Up" : "Down")
      }
    } else if (sc_p1 === "3") {
      if (sc_p2 === "1") {
        // 6B. 2-bar rev-strat: 1-3(hammer)-2u / 1-3(shooter)-2d (hammer/shooter strictly required)
        var isRevHammer = dirIsLong && p1Shape.isHammer
        var isRevShooter = !dirIsLong && p1Shape.isShooter
        if (isRevHammer || isRevShooter) {
          category = "2-bar_revstrat"
          code = dirIsLong ? "1-3(H)-2u" : "1-3(S)-2d"
          name = tfLbl + " 1-3-2 RevStrat " + (dirIsLong ? "Up" : "Down")
        } else {
          invalidReason = "Scenario 3 bar failed to close as " + (dirIsLong ? "Hammer" : "Shooter") + " (rejection required for 1-3-2 RevStrat)"
        }
      } else {
        // 5. 3-2 reversal: opposite color required (3 red -> 2u green; 3 green -> 2d red)
        if ((dirIsLong && p1Red) || (!dirIsLong && p1Green)) {
          category = "3-2_reversal"
          code = dirIsLong ? "3-2u" : "3-2d"
          name = tfLbl + " 3-2 Reversal " + (dirIsLong ? "Up" : "Down")
        }
      }
    }

    // 7B. Other fallback: Partial-Gap Kicker or PMG when no primary setup matched
    if (!category && !invalidReason) {
      if (hasKicker) {
        category = "other"
        code = dirIsLong ? "Kicker Up" : "Kicker Dn"
        name = tfLbl + " Kicker " + (dirIsLong ? "Up" : "Down")
        triggerPrice = kickerInfo.triggerPrice
        triggered = trigBroke
      } else if (pmgInfo.isPMG) {
        var pmgTrig = pmgInfo.triggerPrice !== null ? pmgInfo.triggerPrice : (dirIsLong ? p1High : p1Low)
        var pmgHit = dirIsLong ? (cur.high > pmgTrig || cur.close >= pmgTrig) : (cur.low < pmgTrig || cur.close <= pmgTrig)
        if (pmgHit || !requireTriggered) {
          category = "other"
          code = dirIsLong ? "PMG Up" : "PMG Dn"
          name = tfLbl + " PMG Reversal " + (dirIsLong ? "Up" : "Down")
          triggerPrice = pmgTrig
          triggered = pmgHit
        }
      }
    }

    if (!category && !invalidReason) return null
    if (requireTriggered && (!category || !triggered)) return null

    return {
      timeframe: tfKey,
      timeframeLabel: tfLbl,
      category: category,
      code: code,
      name: name,
      direction: dir,
      isLong: dirIsLong,
      valid: Boolean(category),
      invalidReason: invalidReason,
      isTriggered: Boolean(category && triggered),
      triggerPrice: isFinite(triggerPrice) ? triggerPrice : null,
      anchorTs: anchorTs,
      ohlcField: ohlcField,
      closePrice: cur.close,
      barHigh: cur.high,
      barLow: cur.low,
      signalCandle: p1,
      signalTimestamp: p1.timestamp,
      activeTimestamp: cur.timestamp,
      sc_p1: sc_p1,
      sc_p2: sc_p2,
      sc_cur: sc_cur,
      signalShape: p1Shape,
      pmg: pmgInfo,
      kicker: hasKicker ? kickerInfo : { isKicker: false, direction: null, gapType: null, triggerPrice: null, stopPrice: null, label: null }
    }
  }

  if (preferredDirection === "LONG" || preferredDirection === "SHORT") {
    return buildForDirection(preferredDirection === "LONG")
  }

  // Auto-detect direction from actual trigger break on active bar
  if (kickerInfo.isKicker && kickerInfo.gapType === "FULL") {
    var kRes = buildForDirection(kickerInfo.direction === "LONG")
    if (kRes && kRes.isTriggered) return kRes
  }

  if (sc_cur === "1") return null

  if (sc_cur === "3" && sc_p1 === "1") {
    return buildForDirection(curGreen)
  }

  if (brokeHigh && !brokeLow) {
    return buildForDirection(true)
  }
  if (brokeLow && !brokeHigh) {
    return buildForDirection(false)
  }

  // Both sides broken on a non-1 prior bar: check current-color side first, then alternate
  var order = curGreen ? [true, false] : [false, true]
  for (var oi = 0; oi < order.length; oi++) {
    var cand = buildForDirection(order[oi])
    if (cand && cand.isTriggered) return cand
  }
  return null
}

// Compute ordered structural targets T1..TN on timeframe tf for a triggered setup.
// Uses immediate pattern magnitude first, PMG stacked pivots if present, then progressive
// untagged prior swing extremes walking backward on tf.
function resolveTimeframeSetupTargets(tf, candles, setup, maxTargets) {
  if (!setup || !setup.valid || !isFinite(setup.triggerPrice) || !isArrayLike(candles) || candles.length < 3) {
    return []
  }
  var n = candles.length
  var isLong = setup.isLong
  var trig = Number(setup.triggerPrice)
  var ohlcField = isLong ? "high" : "low"
  var limit = (typeof maxTargets === "number" && isFinite(maxTargets) && maxTargets > 0) ? maxTargets : 10

  var p2 = n >= 3 ? candles[n - 3] : null
  var p3 = n >= 4 ? candles[n - 4] : null

  var raw = []
  function pushTarget(price, anchorTs) {
    var val = Number(price)
    if (!isFinite(val)) return
    if (isLong ? (val <= trig + 1e-6) : (val >= trig - 1e-6)) return
    raw.push({
      price: val,
      anchorTs: anchorTs != null ? anchorTs : (p2 ? p2.timestamp : setup.anchorTs),
      ohlcField: ohlcField
    })
  }

  // 1. Immediate pattern magnitude targets
  var scanStartIdx = n - 3
  var runningBound = trig

  if (setup.code === "1-2d-2u" || setup.code === "1-2u-2d") {
    if (p2) {
      var p2Val = isLong ? Number(p2.high) : Number(p2.low)
      pushTarget(p2Val, p2.timestamp)
      if (isFinite(p2Val) && (isLong ? p2Val > runningBound : p2Val < runningBound)) runningBound = p2Val
    }
    if (p3) {
      var p3Val = isLong ? Number(p3.high) : Number(p3.low)
      pushTarget(p3Val, p3.timestamp)
      if (isFinite(p3Val) && (isLong ? p3Val > runningBound : p3Val < runningBound)) runningBound = p3Val
    }
    scanStartIdx = n - 5
  } else if (setup.code === "1-3(H)-2u" || setup.code === "1-3(S)-2d") {
    if (p3) {
      var p3RevVal = isLong ? Number(p3.high) : Number(p3.low)
      pushTarget(p3RevVal, p3.timestamp)
      if (isFinite(p3RevVal) && (isLong ? p3RevVal > runningBound : p3RevVal < runningBound)) runningBound = p3RevVal
    }
    scanStartIdx = n - 5
  } else if (
    setup.category === "inside_reversal" ||
    setup.category === "inside_continuation" ||
    setup.category === "2-2_reversal" ||
    setup.category === "1-bar_revstrat"
  ) {
    if (p2) {
      var patVal = isLong ? Number(p2.high) : Number(p2.low)
      pushTarget(patVal, p2.timestamp)
      if (isFinite(patVal) && (isLong ? patVal > runningBound : patVal < runningBound)) runningBound = patVal
    }
    scanStartIdx = n - 4
  }

  // 2. PMG stacked pivots (if present)
  if (setup.pmg && setup.pmg.isPMG && Array.isArray(setup.pmg.pivots)) {
    for (var pi = 1; pi < setup.pmg.pivots.length; pi++) {
      var pmgVal = Number(setup.pmg.pivots[pi])
      var pmgTs = p2 ? p2.timestamp : setup.anchorTs
      for (var bk = n - 3; bk >= Math.max(0, n - 40); bk--) {
        var bVal = isLong ? Number(candles[bk].high) : Number(candles[bk].low)
        if (isFinite(bVal) && Math.abs(bVal - pmgVal) < 0.005) {
          pmgTs = candles[bk].timestamp
          break
        }
      }
      pushTarget(pmgVal, pmgTs)
    }
  }

  // 3. Progressive untagged prior swing extremes on this timeframe
  var minScanIdx = Math.max(0, n - 120)
  for (var k = scanStartIdx; k >= minScanIdx; k--) {
    var c = candles[k]
    if (!c) continue
    var val = isLong ? Number(c.high) : Number(c.low)
    if (!isFinite(val)) continue
    if (isLong ? (val > runningBound + 1e-6) : (val < runningBound - 1e-6)) {
      runningBound = val
      var hasLeft = k > 0 && candles[k - 1]
      var leftVal = hasLeft ? (isLong ? Number(candles[k - 1].high) : Number(candles[k - 1].low)) : null
      var isSwing = !hasLeft || !isFinite(leftVal) || (isLong ? val >= leftVal : val <= leftVal)
      if (isSwing) {
        pushTarget(val, c.timestamp)
      }
    }
  }

  // Sort strictly away from trigger and deduplicate within $0.01
  raw.sort(function (a, b) {
    return isLong ? (a.price - b.price) : (b.price - a.price)
  })

  var deduped = []
  for (var di = 0; di < raw.length && deduped.length < limit; di++) {
    var item = raw[di]
    if (deduped.length > 0 && Math.abs(deduped[deduped.length - 1].price - item.price) < 0.01) {
      continue
    }
    var idxNum = deduped.length + 1
    deduped.push({
      index: idxNum,
      label: "T" + idxNum,
      price: item.price,
      anchorTs: item.anchorTs,
      ohlcField: item.ohlcField
    })
  }
  return deduped
}

// Compute automatic Trigger & Ratcheting [T1, T2] Target lines for a GridWindow cell on targetCellTf.
// - Only active on 30, 60, 1D, 1W, 1M (returns [] for 1Y, 15, 5, 1, etc.)
// - Cascades higher timeframes down (1M -> 1M/1W/1D/60/30, 1W -> 1W/1D/60/30, etc.)
// - Draws ONLY once triggered; stays on for the full life of the active bar
// - Max 2 target lines per timeframe (T1 and optional T2):
//   * Once the bar's extreme hits L2 (or deeper Lk), Lk promotes to T1 and earlier hit targets drop off.
//   * T1 stays drawn for the rest of the bar; T2 is shown only while live/close price is past T1.
function computeTriggeredSetupLines(candlesByTf, liveQuote, targetCellTf) {
  var tgtKey = String(targetCellTf || "")
  if (!isSetupLineTimeframe(tgtKey)) return []
  if (!candlesByTf || typeof candlesByTf !== "object") return []

  var tgtRank = timeframeRank(tgtKey)
  var lines = []

  for (var i = 0; i < SETUP_LINE_TIMEFRAMES.length; i++) {
    var tf = SETUP_LINE_TIMEFRAMES[i]
    if (timeframeRank(tf) < tgtRank) continue

    var tfCandles = candlesByTf[tf]
    if (!isArrayLike(tfCandles) || tfCandles.length < 2) continue

    var setup = detectStratSetupOnCandles(tf, tfCandles, liveQuote, { requireTriggered: true })
    if (!setup || !setup.isTriggered || !isFinite(setup.triggerPrice)) continue

    var tfLbl = setupTimeframeLabel(tf)
    lines.push({
      id: tf + ":trigger",
      timeframe: tf,
      sourceTf: tf,
      kind: "trigger",
      targetIndex: 0,
      direction: setup.direction,
      setupCode: setup.code,
      price: setup.triggerPrice,
      anchorTs: setup.anchorTs,
      ohlcField: setup.ohlcField,
      label: tfLbl + " " + setup.code + " TRIG"
    })

    var allTargets = resolveTimeframeSetupTargets(tf, tfCandles, setup)
    if (allTargets.length === 0) continue

    var closePx = isFinite(setup.closePrice) ? setup.closePrice : setup.triggerPrice
    var barExtreme = setup.isLong
      ? (isFinite(setup.barHigh) ? setup.barHigh : closePx)
      : (isFinite(setup.barLow) ? setup.barLow : closePx)

    var baseIdx = 0
    for (var hi = 1; hi < allTargets.length; hi++) {
      var hitTarget = setup.isLong
        ? (barExtreme >= allTargets[hi].price)
        : (barExtreme <= allTargets[hi].price)
      if (hitTarget) {
        baseIdx = hi
      } else {
        break
      }
    }

    var t1Obj = allTargets[baseIdx]
    lines.push({
      id: tf + ":target:1",
      timeframe: tf,
      sourceTf: tf,
      kind: "target",
      targetIndex: 1,
      direction: setup.direction,
      setupCode: setup.code,
      price: t1Obj.price,
      anchorTs: t1Obj.anchorTs,
      ohlcField: t1Obj.ohlcField,
      label: tfLbl + " T1"
    })

    if (baseIdx + 1 < allTargets.length) {
      var pastT1 = setup.isLong ? (closePx >= t1Obj.price) : (closePx <= t1Obj.price)
      if (pastT1) {
        var t2Obj = allTargets[baseIdx + 1]
        lines.push({
          id: tf + ":target:2",
          timeframe: tf,
          sourceTf: tf,
          kind: "target",
          targetIndex: 2,
          direction: setup.direction,
          setupCode: setup.code,
          price: t2Obj.price,
          anchorTs: t2Obj.anchorTs,
          ohlcField: t2Obj.ohlcField,
          label: tfLbl + " T2"
        })
      }
    }
  }

  return lines
}

function stratInForce(sc) {
  if (sc === "2u" || sc === "2d") return "In-Force"
  if (sc === "1") return "Inside Bar"
  if (sc === "3") return "Outside Bar"
  return "-"
}

function computeStratDetails(candles, liveQuote) {
  if (!candles || candles.length < 2) {
    return {
      bar: "-",
      polarity: "neutral",
      inForce: "-",
      sequence: "-",
      triggerHigh: null,
      triggerLow: null,
      open: null,
      high: null,
      low: null,
      close: null
    }
  }
  var n = candles.length
  var current = candles[n - 1]
  var prev = candles[n - 2]
  var prev2 = n >= 3 ? candles[n - 3] : null
  var prev3 = n >= 4 ? candles[n - 4] : null

  var curOpen = Number(current.open)
  var curHigh = Number(current.high)
  var curLow = Number(current.low)
  var curClose = Number(current.close)
  if (liveQuote && isFinite(Number(liveQuote.price))) {
    curClose = Number(liveQuote.price)
    if (curClose > curHigh) curHigh = curClose
    if (curClose < curLow) curLow = curClose
    if (isFinite(Number(liveQuote.dayHigh)) && Number(liveQuote.dayHigh) > curHigh) curHigh = Number(liveQuote.dayHigh)
    if (isFinite(Number(liveQuote.dayLow)) && Number(liveQuote.dayLow) < curLow) curLow = Number(liveQuote.dayLow)
  }

  var sc = stratScenario({ high: curHigh, low: curLow }, prev)
  var bar = (sc && sc !== "-") ? sc.toUpperCase() : "-"

  var trigHigh = Number(prev.high)
  var trigLow = Number(prev.low)

  var polarity = "neutral"
  if (isFinite(curClose) && isFinite(curOpen)) {
    polarity = curClose >= curOpen ? "green" : "red"
  }

  var inForce = stratInForce(sc)

  var seqParts = []
  if (prev3 && prev2) {
    var b1 = stratScenario(prev2, prev3)
    if (b1 !== "-") seqParts.push(b1.toUpperCase())
  }
  if (prev2 && prev) {
    var b2 = stratScenario(prev, prev2)
    if (b2 !== "-") seqParts.push(b2.toUpperCase())
  }
  if (sc !== "-") {
    seqParts.push(sc.toUpperCase())
  }
  var sequence = seqParts.length > 0 ? seqParts.join("-") : "-"

  return {
    bar: bar,
    polarity: polarity,
    inForce: inForce,
    sequence: sequence,
    triggerHigh: isFinite(trigHigh) ? trigHigh : null,
    triggerLow: isFinite(trigLow) ? trigLow : null,
    open: isFinite(curOpen) ? curOpen : null,
    high: isFinite(curHigh) ? curHigh : null,
    low: isFinite(curLow) ? curLow : null,
    close: isFinite(curClose) ? curClose : null
  }
}

function buildDetailStats(quote, page, insights) {
  quote = quote || {}
  page = page || {}
  insights = insights || {}
  var rows = []
  function add(label, value) {
    if (value === undefined || value === null || value === "") return
    if (value === "-") return
    rows.push({ label: label, value: String(value) })
  }

  add("MARKET CAP", page.marketCap ? formatCompact(page.marketCap) : "")
  add("P/E", formatRatio(page.trailingPE) !== "-" ? formatRatio(page.trailingPE) : "")
  add("FWD P/E", formatRatio(page.forwardPE) !== "-" ? formatRatio(page.forwardPE) : "")
  add("EPS", page.trailingEps != null && isFinite(Number(page.trailingEps)) ? Number(page.trailingEps).toFixed(2) : "")
  add("DIV YIELD", yieldPercent(page.dividendYield) !== "-" ? yieldPercent(page.dividendYield) : "")
  add("DIV RATE", page.dividendRate ? formatPrice(page.dividendRate, quote.currency || "USD", 2) : "")
  add("EX-DIVIDEND", page.exDividendDate ? formatIsoDate(page.exDividendDate) : "")
  var nextDiv = nextDividendIso(page.exDividendDate)
  if (nextDiv.iso && nextDiv.estimated) add("EST. NEXT DIV", formatIsoDate(nextDiv.iso))
  else if (nextDiv.iso && page.exDividendDate && nextDiv.iso !== page.exDividendDate)
    add("NEXT DIVIDEND", formatIsoDate(nextDiv.iso))
  add("DIV PAY DATE", page.dividendDate ? formatIsoDate(page.dividendDate) : "")
  add("NEXT EARNINGS", page.earningsDate ? ((page.earningsEstimated ? "Est. " : "") + formatIsoDate(page.earningsDate)) : "")
  add("52W HIGH", quote.fiftyTwoWeekHigh ? formatPrice(quote.fiftyTwoWeekHigh, quote.currency, quote.priceHint) : "")
  add("52W LOW", quote.fiftyTwoWeekLow ? formatPrice(quote.fiftyTwoWeekLow, quote.currency, quote.priceHint) : "")
  add("AVG VOLUME", page.averageVolume ? formatCompact(page.averageVolume) : "")
  add("BETA", formatRatio(page.beta) !== "-" ? formatRatio(page.beta) : "")
  var target = insights.targetPrice || page.targetMeanPrice
  add("TARGET", target ? formatPrice(target, quote.currency || "USD", 2) : "")
  add("RATING", insights.rating ? String(insights.rating).toUpperCase() : "")
  add("VALUATION", insights.valuation || "")
  add("SUPPORT", insights.support ? formatPrice(insights.support, quote.currency, quote.priceHint) : "")
  add("RESISTANCE", insights.resistance ? formatPrice(insights.resistance, quote.currency, quote.priceHint) : "")
  add("SECTOR", page.sector || insights.sector || "")
  add("INDUSTRY", page.industry || "")
  add("SUPPLY", page.circulatingSupply ? formatCompact(page.circulatingSupply) : "")
  add("24H VOL", page.volume24Hr ? formatCompact(page.volume24Hr) : "")
  return rows
}

function parseInterval(query) {
  if (!query || typeof query !== "string") return null
  var q = query.trim().toUpperCase().replace(/^[^0-9A-Z]+/, "").replace(/[^0-9A-Z]+$/, "")
  if (!q) return null

  if (
    q === "1MIN" ||
    q === "1MINS"
  ) {
    return "1"
  }

  if (
    q === "5" ||
    q === "5M" ||
    q === "5MIN" ||
    q === "5MINS"
  ) {
    return "5"
  }

  if (
    q === "15" ||
    q === "15M" ||
    q === "15MIN" ||
    q === "15MINS"
  ) {
    return "15"
  }

  if (
    q === "30" ||
    q === "30M" ||
    q === "30MIN" ||
    q === "30MINS"
  ) {
    return "30"
  }

  if (
    q === "60" ||
    q === "60M" ||
    q === "60MIN" ||
    q === "60MINS" ||
    q === "1H" ||
    q === "1HR" ||
    q === "1HOUR" ||
    q === "H" ||
    q === "HR" ||
    q === "HOUR"
  ) {
    return "60"
  }

  if (
    q === "1D" ||
    q === "1DAY" ||
    q === "D" ||
    q === "DAY" ||
    q === "DAILY" ||
    q === "1"
  ) {
    return "1D"
  }

  if (
    q === "1W" ||
    q === "1WK" ||
    q === "1WEEK" ||
    q === "W" ||
    q === "WK" ||
    q === "WEEK" ||
    q === "WEEKLY"
  ) {
    return "1W"
  }

  if (
    q === "1M" ||
    q === "1MO" ||
    q === "1MON" ||
    q === "1MONTH" ||
    q === "M" ||
    q === "MO" ||
    q === "MON" ||
    q === "MONTH" ||
    q === "MONTHLY"
  ) {
    return "1M"
  }

  if (
    q === "1Y" ||
    q === "1YR" ||
    q === "1YEAR" ||
    q === "Y" ||
    q === "YR" ||
    q === "YEAR" ||
    q === "YEARLY"
  ) {
    return "1Y"
  }

  return null
}


var SPDR_SECTOR_MAP = {
  "XLC": { seriesId: "S000062095", cik: "0001064641", accessionNumber: "0001410368-26-089424", name: "Communication Services" },
  "XLY": { seriesId: "S000006408", cik: "0001064641", accessionNumber: "0001410368-26-089594", name: "Consumer Discretionary" },
  "XLP": { seriesId: "S000006409", cik: "0001064641", accessionNumber: "0001410368-26-089214", name: "Consumer Staples" },
  "XLE": { seriesId: "S000006410", cik: "0001064641", accessionNumber: "0001410368-26-089509", name: "Energy" },
  "XLF": { seriesId: "S000006411", cik: "0001064641", accessionNumber: "0001410368-26-089671", name: "Financials" },
  "XLV": { seriesId: "S000006412", cik: "0001064641", accessionNumber: "0001410368-26-089348", name: "Health Care" },
  "XLI": { seriesId: "S000006413", cik: "0001064641", accessionNumber: "0001410368-26-089138", name: "Industrials" },
  "XLB": { seriesId: "S000006414", cik: "0001064641", accessionNumber: "0001410368-26-089261", name: "Materials" },
  "XLK": { seriesId: "S000006415", cik: "0001064641", accessionNumber: "0001410368-26-089672", name: "Technology" },
  "XLU": { seriesId: "S000006416", cik: "0001064641", accessionNumber: "0001410368-26-089590", name: "Utilities" },
  "XLRE": { seriesId: "S000051152", cik: "0001064641", accessionNumber: "0001410368-26-089191", name: "Real Estate" }
}

var SPDR_CUSIP_MAP = {
  "00206R102": "T",
  "02079K107": "GOOG",
  "02079K305": "GOOGL",
  "20030N101": "CMCSA",
  "278768106": "ECHO",
  "30303M102": "META",
  "35137L105": "FOXA",
  "35137L204": "FOX",
  "538034109": "LYV",
  "64110L106": "NFLX",
  "65249B109": "NWSA",
  "65249B208": "NWS",
  "681919106": "OMC",
  "69932A204": "PSKY",
  "87256C101": "TKO",
  "872590104": "TMUS",
  "92343V104": "VZ",
  "934423104": "WBD",
  "009066101": "ABNB",
  "053332102": "AZO",
  "086516101": "BBY",
  "09857L108": "BKNG",
  "146869102": "CVNA",
  "169656105": "CMG",
  "237194105": "DRI",
  "243537107": "DECK",
  "25754A201": "DPZ",
  "25809K105": "DASH",
  "278642103": "EBAY",
  "30212P303": "EXPE",
  "345370860": "F",
  "37045V100": "GM",
  "372460105": "GPC",
  "418056107": "HAS",
  "43300A203": "HLT",
  "517834107": "LVS",
  "526057104": "LEN",
  "550021109": "LULU",
  "552953101": "MGM",
  "580135101": "MCD",
  "62944T105": "NVR",
  "654106103": "NKE",
  "751212101": "RL",
  "778296103": "ROST",
  "855244109": "SBUX",
  "876030107": "TPR",
  "88160R101": "TSLA",
  "90384S303": "ULTA",
  "983134107": "WYNN",
  "988498101": "YUM",
  "02209S103": "MO",
  "039483102": "ADM",
  "147528103": "CASY",
  "21036P108": "STZ",
  "22160K105": "COST",
  "256677105": "DG",
  "256746108": "DLTR",
  "370334104": "GIS",
  "49177J102": "KVUE",
  "49271V100": "KDP",
  "60871R209": "TAP",
  "609207105": "MDLZ",
  "61174X109": "MNST",
  "713448108": "PEP",
  "718172109": "PM",
  "871829107": "SYY",
  "87612E106": "TGT",
  "902494103": "TSN",
  "931142103": "WMT",
  "03743Q108": "APA",
  "05722G100": "BKR",
  "165167735": "EXE",
  "166764100": "CVX",
  "20825C104": "COP",
  "25278X109": "FANG",
  "26875P101": "EOG",
  "26884L109": "EQT",
  "406216101": "HAL",
  "49456B101": "KMI",
  "56585A102": "MPC",
  "682680103": "OKE",
  "718546104": "PSX",
  "87612G101": "TRGP",
  "88262P102": "TPL",
  "001055102": "AFL",
  "025816109": "AXP",
  "026874784": "AIG",
  "03076C106": "AMP",
  "03769M106": "APO",
  "03990B101": "ARES",
  "04621X108": "AIZ",
  "084670702": "BRK-B",
  "09260D107": "BX",
  "09290D101": "BLK",
  "115236101": "BRO",
  "12503M108": "CBOE",
  "12572Q105": "CME",
  "14040H105": "COF",
  "172062101": "CINF",
  "172967424": "C",
  "19260Q107": "COIN",
  "219948106": "CPAY",
  "29530P102": "ERIE",
  "303075105": "FDS",
  "31620M106": "FIS",
  "316773100": "FITB",
  "337738108": "FISV",
  "363576109": "AJG",
  "37940X102": "GPN",
  "37959E102": "GL",
  "426281101": "JKHY",
  "45841N107": "IBKR",
  "45866F104": "ICE",
  "46625H100": "JPM",
  "48251W104": "KKR",
  "493267108": "KEY",
  "540424108": "L",
  "55261F104": "MTB",
  "55354G100": "MSCI",
  "57636Q104": "MA",
  "59156R108": "MET",
  "617446448": "MS",
  "631103108": "NDAQ",
  "665859104": "NTRS",
  "70450Y103": "PYPL",
  "74251V102": "PFG",
  "744320102": "PRU",
  "754730109": "RJF",
  "7591EP100": "RF",
  "770700102": "HOOD",
  "78409V104": "SPGI",
  "852234103": "XYZ",
  "857477103": "STT",
  "87165B103": "SYF",
  "89832Q109": "TFC",
  "92826C839": "V",
  "002824100": "ABT",
  "00287Y109": "ABBV",
  "00846U101": "A",
  "016255101": "ALGN",
  "03073E105": "COR",
  "031162100": "AMGN",
  "036752103": "ELV",
  "071813109": "BAX",
  "075887109": "BDX",
  "09062X103": "BIIB",
  "09073M104": "TECH",
  "101137107": "BSX",
  "126650100": "CVS",
  "14149Y108": "CAH",
  "15135B101": "CNC",
  "159864107": "CRL",
  "23918K108": "DVA",
  "252131107": "DXCM",
  "28176E108": "EW",
  "36266G107": "GEHC",
  "375558103": "GILD",
  "40412C101": "HCA",
  "444859102": "HUM",
  "45337C102": "INCY",
  "45784P101": "PODD",
  "46120E602": "ISRG",
  "46266C105": "IQV",
  "478160104": "JNJ",
  "504922105": "LH",
  "532457108": "LLY",
  "58155Q103": "MCK",
  "58933Y105": "MRK",
  "60770K107": "MRNA",
  "714046109": "RVTY",
  "717081103": "PFE",
  "74834L100": "DGX",
  "75886F107": "REGN",
  "761152107": "RMD",
  "806407102": "HSIC",
  "83444M101": "SOLV",
  "863667101": "SYK",
  "883556102": "TMO",
  "91324P102": "UNH",
  "913903100": "UHS",
  "922475108": "VEEV",
  "92556V106": "VTRS",
  "955306105": "WST",
  "98956P102": "ZBH",
  "98978V103": "ZTS",
  "031100100": "AME",
  "053015103": "ADP",
  "05464C101": "AXON",
  "11133T103": "BR",
  "12008R107": "BLDR",
  "126408103": "CSX",
  "14448C104": "CARR",
  "149123101": "CAT",
  "172908105": "CTAS",
  "199908104": "FIX",
  "217204106": "CPRT",
  "231021106": "CMI",
  "244199105": "DE",
  "247361702": "DAL",
  "260003108": "DOV",
  "29084Q100": "EME",
  "291011104": "EMR",
  "294429105": "EFX",
  "302130109": "EXPD",
  "311900104": "FAST",
  "31428X106": "FDX",
  "314352105": "FDXF",
  "34959J108": "FTV",
  "36828A101": "GEV",
  "368736104": "GNRC",
  "369550108": "GD",
  "369604301": "GE",
  "384802104": "GWW",
  "43849R105": "HONA",
  "438516205": "HON",
  "443201108": "HWM",
  "443510607": "HUBB",
  "446413106": "HII",
  "452308109": "ITW",
  "45687V106": "IR",
  "46982L108": "J",
  "525327102": "LDOS",
  "526107107": "LII",
  "539830109": "LMT",
  "655663102": "NDSN",
  "655844108": "NSC",
  "679580100": "ODFL",
  "68902V107": "OTIS",
  "693718108": "PCAR",
  "701094104": "PH",
  "704326107": "PAYX",
  "74762E102": "PWR",
  "75513E101": "RTX",
  "760759100": "RSG",
  "773903109": "ROK",
  "775711104": "ROL",
  "833034101": "SNA",
  "844741108": "LUV",
  "854502101": "SWK",
  "883203101": "TXT",
  "88579Y101": "MMM",
  "893641100": "TDG",
  "90353T100": "UBER",
  "907818108": "UNP",
  "910047109": "UAL",
  "911312106": "UPS",
  "911363109": "URI",
  "92338C103": "VLTO",
  "92345Y106": "VRSK",
  "92537N108": "VRT",
  "929740108": "WAB",
  "94106L109": "WM",
  "012653101": "ALB",
  "053611109": "AVY",
  "058498106": "BALL",
  "125269100": "CF",
  "22052L104": "CTVA",
  "260557103": "DOW",
  "26614N201": "DD",
  "278865100": "ECL",
  "35671D857": "FCX",
  "459506101": "IFF",
  "460146103": "IP",
  "573284106": "MLM",
  "670346105": "NUE",
  "693506107": "PPG",
  "695156109": "PKG",
  "858119100": "STLD",
  "929160109": "VMC",
  "00724F101": "ADBE",
  "007903107": "AMD",
  "00971T101": "AKAM",
  "032654105": "ADI",
  "037833100": "AAPL",
  "03831W108": "APP",
  "040413205": "ANET",
  "052769106": "ADSK",
  "11135F101": "AVGO",
  "127387108": "CDNS",
  "171779309": "CIEN",
  "17275R102": "CSCO",
  "192446102": "CTSH",
  "19247G107": "COHR",
  "22788C105": "CRWD",
  "23804L103": "DDOG",
  "24703L202": "DELL",
  "303250104": "FICO",
  "315616102": "FFIV",
  "336433107": "FSLR",
  "34959E109": "FTNT",
  "366651107": "IT",
  "380237107": "GDDY",
  "40434L105": "HPQ",
  "42824C109": "HPE",
  "458140100": "INTC",
  "459200101": "IBM",
  "461202103": "INTU",
  "466313103": "JBL",
  "482480100": "KLAC",
  "49338L103": "KEYS",
  "512807306": "LRCX",
  "55024U109": "LITE",
  "573874104": "MRVL",
  "594918104": "MSFT",
  "595017104": "MCHP",
  "595112103": "MU",
  "609839105": "MPWR",
  "620076307": "MSI",
  "64110D104": "NTAP",
  "668771108": "GEN",
  "67066G104": "NVDA",
  "682189105": "ON",
  "68389X105": "ORCL",
  "69370C100": "PTC",
  "69608A108": "PLTR",
  "697435105": "PANW",
  "74743L100": "Q",
  "776696106": "ROP",
  "79466L302": "CRM",
  "80004C200": "SNDK",
  "81762P102": "NOW",
  "83088M102": "SWKS",
  "86800U302": "SMCI",
  "871607107": "SNPS",
  "879360105": "TDY",
  "880770102": "TER",
  "882508104": "TXN",
  "896239100": "TRMB",
  "902252105": "TYL",
  "958102105": "WDC",
  "98138H101": "WDAY",
  "989207105": "ZBRA",
  "018802108": "LNT",
  "023608102": "AEE",
  "025537101": "AEP",
  "030420103": "AWK",
  "049560105": "ATO",
  "125896100": "CMS",
  "15189T107": "CNP",
  "209115104": "ED",
  "21037T109": "CEG",
  "233331107": "DTE",
  "25746U109": "D",
  "26441C204": "DUK",
  "281020107": "EIX",
  "30034W106": "EVRG",
  "30040W108": "ES",
  "30161N101": "EXC",
  "337932107": "FE",
  "629377508": "NRG",
  "65339F101": "NEE",
  "65473P105": "NI",
  "69331C108": "PCG",
  "69351T106": "PPL",
  "723484101": "PNW",
  "744573106": "PEG",
  "816851109": "SRE",
  "92840M102": "VST",
  "92939U106": "WEC",
  "98389B100": "XEL",
  "015271109": "ARE",
  "101121101": "BXP",
  "12504L109": "CBRE",
  "133131102": "CPT",
  "22160N109": "CSGP",
  "22822V101": "CCI",
  "253868103": "DLR",
  "29444U700": "EQIX",
  "297178105": "ESS",
  "30225T102": "EXR",
  "313745101": "FRT",
  "42250P103": "DOC",
  "44107P104": "HST",
  "46187W107": "INVH",
  "46284V101": "IRM",
  "49446R109": "KIM",
  "74340W103": "PLD",
  "74460D109": "PSA",
  "756109104": "O",
  "758849103": "REG",
  "78410G104": "SBAC",
  "828806109": "SPG",
  "902653104": "UDR",
  "92276F100": "VTR",
  "925652109": "VICI",
  "95040Q104": "WELL",
  "962166104": "WY",
  "254687106": "DIS",
  "285512109": "EA",
  "874054109": "TTWO",
  "88339J105": "TTD",
  "023135106": "AMZN",
  "23331A109": "DHI",
  "437076102": "HD",
  "571903202": "MAR",
  "67103H107": "ORLY",
  "745867101": "PHM",
  "892356106": "TSCO",
  "969904101": "WSM",
  "115637209": "BF-B",
  "171340102": "CHD",
  "189054109": "CLX",
  "191216100": "KO",
  "194162103": "CL",
  "427866108": "HSY",
  "440452100": "HRL",
  "494368103": "KMB",
  "500754106": "KHC",
  "501044101": "KR",
  "579780206": "MKC",
  "742718109": "PG",
  "832696405": "SJM",
  "25179M103": "DVN",
  "674599105": "OXY",
  "806857108": "SLB",
  "91913Y100": "VLO",
  "020002101": "ALL",
  "060505104": "BAC",
  "064058100": "BNY",
  "084423102": "WRB",
  "174610105": "CFG",
  "354613101": "BEN",
  "38141G104": "GS",
  "416515104": "HIG",
  "446150104": "HBAN",
  "615369105": "MCO",
  "693475105": "PNC",
  "74144T108": "TROW",
  "743315103": "PGR",
  "808513105": "SCHW",
  "902973304": "USB",
  "949746101": "WFC",
  "110122108": "BMY",
  "125523100": "CI",
  "235851102": "DHR",
  "45168D104": "IDXX",
  "592688105": "MTD",
  "92532F100": "VRTX",
  "941848103": "WAT",
  "097023105": "BA",
  "12541W209": "CHRW",
  "445658107": "JBHT",
  "45167R104": "IDXX",
  "502431109": "LHX",
  "574599106": "MAS",
  "666807102": "NOC",
  "831865209": "AOS",
  "98419M100": "XYL",
  "009158106": "APD",
  "61945C103": "MOS",
  "651639106": "NEM",
  "824348106": "SHW",
  "032095101": "APH",
  "038222105": "AMAT",
  "12514G108": "CDW",
  "219350105": "GLW",
  "747525103": "QCOM",
  "92343E102": "VRSN",
  "00130H105": "AES",
  "29364G103": "ETR",
  "842587107": "SO",
  "03027X100": "AMT",
  "29476L107": "EQR",
  "16119P108": "CHTR",
  "548661107": "LOW",
  "872540109": "TJX",
  "518439104": "EL",
  "30231G102": "XOM",
  "969457100": "WMB",
  "571748102": "MMC",
  "89417E109": "TRV",
  "216648501": "COO",
  "053484101": "AVB",
  "59522J103": "MAA",
  "66987V109": "NWSA",
  "66987V208": "NWS"
}


var DELISTED_TICKERS = {
  "EA": { delisted: true, reason: "Private (Aug 2026)" }
}

function sanitizeTicker(symbol) {
  if (!symbol || typeof symbol !== "string") return ""
  var s = symbol.trim().toUpperCase()
  // Clean multi-class share separators
  s = s.replace(/\/([A-Z])/g, "-").replace(/\.([A-Z])$/g, "-")
  // Discard foreign exchange suffixes (e.g. .MU, .SG, .DE, .L, .TO, .MI, .HA, .HM)
  if (/\.[A-Z0-9]+$/i.test(s) && !/^BRK-|^BF-/.test(s)) {
    s = s.replace(/\.[A-Z0-9]+$/i, "")
  }
  return s
}

function isEtfSymbol(symbol, quote) {
  var s = normalizeSymbol(symbol)
  if (!s || isCryptoSymbol(s)) return false
  if (SPDR_SECTOR_MAP[s]) return true
  if (quote && (quote.instrumentType === "ETF" || quote.type === "ETF")) return true
  return false
}

function isSpdrSector(symbol) {
  var s = normalizeSymbol(symbol)
  return !!(s && SPDR_SECTOR_MAP[s])
}

function spdrSectorInfo(symbol) {
  var s = normalizeSymbol(symbol)
  return (s && SPDR_SECTOR_MAP[s]) ? SPDR_SECTOR_MAP[s] : null
}

function holdingsUrl(symbol) {
  var info = spdrSectorInfo(symbol)
  if (!info || !info.accessionNumber) return null
  var accClean = info.accessionNumber.replace(/-/g, "")
  return "https://www.sec.gov/Archives/edgar/data/1064641/" + accClean + "/primary_doc.xml"
}

function resolveCusipToTicker(cusip, name, customMap) {
  if (cusip) {
    var c = String(cusip).trim().toUpperCase()
    if (!/^0+$/.test(c)) {
      if (customMap && customMap[c]) return customMap[c]
      if (SPDR_CUSIP_MAP[c]) return SPDR_CUSIP_MAP[c]
      var c8 = c.slice(0, 8)
      if (customMap && customMap[c8]) return customMap[c8]
      if (SPDR_CUSIP_MAP[c8]) return SPDR_CUSIP_MAP[c8]
    }
  }
  if (name) {
    var n = String(name).trim()
    if (customMap && customMap[n]) return customMap[n]
    if (/ASML HOLDING/i.test(n)) return "ASML"
    if (/TAIWAN SEMICONDUCTOR/i.test(n)) return "TSM"
    if (/NXP SEMICONDUCTOR/i.test(n)) return "NXPI"
    if (/ARM HOLDINGS/i.test(n)) return "ARM"
    if (/ASTERA LABS/i.test(n)) return "ALAB"
    if (/STMICROELECTRONICS/i.test(n)) return "STM"
    if (/COCA-COLA EUROPACIFIC/i.test(n)) return "CCEP"
    if (/AXON ENTERPRISE/i.test(n)) return "AXON"
  }
  return null
}

function parseNportXml(xml, targetSymbol, customMap) {
  if (!xml || typeof xml !== "string") return null

  var reportDate = ""
  var rdateMatch = xml.match(/<(?:\w+:)?repPdEnd>([^<]+)<\/(?:\w+:)?repPdEnd>/i)
  if (rdateMatch) {
    reportDate = rdateMatch[1].trim()
  } else {
    var fdateMatch = xml.match(/<(?:\w+:)?filingDate>([^<]+)<\/(?:\w+:)?filingDate>/i)
    if (fdateMatch) reportDate = fdateMatch[1].trim()
  }

  var holdings = []
  var invstRegex = /<(?:\w+:)?invstOrSec>([\s\S]*?)<\/(?:\w+:)?invstOrSec>/gi
  var match

  while ((match = invstRegex.exec(xml)) !== null) {
    var block = match[1]

    var assetCatMatch = block.match(/<(?:\w+:)?assetCat>([^<]+)<\/(?:\w+:)?assetCat>/i)
    var assetCat = assetCatMatch ? assetCatMatch[1].trim().toUpperCase() : ""
    if (assetCat !== "EC") continue

    var nameMatch = block.match(/<(?:\w+:)?name>([^<]+)<\/(?:\w+:)?name>/i)
    var name = nameMatch ? nameMatch[1].trim() : ""

    var cusipMatch = block.match(/<(?:\w+:)?cusip>([^<]+)<\/(?:\w+:)?cusip>/i)
    var cusip = cusipMatch ? cusipMatch[1].trim().toUpperCase() : ""

    var isinMatch = block.match(/<(?:\w+:)?isin(?:\s+value="([^"]+)"|>([^<]+)<\/(?:\w+:)?isin>)/i)
    var isin = isinMatch ? (isinMatch[1] || isinMatch[2] || "").trim().toUpperCase() : ""

    if ((!cusip || /^0+$/.test(cusip)) && isin && isin.startsWith("US") && isin.length >= 11) {
      cusip = isin.slice(2, 11)
    }

    var valMatch = block.match(/<(?:\w+:)?valUSD>([^<]+)<\/(?:\w+:)?valUSD>/i)
    var valUSD = valMatch ? (parseFloat(valMatch[1]) || 0) : 0

    var pctMatch = block.match(/<(?:\w+:)?pctVal>([^<]+)<\/(?:\w+:)?pctVal>/i)
    var pctVal = pctMatch ? (parseFloat(pctMatch[1]) || 0) : 0

    var symbol = resolveCusipToTicker(cusip, name, customMap)
    if (!symbol && isin) {
      symbol = resolveCusipToTicker(isin, name, customMap)
    }
    if (!symbol) {
      var tickerTagMatch = block.match(/<(?:\w+:)?ticker(?:\s+value="([^"]+)"|>([^<]+)<\/(?:\w+:)?ticker>)/i)
      if (tickerTagMatch) {
        symbol = (tickerTagMatch[1] || tickerTagMatch[2] || "").trim().toUpperCase()
      }
    }

    if (!symbol) continue

    symbol = sanitizeTicker(symbol)
    if (!symbol) continue

    var isDelisted = !!(DELISTED_TICKERS[symbol] && DELISTED_TICKERS[symbol].delisted)

    holdings.push({
      symbol: symbol,
      name: name,
      cusip: cusip,
      valUSD: valUSD,
      pctVal: pctVal,
      delisted: isDelisted,
      relativeRatio: 0
    })
  }

  if (holdings.length === 0) return null

  holdings.sort(function (a, b) {
    return (b.pctVal - a.pctVal) || (b.valUSD - a.valUSD)
  })

  var maxPct = holdings[0].pctVal > 0 ? holdings[0].pctVal : 1
  for (var i = 0; i < holdings.length; i++) {
    holdings[i].relativeRatio = Math.max(0, Math.min(1, holdings[i].pctVal / maxPct))
  }

  return {
    symbol: targetSymbol ? normalizeSymbol(targetSymbol) : "",
    reportDate: reportDate,
    holdings: holdings
  }
}

function sortHoldings(holdings, sortKey, sortAsc, stratMap) {
  if (!isArrayLike(holdings)) return []
  var list = toArray(holdings).slice()
  var asc = !!sortAsc
  var sk = String(sortKey || "weight").toLowerCase()

  if (sk === "ticker" || sk === "symbol") {
    list.sort(function (a, b) {
      var sa = String(a.symbol || "")
      var sb = String(b.symbol || "")
      var cmp = sa.localeCompare(sb)
      return asc ? cmp : -cmp
    })
  } else if (sk === "name") {
    list.sort(function (a, b) {
      var na = String(a.name || "")
      var nb = String(b.name || "")
      var cmp = na.localeCompare(nb)
      return asc ? cmp : -cmp
    })
  } else if (sk === "60" || sk === "1d" || sk === "d" || sk === "1w" || sk === "w" || sk === "1m" || sk === "m" || sk === "1y" || sk === "y") {
    var tf = "1D"
    if (sk === "60") tf = "60"
    else if (sk === "1d" || sk === "d") tf = "1D"
    else if (sk === "1w" || sk === "w") tf = "1W"
    else if (sk === "1m" || sk === "m") tf = "1M"
    else if (sk === "1y" || sk === "y") tf = "1Y"

    function getStratScore(h) {
      if (!h || h.delisted) return -1
      var sym = normalizeSymbol(h.symbol)
      var s = (stratMap && stratMap[sym]) ? (stratMap[sym][tf] || stratMap[sym][sk.toUpperCase()]) : null
      if (!s || !s.bar || s.bar === "-") return -1
      var barRank = 0
      var b = String(s.bar).toUpperCase()
      if (b === "3") barRank = 4
      else if (b === "2U") barRank = 3
      else if (b === "2D") barRank = 2
      else if (b === "1") barRank = 1
      if (barRank === 0) return -1
      var polRank = (s.polarity === "green") ? 1 : 0
      return barRank * 10 + polRank
    }

    list.sort(function (a, b) {
      var scoreA = getStratScore(a)
      var scoreB = getStratScore(b)
      var wa = Number(a.pctVal != null ? a.pctVal : a.valUSD) || 0
      var wb = Number(b.pctVal != null ? b.pctVal : b.valUSD) || 0

      if (scoreA !== scoreB) {
        if (scoreA === -1) return 1
        if (scoreB === -1) return -1
        return asc ? (scoreA - scoreB) : (scoreB - scoreA)
      }
      if (Math.abs(wa - wb) > 0.0001) {
        return asc ? (wa - wb) : (wb - wa)
      }
      return String(a.symbol || "").localeCompare(String(b.symbol || ""))
    })
  } else {
    list.sort(function (a, b) {
      var wa = Number(a.pctVal != null ? a.pctVal : a.valUSD) || 0
      var wb = Number(b.pctVal != null ? b.pctVal : b.valUSD) || 0
      return asc ? wa - wb : wb - wa
    })
  }
  return list
}

function prepareConstituentCandles(dailyCandlesMap) {
  var prepared = {}
  if (!dailyCandlesMap) return prepared
  for (var sym in dailyCandlesMap) {
    var daily = dailyCandlesMap[sym]
    if (!daily || daily.length === 0) continue
    prepared[sym] = {
      "1D": daily,
      "1W": mergePeriodCandles(daily, "1W"),
      "1M": mergePeriodCandles(daily, "1M"),
      "1Y": aggregateYearlyCandles(daily)
    }
  }
  return prepared
}

function computeHoldingStratMatrix(symbol, preparedCandles, hourlyCandlesMap, liveQuote) {
  var sym = normalizeSymbol(symbol)
  var hourly = (hourlyCandlesMap && hourlyCandlesMap[sym]) ? hourlyCandlesMap[sym] : null
  var p = (preparedCandles && preparedCandles[sym]) ? preparedCandles[sym] : null
  var daily = p ? p["1D"] : null
  var weekly = p ? p["1W"] : null
  var monthly = p ? p["1M"] : null
  var yearly = p ? p["1Y"] : null

  var res60 = computeStratDetails(hourly, liveQuote)
  var res1D = computeStratDetails(daily, liveQuote)
  var res1W = computeStratDetails(weekly, liveQuote)
  var res1M = computeStratDetails(monthly, liveQuote)
  var res1Y = computeStratDetails(yearly, liveQuote)

  return {
    "60": res60,
    "1D": res1D,
    "D": res1D,
    "1W": res1W,
    "W": res1W,
    "1M": res1M,
    "M": res1M,
    "1Y": res1Y,
    "Y": res1Y
  }
}

function computeHoldingsStratMap(holdings, hourlyCandlesMap, dailyCandlesMap, liveQuotesMap, preparedCandles) {
  var prepared = preparedCandles || prepareConstituentCandles(dailyCandlesMap)
  var list = isArrayLike(holdings) ? holdings : []
  var map = {}
  for (var i = 0; i < list.length; i++) {
    var h = list[i]
    var sym = normalizeSymbol(h && (h.symbol || h))
    if (!sym) continue
    var quote = (liveQuotesMap && liveQuotesMap[sym]) ? liveQuotesMap[sym] : null
    map[sym] = computeHoldingStratMatrix(sym, prepared, hourlyCandlesMap, quote)
  }
  return map
}

var SIMULTANEOUS_BREAK_THRESHOLD = 80

function computeSectorBreadth(holdings, candlesMap, liveQuotesMap) {
  var list = isArrayLike(holdings) ? holdings : []
  var total = 0
  var count1 = 0
  var count2u = 0
  var count2d = 0
  var count3 = 0
  var countF2u = 0
  var countF2d = 0

  for (var i = 0; i < list.length; i++) {
    var h = list[i]
    if (!h || h.delisted) continue
    var sym = normalizeSymbol(h.symbol)
    if (!sym) continue

    var candles = candlesMap ? candlesMap[sym] : null
    if (!isArrayLike(candles) || candles.length < 2) continue

    total++
    var quote = liveQuotesMap ? liveQuotesMap[sym] : null
    var cLast = Object.assign({}, candles[candles.length - 1])
    var livePx = stratLivePrice(quote)
    if (livePx !== null && isFinite(livePx)) {
      cLast.close = livePx
      if (cLast.high === null || livePx > cLast.high) cLast.high = livePx
      if (cLast.low === null || livePx < cLast.low) cLast.low = livePx
    }
    var cPrev = candles[candles.length - 2]
    var s0 = stratScenario(cLast, cPrev)

    if (s0 === "1") {
      count1++
    } else if (s0 === "2u") {
      count2u++
      if (Number(cLast.close) < Number(cLast.open)) countF2u++
    } else if (s0 === "2d") {
      count2d++
      if (Number(cLast.close) > Number(cLast.open)) countF2d++
    } else if (s0 === "3") {
      count3++
    }
  }

  var pct1 = total > 0 ? (count1 / total) * 100 : 0
  var pct2u = total > 0 ? (count2u / total) * 100 : 0
  var pct2d = total > 0 ? (count2d / total) * 100 : 0
  var pct3 = total > 0 ? (count3 / total) * 100 : 0
  var pctF2u = total > 0 ? (countF2u / total) * 100 : 0
  var pctF2d = total > 0 ? (countF2d / total) * 100 : 0

  return {
    totalHoldings: total,
    count1: count1,
    pct1: pct1,
    count2u: count2u,
    pct2u: pct2u,
    count2d: count2d,
    pct2d: pct2d,
    count3: count3,
    pct3: pct3,
    countF2u: countF2u,
    pctF2u: pctF2u,
    countF2d: countF2d,
    pctF2d: pctF2d,
    isSimultaneous2u: Math.round(pct2u) >= SIMULTANEOUS_BREAK_THRESHOLD,
    isSimultaneous2d: Math.round(pct2d) >= SIMULTANEOUS_BREAK_THRESHOLD
  }
}

function isUsDstUtc(utcMs) {
  var d = new Date(utcMs)
  var yr = d.getUTCFullYear()
  // 2nd Sunday in March at 07:00 UTC (2:00 AM EST)
  var mar1Day = new Date(Date.UTC(yr, 2, 1)).getUTCDay()
  var secondSunMar = 8 + ((7 - mar1Day) % 7)
  var dstStartUtc = Date.UTC(yr, 2, secondSunMar, 7, 0, 0)
  // 1st Sunday in November at 06:00 UTC (2:00 AM EDT)
  var nov1Day = new Date(Date.UTC(yr, 10, 1)).getUTCDay()
  var firstSunNov = 1 + ((7 - nov1Day) % 7)
  var dstEndUtc = Date.UTC(yr, 10, firstSunNov, 6, 0, 0)
  return utcMs >= dstStartUtc && utcMs < dstEndUtc
}

function getUsSessionSchedule(nowDate, quote) {
  var d = (nowDate instanceof Date && isFinite(nowDate.getTime())) ? nowDate : new Date()
  var utcMs = d.getTime()
  var offsetHours = isUsDstUtc(utcMs) ? -4 : -5
  var etDate = new Date(utcMs + offsetHours * 3600000)
  var day = etDate.getUTCDay()
  var isWeekend = (day === 0 || day === 6)
  var mins = etDate.getUTCHours() * 60 + etDate.getUTCMinutes()

  var isEarlyClose = false

  var regPeriod = quote && quote.meta && quote.meta.currentTradingPeriod && quote.meta.currentTradingPeriod.regular
  if (regPeriod && isFinite(regPeriod.end) && isFinite(regPeriod.start)) {
    var regEndEt = new Date(Number(regPeriod.end) * 1000 + offsetHours * 3600000)
    var regCloseMins = regEndEt.getUTCHours() * 60 + regEndEt.getUTCMinutes()
    if (regCloseMins <= 840) {
      isEarlyClose = true
    }
  }

  if (!isEarlyClose && !isWeekend) {
    var month = etDate.getUTCMonth()
    var date = etDate.getUTCDate()
    // Black Friday: Friday after 4th Thursday of November (dates 23-29)
    if (month === 10 && day === 5 && date >= 23 && date <= 29) {
      isEarlyClose = true
    }
    // Christmas Eve: Dec 24 on Mon-Thu
    else if (month === 11 && date === 24 && day >= 1 && day <= 4) {
      isEarlyClose = true
    }
    // Day before July 4th: July 3 on Mon-Thu
    else if (month === 6 && date === 3 && day >= 1 && day <= 4) {
      isEarlyClose = true
    }
  }

  var openMins = 570 // 09:30 ET
  var closeMins = isEarlyClose ? 780 : 960 // 13:00 ET or 16:00 ET
  var finalBarMins = closeMins - 30 // 12:30 ET or 15:30 ET
  var isSessionOpen = !isWeekend && (mins >= openMins && mins < closeMins)

  return {
    etDate: etDate,
    mins: mins,
    isWeekend: isWeekend,
    isEarlyClose: isEarlyClose,
    openMins: openMins,
    closeMins: closeMins,
    finalBarMins: finalBarMins,
    isSessionOpen: isSessionOpen
  }
}

function candleDurationSec(candle, tf, symbol, nowDate, quote) {
  var tfStr = String(tf || "60")
  if (tfStr === "30") return 1800
  if (tfStr !== "60") return 3600

  var sym = normalizeSymbol(symbol)
  if (isCryptoSymbol(sym)) return 3600

  if (sym.indexOf(".") !== -1) {
    var parts = sym.split(".")
    var sfx = parts[parts.length - 1].toUpperCase()
    if (sfx !== "TO" && sfx !== "V") return 3600
  }

  var cTs = candle && isFinite(candle.timestamp) ? Number(candle.timestamp) : null
  if (cTs === null) return 3600

  var utcMs = cTs * 1000
  var offsetHours = isUsDstUtc(utcMs) ? -4 : -5
  var candleEt = new Date(utcMs + offsetHours * 3600000)
  var sched = getUsSessionSchedule(candleEt, quote)
  var candleMins = candleEt.getUTCHours() * 60 + candleEt.getUTCMinutes()

  if (candleMins >= sched.finalBarMins && candleMins < sched.closeMins) {
    return 1800
  }
  return 3600
}

function isUsMarketOpen(nowDate, allowExtended) {
  var sched = getUsSessionSchedule(nowDate)
  if (sched.isWeekend) return false
  if (allowExtended === true) {
    // 04:00 ET (240) to 20:00 ET (1200)
    return sched.mins >= 240 && sched.mins < 1200
  }
  // Regular Trading Hours: 09:30 ET (570) to 16:00 ET (960) (or 13:00 ET on early close)
  return sched.isSessionOpen
}

// ---------------------------------------------------------------------------
// Alert mute ("chart-only" days)
//
// Mute state is a single number, `alertsMutedUntil`:
//   0  -> alerts are live
//   -1 -> muted until manually unmuted
//   >0 -> muted until that epoch-ms timestamp (auto-expires)
// Muting only suppresses delivery (desktop notification, sound, Discord).
// The alert engines keep evaluating so state stays consistent and nothing
// stale fires in a burst on unmute.
// ---------------------------------------------------------------------------

var ALERT_MUTE_INDEFINITE = -1

// Next regular-session open (09:30 ET, Mon-Fri) strictly after nowDate.
// Exchange holidays are not modelled; a holiday simply ends the mute early.
function nextUsMarketOpenMs(nowDate) {
  var d = (nowDate instanceof Date && isFinite(nowDate.getTime())) ? nowDate : new Date()
  var nowMs = d.getTime()
  var etNow = new Date(nowMs + (isUsDstUtc(nowMs) ? -4 : -5) * 3600000)
  for (var i = 0; i < 10; i++) {
    var y = etNow.getUTCFullYear()
    var m = etNow.getUTCMonth()
    var day = etNow.getUTCDate() + i
    var weekday = new Date(Date.UTC(y, m, day)).getUTCDay()
    if (weekday === 0 || weekday === 6) continue
    // 09:30 ET expressed as UTC; resolve DST offset at that instant.
    var guessUtc = Date.UTC(y, m, day, 9, 30) + 5 * 3600000
    var offsetH = isUsDstUtc(guessUtc) ? -4 : -5
    var openUtc = Date.UTC(y, m, day, 9, 30) - offsetH * 3600000
    if (openUtc > nowMs) return openUtc
  }
  return nowMs + 86400000
}

function normalizeAlertsMutedUntil(value) {
  var n = Number(value)
  if (!isFinite(n)) return 0
  if (n === ALERT_MUTE_INDEFINITE) return ALERT_MUTE_INDEFINITE
  return n > 0 ? Math.floor(n) : 0
}

function isAlertsMuted(mutedUntil, nowDate) {
  var v = normalizeAlertsMutedUntil(mutedUntil)
  if (v === ALERT_MUTE_INDEFINITE) return true
  if (v <= 0) return false
  var nowMs = (nowDate instanceof Date && isFinite(nowDate.getTime())) ? nowDate.getTime() : Date.now()
  return v > nowMs
}

// mode: "open" (until next market open), "1h", "indefinite", anything else -> unmute
function alertsMuteUntilForMode(mode, nowDate) {
  var d = (nowDate instanceof Date && isFinite(nowDate.getTime())) ? nowDate : new Date()
  if (mode === "open") return nextUsMarketOpenMs(d)
  if (mode === "1h") return d.getTime() + 3600000
  if (mode === "indefinite") return ALERT_MUTE_INDEFINITE
  return 0
}

function formatMuteClock(ms, nowDate) {
  var t = new Date(ms)
  var now = (nowDate instanceof Date && isFinite(nowDate.getTime())) ? nowDate : new Date()
  var h = t.getHours()
  var mm = t.getMinutes()
  var clock = ((h % 12) || 12) + ":" + (mm < 10 ? "0" : "") + mm + (h < 12 ? " AM" : " PM")
  var sameDay = t.getFullYear() === now.getFullYear() && t.getMonth() === now.getMonth() && t.getDate() === now.getDate()
  if (sameDay) return clock
  var days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  return days[t.getDay()] + " " + clock
}

function alertsMuteStatusText(mutedUntil, nowDate) {
  if (!isAlertsMuted(mutedUntil, nowDate)) return ""
  var v = normalizeAlertsMutedUntil(mutedUntil)
  if (v === ALERT_MUTE_INDEFINITE) return "Alerts muted until you unmute"
  return "Alerts muted until " + formatMuteClock(v, nowDate)
}

function isAlertSessionOpen(symbol, quote, allowExtended, nowDate) {
  var sym = normalizeSymbol(symbol)
  if (isCryptoSymbol(sym)) return true
  if (quote && (quote.session === "live" || quote.instrumentType === "CRYPTOCURRENCY")) return true

  var hasValidNow = (nowDate instanceof Date && isFinite(nowDate.getTime()))
  var ext = Boolean(allowExtended)

  if (quote && typeof quote.session === "string" && quote.session.length > 0) {
    var s = quote.session
    if (s === "regular") {
      return hasValidNow ? isUsMarketOpen(nowDate, false) : true
    }
    if (ext && (s === "pre" || s === "post")) {
      return hasValidNow ? isUsMarketOpen(nowDate, true) : true
    }
    return false
  }

  if (hasValidNow) {
    return isUsMarketOpen(nowDate, ext)
  }
  return true
}

function discordPriceAlertPayload(symbol, level, currentPrice, crossDir) {
  var sym = normalizeSymbol(symbol)
  if (!sym || !level || !isFinite(level.price)) return null
  var dir = String(crossDir || "CROSS").toUpperCase()
  var isAbove = (dir === "ABOVE" || level.alertCondition === "CROSSES_ABOVE")
  var color = isAbove ? 3066993 : 15158332
  var lvlPx = "$" + Number(level.price).toFixed(2)
  var curPx = (currentPrice != null && isFinite(currentPrice)) ? ("$" + Number(currentPrice).toFixed(2)) : lvlPx
  var condLabel = dir === "ABOVE" ? "Crossed Above" : (dir === "BELOW" ? "Crossed Below" : "Crossed Level")
  var customNote = (level.text !== undefined && level.text !== null && String(level.text).trim().length > 0)
    ? String(level.text).trim()
    : "Chart Price Alert"

  var fields = [
    { name: "Alert Price", value: "`" + lvlPx + "`", inline: true },
    { name: "Last Price", value: "`" + curPx + "`", inline: true },
    { name: "Condition", value: "`" + condLabel + "`", inline: true }
  ]
  if (customNote) {
    fields.push({ name: "Level Note", value: customNote, inline: false })
  }

  return JSON.stringify({
    content: "@everyone **Price Alert Triggered: " + sym + " (" + condLabel + " " + lvlPx + ")**",
    embeds: [
      {
        title: "Price Alert Triggered: " + sym + " [" + lvlPx + "]",
        description: "**" + sym + "** " + condLabel.toLowerCase() + " **" + lvlPx + "** (Last: `" + curPx + "`).",
        color: color,
        fields: fields,
        footer: { text: "Omafinance Price Level Alert Engine" },
        timestamp: new Date().toISOString()
      }
    ]
  })
}

function evaluatePriceLevelAlerts(symbol, levels, prevPrice, currentPrice, quote, nowDate) {
  var sym = normalizeSymbol(symbol)
  var srcLevels = Array.isArray(levels) ? levels : []
  if (!sym || srcLevels.length === 0) {
    return { triggered: [], nextLevels: srcLevels, modified: false }
  }

  var prev = finiteOrNull(prevPrice)
  var curr = finiteOrNull(currentPrice)
  if (prev === null || curr === null || prev <= 0 || curr <= 0 || prev === curr) {
    return { triggered: [], nextLevels: srcLevels, modified: false }
  }

  var nowMs = (nowDate instanceof Date && isFinite(nowDate.getTime())) ? nowDate.getTime() : Date.now()
  var nextLevels = []
  var triggered = []
  var modified = false

  for (var i = 0; i < srcLevels.length; i++) {
    var lvl = srcLevels[i]
    if (!lvl || !lvl.alertEnabled || lvl.alertTriggered || !isFinite(lvl.price)) {
      nextLevels.push(lvl)
      continue
    }

    var sessionOk = isAlertSessionOpen(sym, quote, Boolean(lvl.allowExtended), nowDate)
    if (!sessionOk) {
      nextLevels.push(lvl)
      continue
    }

    var target = Number(lvl.price)
    var cond = String(lvl.alertCondition || "CROSSES").toUpperCase()
    var crossedAbove = (prev < target && curr >= target)
    var crossedBelow = (prev > target && curr <= target)
    var hit = false
    var crossDir = ""

    if (cond === "CROSSES_ABOVE" && crossedAbove) {
      hit = true
      crossDir = "ABOVE"
    } else if (cond === "CROSSES_BELOW" && crossedBelow) {
      hit = true
      crossDir = "BELOW"
    } else if (cond === "CROSSES" && (crossedAbove || crossedBelow)) {
      hit = true
      crossDir = crossedAbove ? "ABOVE" : "BELOW"
    }

    if (hit) {
      var updated = Object.assign({}, lvl, {
        alertTriggered: true,
        alertTriggeredAt: nowMs
      })
      nextLevels.push(updated)
      modified = true

      var dirWord = crossDir === "ABOVE" ? "Crossed Above" : "Crossed Below"
      var noteTxt = (lvl.text && String(lvl.text).trim().length > 0) ? (" (" + String(lvl.text).trim() + ")") : ""
      var title = "Price Alert: " + sym + " " + (crossDir === "ABOVE" ? ">=" : "<=") + " $" + target.toFixed(2)
      var body = sym + " " + dirWord + " $" + target.toFixed(2) + noteTxt + " | Last: $" + curr.toFixed(2)

      triggered.push({
        symbol: sym,
        level: updated,
        crossDir: crossDir,
        direction: crossDir,
        currentPrice: curr,
        title: title,
        body: body,
        discordPayload: discordPriceAlertPayload(sym, updated, curr, crossDir),
        logEntry: {
          id: "price_" + sym + "_" + (updated.id || Math.round(target * 100)) + "_" + nowMs,
          timestamp: nowMs,
          timestampMs: nowMs,
          symbol: sym,
          kind: "PRICE",
          eventType: "PRICE_CROSS",
          direction: crossDir,
          timeframe: updated.sourceTf || "1D",
          price: curr,
          triggerPrice: target,
          title: title,
          summary: body,
          body: body
        }
      })
    } else {
      nextLevels.push(lvl)
    }
  }

  return {
    triggered: triggered,
    nextLevels: nextLevels,
    modified: modified
  }
}

function timeframeRank(tf) {
  switch (String(tf || "")) {
  case "1": return 1
  case "5": return 2
  case "15": return 3
  case "30": return 4
  case "60": return 5
  case "1D": return 6
  case "1W": return 7
  case "1M": return 8
  case "1Y": return 9
  default: return 0
  }
}

function isLevelVisibleOnTimeframe(lvl, targetTf) {
  if (!lvl) return false
  if (!lvl.sourceTf) return true
  var srcRank = timeframeRank(lvl.sourceTf)
  var tgtRank = timeframeRank(targetTf)
  if (srcRank === 0 || tgtRank === 0) return true
  return tgtRank <= srcRank
}

function inHtfPeriod(ltfTs, htfTs, sourceTf) {
  if (!isFinite(ltfTs) || !isFinite(htfTs)) return false
  var dL = new Date(ltfTs * 1000)
  var dH = new Date(htfTs * 1000)
  if (sourceTf === "1Y") {
    return dL.getUTCFullYear() === dH.getUTCFullYear()
  }
  if (sourceTf === "1M") {
    return dL.getUTCFullYear() === dH.getUTCFullYear() &&
           dL.getUTCMonth() === dH.getUTCMonth()
  }
  if (sourceTf === "1W") {
    var dayL = dL.getUTCDay()
    var diffL = dL.getUTCDate() - dayL + (dayL === 0 ? -6 : 1)
    var monL = Date.UTC(dL.getUTCFullYear(), dL.getUTCMonth(), diffL)
    var dayH = dH.getUTCDay()
    var diffH = dH.getUTCDate() - dayH + (dayH === 0 ? -6 : 1)
    var monH = Date.UTC(dH.getUTCFullYear(), dH.getUTCMonth(), diffH)
    return monL === monH
  }
  if (sourceTf === "1D") {
    return dL.getUTCFullYear() === dH.getUTCFullYear() &&
           dL.getUTCMonth() === dH.getUTCMonth() &&
           dL.getUTCDate() === dH.getUTCDate()
  }
  if (sourceTf === "60") {
    return dL.getUTCFullYear() === dH.getUTCFullYear() &&
           dL.getUTCMonth() === dH.getUTCMonth() &&
           dL.getUTCDate() === dH.getUTCDate() &&
           ltfTs >= htfTs && ltfTs < htfTs + 3600
  }
  if (sourceTf === "30") {
    return dL.getUTCFullYear() === dH.getUTCFullYear() &&
           dL.getUTCMonth() === dH.getUTCMonth() &&
           dL.getUTCDate() === dH.getUTCDate() &&
           ltfTs >= htfTs && ltfTs < htfTs + 1800
  }
  if (sourceTf === "15") {
    return dL.getUTCFullYear() === dH.getUTCFullYear() &&
           dL.getUTCMonth() === dH.getUTCMonth() &&
           dL.getUTCDate() === dH.getUTCDate() &&
           ltfTs >= htfTs && ltfTs < htfTs + 900
  }
  if (sourceTf === "5") {
    return dL.getUTCFullYear() === dH.getUTCFullYear() &&
           dL.getUTCMonth() === dH.getUTCMonth() &&
           dL.getUTCDate() === dH.getUTCDate() &&
           ltfTs >= htfTs && ltfTs < htfTs + 300
  }
  return ltfTs === htfTs
}

function resolveLevelAnchorIndex(lvl, allCandles, targetTf) {
  if (!allCandles || allCandles.length === 0 || !lvl) return 0
  if (!isFinite(lvl.anchorTs) || lvl.ohlcField === "scale") return 0

  var srcTf = String(lvl.sourceTf || targetTf || "1D")
  var tgtTf = String(targetTf || srcTf)
  var srcRank = timeframeRank(srcTf)
  var tgtRank = timeframeRank(tgtTf)

  if (srcTf === tgtTf || tgtRank >= srcRank) {
    var bestIdx = 0
    var bestDiff = Math.abs(allCandles[0].timestamp - lvl.anchorTs)
    for (var i = 1; i < allCandles.length; i++) {
      var diff = Math.abs(allCandles[i].timestamp - lvl.anchorTs)
      if (diff < bestDiff) {
        bestDiff = diff
        bestIdx = i
      }
    }
    return bestIdx
  }

  var matches = []
  for (var j = 0; j < allCandles.length; j++) {
    if (inHtfPeriod(allCandles[j].timestamp, lvl.anchorTs, srcTf)) {
      matches.push(j)
    }
  }

  if (matches.length === 0) {
    if (lvl.anchorTs < allCandles[0].timestamp) return 0
    if (lvl.anchorTs > allCandles[allCandles.length - 1].timestamp) return allCandles.length - 1
    var fbIdx = 0
    var fbDiff = Math.abs(allCandles[0].timestamp - lvl.anchorTs)
    for (var k = 1; k < allCandles.length; k++) {
      var d = Math.abs(allCandles[k].timestamp - lvl.anchorTs)
      if (d < fbDiff) {
        fbDiff = d
        fbIdx = k
      }
    }
    return fbIdx
  }

  var field = lvl.ohlcField || "close"
  if (field === "open") {
    return matches[0]
  }
  if (field === "close") {
    return matches[matches.length - 1]
  }
  if (field === "high") {
    var bestHighIdx = matches[0]
    var bestHighVal = Number(allCandles[bestHighIdx].high)
    var bestHighDiff = isFinite(lvl.price) ? Math.abs(bestHighVal - lvl.price) : Infinity
    for (var m = 1; m < matches.length; m++) {
      var candIdx = matches[m]
      var candHigh = Number(allCandles[candIdx].high)
      if (isFinite(lvl.price)) {
        var hDiff = Math.abs(candHigh - lvl.price)
        if (hDiff < bestHighDiff - 1e-9 || (Math.abs(hDiff - bestHighDiff) <= 1e-9 && candHigh > bestHighVal)) {
          bestHighDiff = hDiff
          bestHighVal = candHigh
          bestHighIdx = candIdx
        }
      } else if (candHigh > bestHighVal) {
        bestHighVal = candHigh
        bestHighIdx = candIdx
      }
    }
    return bestHighIdx
  }
  if (field === "low") {
    var bestLowIdx = matches[0]
    var bestLowVal = Number(allCandles[bestLowIdx].low)
    var bestLowDiff = isFinite(lvl.price) ? Math.abs(bestLowVal - lvl.price) : Infinity
    for (var n = 1; n < matches.length; n++) {
      var lIdx = matches[n]
      var candLow = Number(allCandles[lIdx].low)
      if (isFinite(lvl.price)) {
        var lDiff = Math.abs(candLow - lvl.price)
        if (lDiff < bestLowDiff - 1e-9 || (Math.abs(lDiff - bestLowDiff) <= 1e-9 && candLow < bestLowVal)) {
          bestLowDiff = lDiff
          bestLowVal = candLow
          bestLowIdx = lIdx
        }
      } else if (candLow < bestLowVal) {
        bestLowVal = candLow
        bestLowIdx = lIdx
      }
    }
    return bestLowIdx
  }

  return matches[matches.length - 1]
}

function periodStartUtc(ts, tf) {
  var t = Number(ts)
  if (!isFinite(t) || t <= 0) return 0
  var d = new Date(t * 1000)
  if (tf === "1Y") {
    return Date.UTC(d.getUTCFullYear(), 0, 1) / 1000
  }
  if (tf === "1M") {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000
  }
  if (tf === "1W") {
    var day = d.getUTCDay()
    var diff = d.getUTCDate() - day + (day === 0 ? -6 : 1)
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff) / 1000
  }
  if (tf === "1D") {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000
  }
  return t
}

function buildReplayCandles(tf, rawCandles, ltf30Candles, htf60Candles, dailyCandles, cutoffTs, subCandles) {
  if (!isArrayLike(rawCandles) || rawCandles.length === 0) return []
  var cutoff = finiteOrNull(cutoffTs)
  if (cutoff === null || cutoff <= 0) return rawCandles

  var range = String(tf || "1D")
  var sub = isArrayLike(subCandles) ? subCandles : []
  var ltf30 = isArrayLike(ltf30Candles) ? ltf30Candles : []
  var htf60 = isArrayLike(htf60Candles) ? htf60Candles : []
  var daily = isArrayLike(dailyCandles) ? dailyCandles : []
  var intradaySrc = sub.length > 0 ? sub : (ltf30.length > 0 ? ltf30 : htf60)
  var out = []

  if (range === "1" || range === "5") {
    for (var i = 0; i < rawCandles.length; i++) {
      var c = rawCandles[i]
      if (c && isFinite(c.timestamp) && c.timestamp < cutoff) {
        out.push({
          timestamp: c.timestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume || 0
        })
      }
    }
    return out
  }

  if (range === "15") {
    for (var j15 = 0; j15 < rawCandles.length; j15++) {
      var b15 = rawCandles[j15]
      if (!b15 || !isFinite(b15.timestamp) || b15.timestamp >= cutoff) continue
      var needsPartial15 = (cutoff < b15.timestamp + 900) || (j15 === rawCandles.length - 1) || (j15 + 1 < rawCandles.length && rawCandles[j15 + 1].timestamp > cutoff)
      if (needsPartial15 && sub.length > 0) {
        var sub15 = []
        for (var k15 = 0; k15 < sub.length; k15++) {
          var s15 = sub[k15]
          if (s15 && isFinite(s15.timestamp) && s15.timestamp < cutoff && inHtfPeriod(s15.timestamp, b15.timestamp, "15")) {
            sub15.push(s15)
          }
        }
        if (sub15.length > 0) {
          var o15 = sub15[0].open
          var h15 = sub15[0].high
          var l15 = sub15[0].low
          var cl15 = sub15[sub15.length - 1].close
          var v15 = 0
          for (var m15 = 0; m15 < sub15.length; m15++) {
            if (sub15[m15].high > h15) h15 = sub15[m15].high
            if (sub15[m15].low < l15) l15 = sub15[m15].low
            v15 += (sub15[m15].volume || 0)
          }
          out.push({
            timestamp: b15.timestamp,
            open: o15,
            high: h15,
            low: l15,
            close: cl15,
            volume: v15
          })
          continue
        }
      }
      out.push({
        timestamp: b15.timestamp,
        open: b15.open,
        high: b15.high,
        low: b15.low,
        close: b15.close,
        volume: b15.volume || 0
      })
    }
    return out
  }

  if (range === "30") {
    for (var j30 = 0; j30 < rawCandles.length; j30++) {
      var b30 = rawCandles[j30]
      if (!b30 || !isFinite(b30.timestamp) || b30.timestamp >= cutoff) continue
      var needsPartial30 = (cutoff < b30.timestamp + 1800) || (j30 === rawCandles.length - 1) || (j30 + 1 < rawCandles.length && rawCandles[j30 + 1].timestamp > cutoff)
      if (needsPartial30 && sub.length > 0) {
        var sub30 = []
        for (var k30 = 0; k30 < sub.length; k30++) {
          var s30 = sub[k30]
          if (s30 && isFinite(s30.timestamp) && s30.timestamp < cutoff && inHtfPeriod(s30.timestamp, b30.timestamp, "30")) {
            sub30.push(s30)
          }
        }
        if (sub30.length > 0) {
          var o30 = sub30[0].open
          var h30 = sub30[0].high
          var l30 = sub30[0].low
          var cl30 = sub30[sub30.length - 1].close
          var v30 = 0
          for (var m30 = 0; m30 < sub30.length; m30++) {
            if (sub30[m30].high > h30) h30 = sub30[m30].high
            if (sub30[m30].low < l30) l30 = sub30[m30].low
            v30 += (sub30[m30].volume || 0)
          }
          out.push({
            timestamp: b30.timestamp,
            open: o30,
            high: h30,
            low: l30,
            close: cl30,
            volume: v30
          })
          continue
        }
      }
      out.push({
        timestamp: b30.timestamp,
        open: b30.open,
        high: b30.high,
        low: b30.low,
        close: b30.close,
        volume: b30.volume || 0
      })
    }
    return out
  }

  if (range === "60") {
    var sub60Src = sub.length > 0 ? sub : ltf30
    for (var j = 0; j < rawCandles.length; j++) {
      var b60 = rawCandles[j]
      if (!b60 || !isFinite(b60.timestamp) || b60.timestamp >= cutoff) continue
      var needsPartial = (cutoff < b60.timestamp + 3600) || (j === rawCandles.length - 1) || (j + 1 < rawCandles.length && rawCandles[j + 1].timestamp > cutoff)
      if (needsPartial && sub60Src.length > 0) {
        var sub60 = []
        for (var k = 0; k < sub60Src.length; k++) {
          var s = sub60Src[k]
          if (s && isFinite(s.timestamp) && s.timestamp < cutoff && inHtfPeriod(s.timestamp, b60.timestamp, "60")) {
            sub60.push(s)
          }
        }
        if (sub60.length > 0) {
          var o60 = sub60[0].open
          var h60 = sub60[0].high
          var l60 = sub60[0].low
          var cl60 = sub60[sub60.length - 1].close
          var v60 = 0
          for (var m = 0; m < sub60.length; m++) {
            if (sub60[m].high > h60) h60 = sub60[m].high
            if (sub60[m].low < l60) l60 = sub60[m].low
            v60 += (sub60[m].volume || 0)
          }
          out.push({
            timestamp: b60.timestamp,
            open: o60,
            high: h60,
            low: l60,
            close: cl60,
            volume: v60
          })
          continue
        }
      }
      out.push({
        timestamp: b60.timestamp,
        open: b60.open,
        high: b60.high,
        low: b60.low,
        close: b60.close,
        volume: b60.volume || 0
      })
    }
    return out
  }

  var lastIntradayTs = null
  for (var ii = 0; ii < intradaySrc.length; ii++) {
    var ic = intradaySrc[ii]
    if (ic && isFinite(ic.timestamp) && ic.timestamp < cutoff) {
      if (lastIntradayTs === null || ic.timestamp > lastIntradayTs) {
        lastIntradayTs = ic.timestamp
      }
    }
  }
  var refTs = lastIntradayTs !== null ? lastIntradayTs : (cutoff - 1)
  var cutoffPeriodStart = periodStartUtc(refTs, range)
  var cutoffDayStart = periodStartUtc(refTs, "1D")

  for (var hi = 0; hi < rawCandles.length; hi++) {
    var bh = rawCandles[hi]
    if (!bh || !isFinite(bh.timestamp)) continue
    var bPeriodStart = periodStartUtc(bh.timestamp, range)
    if (bPeriodStart > cutoffPeriodStart) continue
    if (bPeriodStart < cutoffPeriodStart) {
      out.push({
        timestamp: bh.timestamp,
        open: bh.open,
        high: bh.high,
        low: bh.low,
        close: bh.close,
        volume: bh.volume || 0
      })
      continue
    }

    var subBars = []
    if (range === "1D") {
      for (var di = 0; di < intradaySrc.length; di++) {
        var dc = intradaySrc[di]
        if (dc && isFinite(dc.timestamp) && dc.timestamp < cutoff && periodStartUtc(dc.timestamp, "1D") === cutoffDayStart) {
          subBars.push(dc)
        }
      }
    } else {
      for (var pdi = 0; pdi < daily.length; pdi++) {
        var pd = daily[pdi]
        if (pd && isFinite(pd.timestamp)) {
          var pdDay = periodStartUtc(pd.timestamp, "1D")
          if (periodStartUtc(pd.timestamp, range) === cutoffPeriodStart && pdDay < cutoffDayStart) {
            subBars.push(pd)
          }
        }
      }
      for (var idi = 0; idi < intradaySrc.length; idi++) {
        var idc = intradaySrc[idi]
        if (idc && isFinite(idc.timestamp) && idc.timestamp < cutoff && periodStartUtc(idc.timestamp, range) === cutoffPeriodStart) {
          var idcDay = periodStartUtc(idc.timestamp, "1D")
          if (daily.length === 0 || idcDay >= cutoffDayStart) {
            subBars.push(idc)
          }
        }
      }
    }

    if (subBars.length > 0) {
      var startsEarlierThanCache = (range === "1Y" || range === "1M") && periodStartUtc(subBars[0].timestamp, "1D") > cutoffPeriodStart + 86400 * 5
      var oh = startsEarlierThanCache ? bh.open : subBars[0].open
      var hh = startsEarlierThanCache ? Math.max(bh.open, subBars[0].high) : subBars[0].high
      var lh = startsEarlierThanCache ? Math.min(bh.open, subBars[0].low) : subBars[0].low
      var clh = subBars[subBars.length - 1].close
      var vh = 0
      for (var sb = 0; sb < subBars.length; sb++) {
        if (subBars[sb].high > hh) hh = subBars[sb].high
        if (subBars[sb].low < lh) lh = subBars[sb].low
        vh += (subBars[sb].volume || 0)
      }
      out.push({
        timestamp: bh.timestamp,
        open: oh,
        high: hh,
        low: lh,
        close: clh,
        volume: vh
      })
    } else if (bh.timestamp < cutoff) {
      out.push({
        timestamp: bh.timestamp,
        open: bh.open,
        high: bh.high,
        low: bh.low,
        close: bh.close,
        volume: bh.volume || 0
      })
    }
  }

  return out
}

function buildReplayQuote(liveQuote, ltf30Candles, htf60Candles, dailyCandles, cutoffTs, subCandles) {
  var cutoff = finiteOrNull(cutoffTs)
  if (cutoff === null || cutoff <= 0) return liveQuote
  var sub = isArrayLike(subCandles) ? subCandles : []
  var ltf30 = isArrayLike(ltf30Candles) ? ltf30Candles : []
  var htf60 = isArrayLike(htf60Candles) ? htf60Candles : []
  var daily = isArrayLike(dailyCandles) ? dailyCandles : []
  var intradaySrc = sub.length > 0 ? sub : (ltf30.length > 0 ? ltf30 : (htf60.length > 0 ? htf60 : daily))

  var lastBar = null
  for (var i = 0; i < intradaySrc.length; i++) {
    var c = intradaySrc[i]
    if (c && isFinite(c.timestamp) && c.timestamp < cutoff) {
      if (!lastBar || c.timestamp >= lastBar.timestamp) {
        lastBar = c
      }
    }
  }
  if (!lastBar) return liveQuote

  var replayPrice = Number(lastBar.close)
  var base = (liveQuote && typeof liveQuote === "object") ? Object.assign({}, liveQuote) : {}
  base.price = replayPrice
  base.regularPrice = replayPrice
  base.regularMarketPrice = replayPrice
  base.dayHigh = null
  base.dayLow = null
  base.hasExtended = false
  base.extendedPrice = null
  base.session = "regular"
  return base
}

function stepReplayCutoff(rawCandles, currentCutoffTs, direction) {
  if (!isArrayLike(rawCandles) || rawCandles.length < 2) return 0
  var cutoff = finiteOrNull(currentCutoffTs)
  var dir = direction < 0 ? -1 : 1
  if (cutoff === null || cutoff <= 0) {
    return rawCandles[rawCandles.length - 1].timestamp
  }
  var firstExcludedIdx = rawCandles.length
  for (var i = 0; i < rawCandles.length; i++) {
    if (rawCandles[i] && isFinite(rawCandles[i].timestamp) && rawCandles[i].timestamp >= cutoff) {
      firstExcludedIdx = i
      break
    }
  }
  if (dir < 0) {
    var prevIdx = Math.max(1, firstExcludedIdx - 1)
    return rawCandles[prevIdx].timestamp
  }
  var nextIdx = firstExcludedIdx + 1
  if (nextIdx >= rawCandles.length) return 0
  return rawCandles[nextIdx].timestamp
}

function formatReplayBadgeTime(cutoffTs, stepCandlesOrLtf30, ltf30OrHtf60, htf60OrDaily, maybeDaily) {
  var cutoff = finiteOrNull(cutoffTs)
  if (cutoff === null || cutoff <= 0) return ""
  var step = []
  var ltf30 = []
  var htf60 = []
  var daily = []
  if (arguments.length >= 5) {
    step = isArrayLike(stepCandlesOrLtf30) ? stepCandlesOrLtf30 : []
    ltf30 = isArrayLike(ltf30OrHtf60) ? ltf30OrHtf60 : []
    htf60 = isArrayLike(htf60OrDaily) ? htf60OrDaily : []
    daily = isArrayLike(maybeDaily) ? maybeDaily : []
  } else {
    ltf30 = isArrayLike(stepCandlesOrLtf30) ? stepCandlesOrLtf30 : []
    htf60 = isArrayLike(ltf30OrHtf60) ? ltf30OrHtf60 : []
    daily = isArrayLike(htf60OrDaily) ? htf60OrDaily : []
  }
  var src = step.length > 0 ? step : (ltf30.length > 0 ? ltf30 : (htf60.length > 0 ? htf60 : daily))
  var activeTs = null
  for (var i = 0; i < src.length; i++) {
    if (src[i] && isFinite(src[i].timestamp) && src[i].timestamp < cutoff) {
      activeTs = src[i].timestamp
    }
  }
  if (activeTs === null) {
    activeTs = cutoff
  }
  var tfKey = "1D"
  if (step.length > 0) {
    tfKey = "5"
  } else if (ltf30.length > 0 || htf60.length > 0) {
    tfKey = "30"
  }
  return formatCandleTime(activeTs, tfKey)
}

function mapReplayStepInterval(step) {
  var s = String(step || "").trim().toUpperCase()
  if (!s || s === "AUTO") return ""
  if (s === "1M" || s === "1" || s === "1MIN") return "1"
  if (s === "5M" || s === "5" || s === "5MIN") return "5"
  if (s === "15M" || s === "15" || s === "15MIN") return "15"
  if (s === "30M" || s === "30" || s === "30MIN") return "30"
  if (s === "60M" || s === "60" || s === "1H" || s === "1HR") return "60"
  if (s === "1D" || s === "D" || s === "DAILY") return "1D"
  return String(step)
}

function nodeCommand(scriptPath, extraArgs) {
  var cmd = [
    "bash", "-c",
    "export PATH=\"$HOME/.local/share/mise/shims:$HOME/.local/share/mise/installs/node/latest/bin:$HOME/.local/bin:$PATH\"; exec node \"$@\"",
    "--",
    scriptPath
  ];
  if (extraArgs && extraArgs.length > 0) {
    for (var i = 0; i < extraArgs.length; i++) {
      cmd.push(extraArgs[i]);
    }
  }
  return cmd;
}

function candleDateIso(candle) {
  if (!candle) return "";
  if (candle.date) return String(candle.date);
  var ts = candle.timestamp || candle.time;
  if (!ts) return "";
  var d = new Date(ts > 1e11 ? ts : ts * 1000);
  var y = d.getUTCFullYear();
  var m = d.getUTCMonth() + 1;
  var day = d.getUTCDate();
  return y + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
}

// ---------------------------------------------------------------------------
// TheStrat Broadening Formations (Truth #3: price discovery is a broadening formation)
// ---------------------------------------------------------------------------
// Every tolerance below is a fraction of price, so the same rule behaves the same on a
// $5 stock and a $5,000 index.

// Float-noise guard: how far a bar may sit above the upper line (or below the lower line)
// and still count as "on the line", and how far a newer anchor may fall short of the older
// one and still count as broadening. 1e-5 = 0.001% of price (about 0.1 cent on a $100 stock).
// Broadening Formations enforce strict zero breach tolerance (Rob Smith Canon, Truth #3).
var BF_EPS_REL = 0.00001;
// Cycle window used when no explicit formation start is given (about one trading year of dailies).
var BF_DEFAULT_WINDOW = 260;
// Minimum number of bars between the two anchors of a ray.
var BF_MIN_SPAN = 2;
// Memoised computeActiveBroadening results kept per Model.js instance (charts repaint often).
var BF_CACHE_LIMIT = 128;

function bfExtreme(candle, isUpper) {
  return Number(isUpper ? candle.high : candle.low);
}

function bfAnchor(candles, idx, isUpper) {
  var c = candles[idx];
  return { index: idx, price: bfExtreme(c, isUpper), date: candleDateIso(c), time: c.time || c.timestamp };
}

// Boundary ray of a formation that starts at startIdx, drawn TheStrat-style: from the most
// extreme swing high (or low) since the start, right to left, back to the earlier swing high
// (low) that keeps every high (low) of the formation on or under (over) the line.
//
// Runs in "q-space" (q = +high for the upper ray, -low for the lower ray) so one upper-hull
// routine serves both sides. For a fixed anchor2, anchor1 = j is valid iff j is a swing point
// and every bar in the formation [startIdx, a2) stays on or under the line, which reduces to
//   slope(j) <= min over k in [startIdx, a2) of (q[a2] - q[k] + eps) / (a2 - k)
// and is tracked as a running minimum while walking j right to left: O(n) per anchor2,
// O(n^2) per call (was O(n^3)).
function computeRayForOrigin(candles, startIdx, endIdx, isUpper, minSpan) {
  minSpan = (typeof minSpan === "number") ? minSpan : BF_MIN_SPAN;
  var n = endIdx;
  if (n - startIdx <= minSpan) return null;
  var dir = isUpper ? 1 : -1;

  var q = [];
  for (var qi = 0; qi < n; qi++) {
    q.push(qi >= startIdx ? dir * bfExtreme(candles[qi], isUpper) : NaN);
  }

  var bestA1 = -1;
  var bestA2 = -1;
  var bestSlopeQ = 0;

  for (var a2 = startIdx + minSpan; a2 < n; a2++) {
    var p2 = q[a2];
    // anchor2 must be a swing extreme: at least as extreme as both neighbours
    if (p2 < q[a2 - 1]) continue;
    if (a2 < n - 1 && p2 < q[a2 + 1]) continue;
    // The winner is the most extreme anchor2 (latest on ties), so a less extreme one cannot win
    if (bestA2 !== -1 && p2 < q[bestA2]) continue;

    var eps = BF_EPS_REL * Math.abs(p2);
    var ceiling = Infinity;
    for (var m0 = a2 - 1; m0 > a2 - minSpan; m0--) {
      ceiling = Math.min(ceiling, (p2 - q[m0] + eps) / (a2 - m0));
    }

    // Flattest valid line; earliest anchor1 on ties. Broadening: anchor2 must be at least as
    // extreme as anchor1 (within eps), i.e. the boundary never tilts back inward, and anchor1
    // must be a swing point (at least as extreme as its right neighbour j + 1).
    var a1 = -1;
    var slopeQ = Infinity;
    for (var j = a2 - minSpan; j >= startIdx; j--) {
      var m = (p2 - q[j]) / (a2 - j);
      if (q[j] >= q[j + 1] - eps && p2 - q[j] >= -eps && m <= ceiling && m <= slopeQ) {
        slopeQ = m;
        a1 = j;
      }
      ceiling = Math.min(ceiling, (p2 - q[j] + eps) / (a2 - j));
    }
    // Every bar of the formation before anchor1 [startIdx, a1) must also stay on or under the line
    if (a1 === -1 || slopeQ > ceiling) continue;

    // No later bar may have traded through the finished ray (Zero Breach Tolerance: Truth #3)
    var breached = false;
    for (var post = a2 + 1; post < n; post++) {
      if (q[post] > p2 + slopeQ * (post - a2) + BF_EPS_REL * Math.abs(q[post])) {
        breached = true;
        break;
      }
    }
    if (breached) continue;

    bestA1 = a1;
    bestA2 = a2;
    bestSlopeQ = slopeQ;
  }

  if (bestA2 === -1) return null;
  return {
    anchor1: bfAnchor(candles, bestA1, isUpper),
    anchor2: bfAnchor(candles, bestA2, isUpper),
    slope: dir * bestSlopeQ,
    span: bestA2 - bestA1
  };
}

// A ray is superseded when a ray with a later anchor2, starting at or before it, expanded the
// same boundary further (a higher high for the upper side, a lower low for the lower side).
function isRaySuperseded(ray, rays, isUpper) {
  for (var i = 0; i < rays.length; i++) {
    var other = rays[i];
    if (!other || other === ray) continue;
    if (other.anchor2.index <= ray.anchor2.index) continue;
    if (other.anchor1.index > ray.anchor1.index) continue;
    if (isUpper ? other.anchor2.price >= ray.anchor2.price : other.anchor2.price <= ray.anchor2.price) {
      return true;
    }
  }
  return false;
}

function bfProject(ray, idx) {
  return ray ? ray.anchor1.price + ray.slope * (idx - ray.anchor1.index) : null;
}

// Collect first bar index of each trading day within [minIdx, maxIdx)
function bfDayStarts(candles, minIdx, maxIdx) {
  var starts = [];
  var lastD = "";
  for (var i = minIdx; i < maxIdx; i++) {
    var d = candleDateIso(candles[i]);
    if (d && d !== lastD) {
      starts.push(i);
      lastD = d;
    }
  }
  return starts;
}

// Collect first bar index of each calendar month within [minIdx, maxIdx)
function bfMonthStarts(candles, minIdx, maxIdx) {
  var starts = [];
  var lastM = "";
  for (var i = minIdx; i < maxIdx; i++) {
    var d = candleDateIso(candles[i]);
    var m = d ? d.slice(0, 7) : "";
    if (m && m !== lastM) {
      starts.push(i);
      lastM = m;
    }
  }
  return starts;
}

function candleWeekKey(candle) {
  if (!candle) return "";
  var ts = candle.timestamp || candle.time;
  if (!ts && candle.date) {
    var parts = String(candle.date).split("-");
    if (parts.length === 3) {
      var d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
      var day = d.getUTCDay();
      var diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
      var mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff));
      return mon.toISOString().slice(0, 10);
    }
    return "";
  }
  if (!ts) return "";
  var dt = new Date(ts > 1e11 ? ts : ts * 1000);
  var dayOfWeek = dt.getUTCDay();
  var diffToMon = dt.getUTCDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  var monday = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), diffToMon));
  return monday.toISOString().slice(0, 10);
}

// Collect first bar index of each calendar week within [minIdx, maxIdx)
function bfWeekStarts(candles, minIdx, maxIdx) {
  var starts = [];
  var lastW = "";
  for (var i = minIdx; i < maxIdx; i++) {
    var w = candleWeekKey(candles[i]);
    if (w && w !== lastW) {
      starts.push(i);
      lastW = w;
    }
  }
  return starts;
}

function candleQuarterKey(candle) {
  var d = candleDateIso(candle);
  if (!d || d.length < 7) return "";
  var y = d.slice(0, 4);
  var m = Number(d.slice(5, 7));
  if (!isFinite(m) || m < 1 || m > 12) return "";
  var q = Math.floor((m - 1) / 3) + 1;
  return y + "-Q" + q;
}

// Collect first bar index of each calendar quarter within [minIdx, maxIdx)
function bfQuarterStarts(candles, minIdx, maxIdx) {
  var starts = [];
  var lastQ = "";
  for (var i = minIdx; i < maxIdx; i++) {
    var q = candleQuarterKey(candles[i]);
    if (q && q !== lastQ) {
      starts.push(i);
      lastQ = q;
    }
  }
  return starts;
}

function candleYearKey(candle) {
  var d = candleDateIso(candle);
  return (d && d.length >= 4) ? d.slice(0, 4) : "";
}

// Collect first bar index of each calendar year within [minIdx, maxIdx)
function bfYearStarts(candles, minIdx, maxIdx) {
  var starts = [];
  var lastY = "";
  for (var i = minIdx; i < maxIdx; i++) {
    var y = candleYearKey(candles[i]);
    if (y && y !== lastY) {
      starts.push(i);
      lastY = y;
    }
  }
  return starts;
}

function bfPeriodKey(candle, anchorMode) {
  if (anchorMode === "day") return candleDateIso(candle);
  if (anchorMode === "week") return candleWeekKey(candle);
  if (anchorMode === "quarter") return candleQuarterKey(candle);
  if (anchorMode === "year") return candleYearKey(candle);
  var d = candleDateIso(candle);
  return d ? d.slice(0, 7) : "";
}

// A formation stays alive across subsequent periods until price hits the projected opposite
// boundary (target reached) or establishes a completely new higher-timeframe trend.
function isFormationAlive(fu, fl, candles, n, currentPeriodStartIdx) {
  if (!fu && !fl) return false;
  if (!fu || !fl) return true;

  var u2 = fu.anchor2.index;
  var l2 = fl.anchor2.index;

  // If latest extreme was at the lower boundary, the target was the upper boundary
  if (l2 > u2) {
    for (var t = l2 + 1; t < n; t++) {
      var projU = bfProject(fu, t);
      if (candles[t].high >= projU) {
        if (t < currentPeriodStartIdx) return false;
        return true;
      }
    }
  } else if (u2 > l2) {
    // If latest extreme was at the upper boundary, the target was the lower boundary
    for (var t = u2 + 1; t < n; t++) {
      var projL = bfProject(fl, t);
      if (candles[t].low <= projL) {
        if (t < currentPeriodStartIdx) return false;
        return true;
      }
    }
  }
  return true;
}

// One formation per start point: its upper and lower rays always come from the same start,
// so a formation's two lines describe the same triangle.
//   * Formations stay alive across subsequent periods until price hits the projected opposite boundary
//     (target reached) or establishes a completely new higher-timeframe trend.
//   * A boundary (anchor2) already drawn by an outer, earlier-starting formation is not drawn
//     again by a nested one; a nested formation that shares both extremes is the same triangle
//     and is dropped.
//   * Superseded rays are dropped (except for a pinned formation, see below).
//   * Formations are ordered outermost (earliest start) first, so index 0 is the major formation.
// pinFirst: origins[0] is an explicit formation start (e.g. bar replay); its rays are always kept.
// anchorMode: "week" (60m), "month" (1D), "quarter" (1W), or "year" (1M).
function buildBroadeningFormations(candles, origins, n, pinFirst, anchorMode) {
  var lastIdx = n - 1;
  var cands = [];
  var allU = [];
  var allL = [];

  var curPeriod = bfPeriodKey(candles[lastIdx], anchorMode);
  var curPeriodStartIdx = lastIdx;
  for (var pi = lastIdx; pi >= 0; pi--) {
    var pKey = bfPeriodKey(candles[pi], anchorMode);
    if (pKey && pKey !== curPeriod) {
      curPeriodStartIdx = pi + 1;
      break;
    }
  }

  for (var k = 0; k < origins.length; k++) {
    var o = origins[k];
    var u = computeRayForOrigin(candles, o, n, true);
    var l = computeRayForOrigin(candles, o, n, false);
    if (!u && !l) continue;
    var isPinned = pinFirst && k === 0;
    if (!isPinned && !isFormationAlive(u, l, candles, n, curPeriodStartIdx)) {
      continue;
    }
    cands.push({ originIndex: o, upper: u, lower: l, pinned: isPinned });
    if (u) allU.push(u);
    if (l) allL.push(l);
  }

  var drawnU = {};
  var drawnL = {};
  var formations = [];
  for (var ci = 0; ci < cands.length; ci++) {
    var c = cands[ci];
    var fu = c.upper;
    var fl = c.lower;
    if (!c.pinned) {
      if (fu && (drawnU[fu.anchor2.index] || isRaySuperseded(fu, allU, true))) fu = null;
      if (fl && (drawnL[fl.anchor2.index] || isRaySuperseded(fl, allL, false))) fl = null;
    }
    if (!fu && !fl) continue;
    if (fu) drawnU[fu.anchor2.index] = true;
    if (fl) drawnL[fl.anchor2.index] = true;
    formations.push({
      originIndex: c.originIndex,
      upper: fu,
      lower: fl,
      projectedUpper: bfProject(fu, lastIdx),
      projectedLower: bfProject(fl, lastIdx)
    });
  }
  return formations;
}

var _bfCache = { order: [], map: {} };

function bfCacheKey(candles, lookbackBars, anchorMode) {
  var n = candles.length;
  var first = candles[0];
  var mid = candles[Math.floor(n / 2)];
  var last = candles[n - 1];
  return [
    n, (typeof lookbackBars === "number") ? lookbackBars : "",
    anchorMode || "",
    first.timestamp || first.time, first.high, first.low,
    mid.high, mid.low,
    last.timestamp || last.time, last.high, last.low
  ].join("|");
}

// Active broadening formations for a candle series.
//   * 30m timeframe: uses daily (1D) anchors across the last 10 trading days ("day")
//   * 60m timeframe: uses weekly (1W) anchors ("week")
//   * 1D timeframe: uses monthly (1M) anchors ("month")
//   * 1W timeframe: uses quarterly (1Q) anchors ("quarter")
//   * 1M timeframe: uses yearly (1Y) anchors ("year")
// Formations stay alive across subsequent periods until price hits the projected opposite boundary
// (target reached) or establishes a completely new higher-timeframe trend.
// lookbackBars (optional): explicitly pins origin lookbackBars from the end (bar replay / tests).
// anchorMode (optional): "day", "week", "month", "quarter", or "year".
function computeActiveBroadening(candles, lookbackBars, anchorMode) {
  if (!candles || candles.length < 5) return null;

  var resolvedAnchorMode = anchorMode;
  if (resolvedAnchorMode !== "day" && resolvedAnchorMode !== "week" &&
      resolvedAnchorMode !== "month" && resolvedAnchorMode !== "quarter" &&
      resolvedAnchorMode !== "year") {
    resolvedAnchorMode = "month";
    if (candles.length >= 2) {
      var t0 = candles[0].timestamp || candles[0].time;
      var t1 = candles[1].timestamp || candles[1].time;
      var t2 = candles.length >= 3 ? (candles[2].timestamp || candles[2].time) : 0;
      if (t0 && t1) {
        var deltaSec = Math.abs(t1 - t0);
        if (t2) deltaSec = Math.max(deltaSec, Math.abs(t2 - t1));
        if (deltaSec > 0 && deltaSec <= 1800) {
          resolvedAnchorMode = "day";
        } else if (deltaSec > 1800 && deltaSec < 14400) {
          resolvedAnchorMode = "week";
        } else if (deltaSec >= 400000 && deltaSec < 1500000) {
          resolvedAnchorMode = "quarter";
        } else if (deltaSec >= 1500000) {
          resolvedAnchorMode = "year";
        }
      }
    }
  }

  var cacheKey = bfCacheKey(candles, lookbackBars, resolvedAnchorMode);
  if (Object.prototype.hasOwnProperty.call(_bfCache.map, cacheKey)) return _bfCache.map[cacheKey];

  var n = candles.length;
  var explicitStart = (typeof lookbackBars === "number" && lookbackBars >= 5);
  var defaultWindow = (resolvedAnchorMode === "day" || resolvedAnchorMode === "week") ? 500 : BF_DEFAULT_WINDOW;
  var startIdx = Math.max(0, n - (explicitStart ? lookbackBars : defaultWindow));

  var origins;
  if (explicitStart) {
    origins = [startIdx];
  } else if (resolvedAnchorMode === "day") {
    var allDayStarts = bfDayStarts(candles, startIdx, n);
    if (allDayStarts.length > 10) {
      origins = allDayStarts.slice(allDayStarts.length - 10);
    } else {
      origins = allDayStarts;
      if (origins.length === 0 || origins[0] !== startIdx) {
        origins.unshift(startIdx);
      }
    }
  } else if (resolvedAnchorMode === "week") {
    origins = bfWeekStarts(candles, startIdx, n);
    if (origins.length === 0 || origins[0] !== startIdx) {
      origins.unshift(startIdx);
    }
  } else if (resolvedAnchorMode === "quarter") {
    origins = bfQuarterStarts(candles, startIdx, n);
    if (origins.length === 0 || origins[0] !== startIdx) {
      origins.unshift(startIdx);
    }
  } else if (resolvedAnchorMode === "year") {
    origins = bfYearStarts(candles, startIdx, n);
    if (origins.length === 0 || origins[0] !== startIdx) {
      origins.unshift(startIdx);
    }
  } else {
    origins = bfMonthStarts(candles, startIdx, n);
    if (origins.length === 0 || origins[0] !== startIdx) {
      origins.unshift(startIdx);
    }
  }

  var formations = buildBroadeningFormations(candles, origins, n, explicitStart, resolvedAnchorMode);
  var major = formations.length > 0 ? formations[0] : null;
  var result = {
    originIndex: major ? major.originIndex : startIdx,
    formations: formations,
    major: major,
    minor: formations.length > 1 ? formations[1] : null,
    upper: major ? major.upper : null,
    lower: major ? major.lower : null,
    projectedUpper: major ? major.projectedUpper : null,
    projectedLower: major ? major.projectedLower : null
  };

  _bfCache.map[cacheKey] = result;
  _bfCache.order.push(cacheKey);
  while (_bfCache.order.length > BF_CACHE_LIMIT) {
    delete _bfCache.map[_bfCache.order.shift()];
  }
  return result;
}

var sectorBaskets = {
  "SMH": { symbol: "SMH", name: "VanEck Semiconductor ETF", holdingsFile: "SMH.json" },
  "XLK": { symbol: "XLK", name: "Technology Select Sector SPDR Fund", holdingsFile: "XLK.json" }
};

function getSectorInfo(symbol) {
  var sym = normalizeSymbol(symbol);
  return sectorBaskets[sym] || null;
}

// Named ticker sets usable in the Analysis SECTOR input via an "@" prefix
// (e.g. "@INDEX", "@SECTORS", "@ENERGY", "@INDEX,@SECTORS,SMH"). Plain tokens are never presets.
var TICKER_PRESETS = {
  "INDEX": { name: "Major Indexes", tickers: ["SPY", "QQQ", "IWM", "DIA"] },
  "SECTORS": { name: "GICS Sectors", tickers: ["XLE", "XLB", "XLI", "XLY", "XLP", "XLV", "XLF", "XLK", "XLC", "XLU", "XLRE"] },
  "ENERGY": { name: "Energy", tickers: ["XLE", "XOP", "OIH", "XOM", "CVX", "OXY"] },
  "MARKET": { name: "Indexes + Sectors", include: ["INDEX", "SECTORS"] }
};
var TICKER_PRESET_ALIASES = { "I": "INDEX", "INDEXES": "INDEX", "S": "SECTORS", "SECTOR": "SECTORS", "E": "ENERGY", "M": "MARKET" };

function isPresetToken(token) {
  return normalizeSymbol(token).charAt(0) === "@";
}

function presetKeyForToken(token) {
  var s = normalizeSymbol(token);
  if (s.charAt(0) !== "@") return null;
  var key = s.slice(1).replace(/^\s+/, "");
  if (TICKER_PRESET_ALIASES[key]) key = TICKER_PRESET_ALIASES[key];
  return TICKER_PRESETS[key] ? key : null;
}

function resolveTickerPreset(token) {
  var key = presetKeyForToken(token);
  if (!key) return null;
  var preset = TICKER_PRESETS[key];
  var out = [];
  var src = preset.tickers || [];
  if (preset.include) {
    src = [];
    for (var i = 0; i < preset.include.length; i++) {
      var sub = TICKER_PRESETS[preset.include[i]];
      if (sub && sub.tickers) src = src.concat(sub.tickers);
    }
  }
  for (var j = 0; j < src.length; j++) {
    if (out.indexOf(src[j]) === -1) out.push(src[j]);
  }
  return out;
}

function parseSectorTickers(symbolString) {
  if (!symbolString || typeof symbolString !== "string") return [];
  var parts = symbolString.split(",");
  var res = [];
  for (var i = 0; i < parts.length; i++) {
    var s = normalizeSymbol(parts[i]);
    if (s.charAt(0) === "@") {
      var expanded = resolveTickerPreset(s) || [];
      for (var k = 0; k < expanded.length; k++) {
        if (res.indexOf(expanded[k]) === -1) res.push(expanded[k]);
      }
      continue;
    }
    if (s.length > 0 && res.indexOf(s) === -1) {
      res.push(s);
    }
  }
  return res;
}

// Normalized raw input preserving preset tokens, e.g. " @index , smh " -> "@INDEX,SMH".
// Unknown presets and empty tokens are dropped.
function normalizeSectorInput(symbolString) {
  if (!symbolString || typeof symbolString !== "string") return "";
  var parts = symbolString.split(",");
  var res = [];
  for (var i = 0; i < parts.length; i++) {
    var s = normalizeSymbol(parts[i]);
    if (s.charAt(0) === "@") {
      var key = presetKeyForToken(s);
      if (!key) continue;
      s = "@" + key;
    }
    if (s.length > 0 && res.indexOf(s) === -1) res.push(s);
  }
  return res.join(",");
}

// Human label for inputs containing presets, e.g. "Major Indexes + SMH"; null when no preset is used.
function describeSectorInput(symbolString) {
  if (!symbolString || typeof symbolString !== "string") return null;
  var parts = normalizeSectorInput(symbolString).split(",");
  var labels = [];
  var hasPreset = false;
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    if (!p) continue;
    if (p.charAt(0) === "@") {
      hasPreset = true;
      labels.push(TICKER_PRESETS[p.slice(1)].name);
    } else {
      labels.push(p);
    }
  }
  return hasPreset ? labels.join(" + ") : null;
}

function extractSymbols(items) {
  if (!items || !items.length) return [];
  var out = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var raw = (it && typeof it === "object") ? it.symbol : it;
    var sym = normalizeSymbol(raw);
    if (sym.length > 0 && out.indexOf(sym) === -1) {
      out.push(sym);
    }
  }
  return out;
}

function formatTickerList(items, separator) {
  var sep = (separator !== undefined) ? separator : ", ";
  var syms = extractSymbols(items);
  return syms.join(sep);
}

function parseScenarioQuery(query) {
  if (!query || typeof query !== "string") return [];
  var trimmed = query.trim();
  if (!trimmed) return [];
  var clauses = trimmed.split(",");
  var result = [];
  for (var i = 0; i < clauses.length; i++) {
    var raw = clauses[i].trim();
    if (!raw) continue;
    var parts = raw.split(/\s+/).filter(function(t) { return t.length > 0; });
    var tokens = [];
    for (var j = 0; j < parts.length; j++) {
      var tok = parts[j].toLowerCase();
      if ((tok === "!" || tok === "-") && j + 1 < parts.length) {
        tokens.push(tok + parts[j + 1].toLowerCase());
        j++;
      } else {
        tokens.push(tok);
      }
    }
    if (tokens.length > 0) {
      result.push(tokens);
    }
  }
  return result;
}

function buildSingleBarDescriptor(cCur, cPrev) {
  var open = Number(cCur.open);
  var close = Number(cCur.close);
  var prevHigh = Number(cPrev.high);
  var prevLow = Number(cPrev.low);
  var sc = stratScenario(cCur, cPrev);
  var baseSc = (sc === "2u" || sc === "2d") ? "2" : sc;
  var isGreen = close >= open;
  var isRed = close < open;
  var inForce = false;
  if (sc === "2u" && close >= prevHigh) inForce = true;
  if (sc === "2d" && close <= prevLow) inForce = true;
  var shapeInfo = detectCandleShape(cCur, cPrev);
  return {
    sc: sc,
    baseSc: baseSc,
    isGreen: isGreen,
    isRed: isRed,
    inForce: inForce,
    shapeInfo: shapeInfo
  };
}

function buildScenarioContext(candles, quote, maxLookbackBars) {
  if (!isArrayLike(candles) || candles.length < 2) return null;

  var n = candles.length;
  var cLast = Object.assign({}, candles[n - 1]);

  var livePx = stratLivePrice(quote);
  if (livePx !== null && isFinite(livePx)) {
    cLast.close = livePx;
    if (cLast.high === null || livePx > cLast.high) cLast.high = livePx;
    if (cLast.low === null || livePx < cLast.low) cLast.low = livePx;
  }

  var startIdx = 1;
  if (typeof maxLookbackBars === "number" && isFinite(maxLookbackBars) && maxLookbackBars > 0) {
    var needed = Math.max(3, Math.floor(maxLookbackBars));
    startIdx = Math.max(1, n - needed);
  }

  var bars = [];
  for (var i = startIdx; i < n; i++) {
    var curCandle = (i === n - 1) ? cLast : candles[i];
    bars.push(buildSingleBarDescriptor(curCandle, candles[i - 1]));
  }

  var lastBar = bars[bars.length - 1];
  var prevBar = bars.length >= 2 ? bars[bars.length - 2] : null;
  var p2Bar = bars.length >= 3 ? bars[bars.length - 3] : null;

  return {
    sc: lastBar.sc,
    scPrev: prevBar ? prevBar.sc : null,
    scP2: p2Bar ? p2Bar.sc : null,
    baseSc: lastBar.baseSc,
    basePrev: prevBar ? prevBar.baseSc : null,
    baseP2: p2Bar ? p2Bar.baseSc : null,
    isGreen: lastBar.isGreen,
    isRed: lastBar.isRed,
    inForce: lastBar.inForce,
    shapeInfo: lastBar.shapeInfo,
    shapePrev: prevBar ? prevBar.shapeInfo : null,
    bars: bars
  };
}

var ATOMIC_BAR_PREFIX_REGEX = /^(f2u|f2d|f2|2u|2d|1|2|3|inside|outside)?(.*)$/;
var ATOMIC_BAR_MODIFIER_REGEX = /^(green|red|hammer|shooter|inforce|if|[grhs])/;

function parseAtomicBarStep(rawStep) {
  if (!rawStep || typeof rawStep !== "string") return null;
  var s = rawStep;
  var negated = false;
  if (s.charAt(0) === "!") {
    negated = true;
    s = s.substring(1);
  }
  if (!s) return null;

  var m = s.match(ATOMIC_BAR_PREFIX_REGEX);
  if (!m) return null;
  var reqSc = m[1] || null;
  var rest = m[2] || "";

  var spec = {
    negated: negated,
    reqSc: reqSc,
    reqGreen: false,
    reqRed: false,
    reqHammer: false,
    reqShooter: false,
    reqInForce: false
  };

  var hasModifier = false;
  while (rest.length > 0) {
    var modMatch = rest.match(ATOMIC_BAR_MODIFIER_REGEX);
    if (!modMatch) return null;
    var mod = modMatch[1];
    hasModifier = true;
    if (mod === "g" || mod === "green") spec.reqGreen = true;
    else if (mod === "r" || mod === "red") spec.reqRed = true;
    else if (mod === "h" || mod === "hammer") spec.reqHammer = true;
    else if (mod === "s" || mod === "shooter") spec.reqShooter = true;
    else if (mod === "if" || mod === "inforce") spec.reqInForce = true;
    rest = rest.substring(mod.length);
  }

  if (!reqSc && !hasModifier) return null;
  return spec;
}

function matchBarDescriptor(bar, spec) {
  if (!bar || !spec) return false;
  var matched = true;

  if (spec.reqSc) {
    if (spec.reqSc === "1" || spec.reqSc === "inside") {
      if (bar.sc !== "1") matched = false;
    } else if (spec.reqSc === "3" || spec.reqSc === "outside") {
      if (bar.sc !== "3") matched = false;
    } else if (spec.reqSc === "2") {
      if (bar.baseSc !== "2") matched = false;
    } else if (spec.reqSc === "2u" || spec.reqSc === "2d") {
      if (bar.sc !== spec.reqSc) matched = false;
    } else if (spec.reqSc === "f2u") {
      if (bar.sc !== "2u" || !bar.isRed) matched = false;
    } else if (spec.reqSc === "f2d") {
      if (bar.sc !== "2d" || !bar.isGreen) matched = false;
    } else if (spec.reqSc === "f2") {
      if (!((bar.sc === "2u" && bar.isRed) || (bar.sc === "2d" && bar.isGreen))) matched = false;
    }
  }

  if (matched && spec.reqGreen && !bar.isGreen) matched = false;
  if (matched && spec.reqRed && !bar.isRed) matched = false;
  if (matched && spec.reqInForce && !bar.inForce) matched = false;
  if (matched && spec.reqHammer && !(bar.shapeInfo && bar.shapeInfo.isHammer)) matched = false;
  if (matched && spec.reqShooter && !(bar.shapeInfo && bar.shapeInfo.isShooter)) matched = false;

  return spec.negated ? !matched : matched;
}

function matchSingleScenarioToken(ctx, t) {
  if (!ctx || !t || typeof t !== "string") return null;

  // Canonical domain aliases
  if (t === "revstrat") return (ctx.basePrev === "1" && ctx.sc === "3") || (ctx.basePrev === "3" && ctx.baseSc === "2");
  if (t === "2-1-2" && ctx.baseP2 === null) return ctx.basePrev === "1" && ctx.baseSc === "2";
  if (t === "2-1-2u" && ctx.baseP2 === null) return ctx.basePrev === "1" && ctx.sc === "2u";
  if (t === "2-1-2d" && ctx.baseP2 === null) return ctx.basePrev === "1" && ctx.sc === "2d";
  if (t === "1-3-2") {
    if (ctx.basePrev !== "3" || ctx.baseSc !== "2" || ctx.baseP2 !== "1") return false;
    if (!ctx.shapePrev) return false;
    if (ctx.sc === "2u" && !ctx.shapePrev.isHammer) return false;
    if (ctx.sc === "2d" && !ctx.shapePrev.isShooter) return false;
    return true;
  }

  var rawParts = t.split("-");
  var specs = [];
  for (var i = 0; i < rawParts.length; i++) {
    if (!rawParts[i]) return null;
    var spec = parseAtomicBarStep(rawParts[i]);
    if (!spec) return null;
    specs.push(spec);
  }

  var bars = ctx.bars;
  if (!bars) {
    bars = [];
    if (ctx.scP2) bars.push({ sc: ctx.scP2, baseSc: ctx.baseP2 });
    if (ctx.scPrev) bars.push({ sc: ctx.scPrev, baseSc: ctx.basePrev, shapeInfo: ctx.shapePrev });
    if (ctx.sc) bars.push({ sc: ctx.sc, baseSc: ctx.baseSc, isGreen: ctx.isGreen, isRed: ctx.isRed, inForce: ctx.inForce, shapeInfo: ctx.shapeInfo });
  }

  var k = specs.length;
  if (bars.length < k) return false;

  var startIdx = bars.length - k;
  for (var j = 0; j < k; j++) {
    if (!matchBarDescriptor(bars[startIdx + j], specs[j])) {
      return false;
    }
  }
  return true;
}

function evaluateScenarioToken(ctx, token) {
  if (!ctx || !token) return false;
  var isNegated = false;
  var raw = token;
  if (raw.charAt(0) === "!" || raw.charAt(0) === "-") {
    isNegated = true;
    raw = raw.substring(1);
  }
  if (!raw) return false;

  var res = matchSingleScenarioToken(ctx, raw);
  if (res === null) return false;
  return isNegated ? !res : res;
}

function scenarioLookbackForTokens(tokens) {
  var maxK = 3;
  if (!tokens) return maxK;
  for (var i = 0; i < tokens.length; i++) {
    var raw = String(tokens[i] || "");
    if (raw.charAt(0) === "!" || raw.charAt(0) === "-") raw = raw.substring(1);
    if (!raw) continue;
    var parts = raw.split("-");
    if (parts.length > maxK) maxK = parts.length;
  }
  return maxK;
}

function matchesScenarioTokens(candles, quote, tokens, prebuiltCtx) {
  if (!tokens || tokens.length === 0) return true;
  var ctx = prebuiltCtx || buildScenarioContext(candles, quote, scenarioLookbackForTokens(tokens));
  if (!ctx) return false;

  for (var i = 0; i < tokens.length; i++) {
    if (!evaluateScenarioToken(ctx, tokens[i])) {
      return false;
    }
  }
  return true;
}

function isPureExclusionClause(tokens) {
  if (!tokens || tokens.length === 0) return false;
  for (var i = 0; i < tokens.length; i++) {
    var c = tokens[i].charAt(0);
    if (c !== "!" && c !== "-") return false;
  }
  return true;
}

function matchesScenarioQuery(candles, quote, query) {
  var clauses = parseScenarioQuery(query);
  if (clauses.length === 0) return true;

  var maxLookback = 3;
  var inclusionClauses = [];
  var exclusionClauses = [];
  for (var i = 0; i < clauses.length; i++) {
    var k = scenarioLookbackForTokens(clauses[i]);
    if (k > maxLookback) maxLookback = k;
    if (isPureExclusionClause(clauses[i])) {
      exclusionClauses.push(clauses[i]);
    } else {
      inclusionClauses.push(clauses[i]);
    }
  }

  // Build context ONCE per symbol across all clauses (and only for the trailing maxLookback bars)
  var ctx = buildScenarioContext(candles, quote, maxLookback);
  if (!ctx) return false;

  for (var e = 0; e < exclusionClauses.length; e++) {
    if (!matchesScenarioTokens(candles, quote, exclusionClauses[e], ctx)) {
      return false;
    }
  }

  if (inclusionClauses.length === 0) return true;

  for (var p = 0; p < inclusionClauses.length; p++) {
    if (matchesScenarioTokens(candles, quote, inclusionClauses[p], ctx)) {
      return true;
    }
  }
  return false;
}

function sortSectorHoldings(holdings, sortField, sortDirection, quotesMap) {
  if (!isArrayLike(holdings)) return [];
  var list = toArray(holdings).slice();
  var field = (sortField || "weight").toLowerCase();
  var isAsc = (sortDirection || "desc").toLowerCase() === "asc";
  var sign = isAsc ? 1 : -1;

  list.sort(function(a, b) {
    if (field === "weight") {
      var wa = Number(a.pctVal || a.weight || 0);
      var wb = Number(b.pctVal || b.weight || 0);
      if (wa !== wb) return (wa - wb) * sign;
    } else if (field === "mcap" || field === "market cap") {
      var ma = Number(a.valUSD || a.marketCap || 0);
      var mb = Number(b.valUSD || b.marketCap || 0);
      if (ma !== mb) return (ma - mb) * sign;
    } else if (field === "price") {
      var qa = quotesMap ? quotesMap[a.symbol] : null;
      var qb = quotesMap ? quotesMap[b.symbol] : null;
      var pa = stratLivePrice(qa) || Number(qa && qa.regularMarketPrice) || 0;
      var pb = stratLivePrice(qb) || Number(qb && qb.regularMarketPrice) || 0;
      if (pa !== pb) return (pa - pb) * sign;
    } else if (field === "change" || field === "change %") {
      var qa2 = quotesMap ? quotesMap[a.symbol] : null;
      var qb2 = quotesMap ? quotesMap[b.symbol] : null;
      var ca = qa2 ? finiteOrNull(qa2.regularMarketChangePercent) : null;
      if (ca === null && qa2) ca = finiteOrNull(qa2.changePercent);
      if (ca === null && qa2) ca = finiteOrNull(qa2.regularChangePercent);
      if (ca === null) ca = 0;
      var cb = qb2 ? finiteOrNull(qb2.regularMarketChangePercent) : null;
      if (cb === null && qb2) cb = finiteOrNull(qb2.changePercent);
      if (cb === null && qb2) cb = finiteOrNull(qb2.regularChangePercent);
      if (cb === null) cb = 0;
      if (ca !== cb) return (ca - cb) * sign;
    } else if (field === "atr" || field === "atr %") {
      var aa = Number(a.atrPercent || 0);
      var ab = Number(b.atrPercent || 0);
      if (aa !== ab) return (aa - ab) * sign;
    }
    return String(a.symbol || "").localeCompare(String(b.symbol || ""));
  });

  return list;
}

function cacheKey(symbol, rangeKey) {
  var s = String(symbol || "").trim().toUpperCase();
  var r = String(rangeKey || "1D").trim();
  return s + "_" + r;
}

function isBasketSector(symbol) {
  var s = normalizeSymbol(symbol);
  return Boolean(sectorBaskets[s]);
}

function chunkSymbols(symbols, chunkSize) {
  var size = Math.max(1, parseInt(chunkSize, 10) || 20);
  var list = isArrayLike(symbols) ? toArray(symbols).slice() : [];
  var chunks = [];
  for (var i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size));
  }
  return chunks;
}

function marketDateEt(timestampSec) {
  var utcMs = (timestampSec != null && isFinite(timestampSec)) ? (timestampSec * 1000) : Date.now();
  var offsetMs = (isUsDstUtc(utcMs) ? -4 : -5) * 3600000;
  var et = new Date(utcMs + offsetMs);
  var m = et.getUTCMonth() + 1;
  var day = et.getUTCDate();
  return et.getUTCFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
}

function marketWeekStartEt(timestampSec) {
  var utcMs = (timestampSec != null && isFinite(timestampSec)) ? (timestampSec * 1000) : Date.now();
  var offsetMs = (isUsDstUtc(utcMs) ? -4 : -5) * 3600000;
  var et = new Date(utcMs + offsetMs);
  var day = et.getUTCDay();
  var diffToMon = et.getUTCDate() - day + (day === 0 ? -6 : 1);
  var mon = new Date(Date.UTC(et.getUTCFullYear(), et.getUTCMonth(), diffToMon));
  var m = mon.getUTCMonth() + 1;
  var d = mon.getUTCDate();
  return mon.getUTCFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (d < 10 ? "0" : "") + d;
}

function isUsEquitySessionSymbol(symbol) {
  var sym = normalizeSymbol(symbol);
  if (!sym || isCryptoSymbol(sym)) return false;
  if (sym.indexOf(".") !== -1) {
    var parts = sym.split(".");
    var sfx = parts[parts.length - 1].toUpperCase();
    if (sfx !== "TO" && sfx !== "V") return false;
  }
  return true;
}

function isCandleSeriesStale(candles, symbol, rangeKey, nowDate, fetchedAtMs) {
  if (!isArrayLike(candles) || candles.length === 0) return true;
  var last = candles[candles.length - 1];
  if (!last || !isFinite(last.timestamp)) return true;

  var now = (nowDate instanceof Date && isFinite(nowDate.getTime())) ? nowDate : new Date();
  var nowMs = now.getTime();
  var nowSec = Math.floor(nowMs / 1000);
  var lastTs = Number(last.timestamp);
  var sym = normalizeSymbol(symbol);
  var tf = String(rangeKey || "1D");
  var isIntraday = (tf === "1" || tf === "5" || tf === "15" || tf === "30" || tf === "60" || tf === "60m");
  var tfNorm = tf === "60m" ? "60" : tf;

  if (isCryptoSymbol(sym)) {
    if (isIntraday) {
      var cPeriod = tfNorm === "60" ? 3600 : (tfNorm === "30" ? 1800 : (tfNorm === "15" ? 900 : (tfNorm === "5" ? 300 : 60)));
      return nowSec >= lastTs + cPeriod;
    }
    if (tf === "1D" || tf === "D" || tf === "1d" || tf === "day") {
      return new Date(nowSec * 1000).toISOString().slice(0, 10) !== new Date(lastTs * 1000).toISOString().slice(0, 10);
    }
    var cFetched = finiteOrNull(fetchedAtMs);
    if (cFetched !== null && cFetched > 0 && (nowMs - cFetched) < 300000) return false;
    return (nowSec - lastTs) >= 86400;
  }

  var sched = getUsSessionSchedule(now);
  var rthOpen = sched.isSessionOpen;
  var fetchedMs = finiteOrNull(fetchedAtMs);
  if (fetchedMs !== null && fetchedMs > 0 && (nowMs - fetchedMs) < 60000) {
    if (isUsMarketOpen(new Date(fetchedMs), false) === rthOpen && !isIntraday) {
      return false;
    }
  }

  var curEt = marketDateEt(nowSec);
  var lastEt = marketDateEt(lastTs);

  if (rthOpen) {
    if (isIntraday) {
      if (lastEt !== curEt) return true;
      var periodSec = tfNorm === "60"
        ? candleDurationSec(last, "60", sym, now, null)
        : (tfNorm === "30" ? 1800 : (tfNorm === "15" ? 900 : (tfNorm === "5" ? 300 : 60)));
      return nowSec >= lastTs + periodSec;
    }
    if (tf === "1D" || tf === "D" || tf === "1d" || tf === "day") {
      return lastEt !== curEt;
    }
    if (tf === "1W" || tf === "W" || tf === "1w" || tf === "week") {
      if (marketWeekStartEt(lastTs) !== marketWeekStartEt(nowSec)) return true;
    } else if (tf === "1M" || tf === "M") {
      if (lastEt.slice(0, 7) !== curEt.slice(0, 7)) return true;
    } else if (tf === "1Y" || tf === "Y") {
      if (lastEt.slice(0, 4) !== curEt.slice(0, 4)) return true;
    }
    // For 1W/1M/1Y (whose bar timestamp is Monday / 1st / Jan 1), require at least one live fetch during today's RTH.
    if (fetchedMs === null || fetchedMs <= 0) return true;
    if (marketDateEt(fetchedMs / 1000) !== curEt) return true;
    if (!isUsMarketOpen(new Date(fetchedMs), false)) return true;
    return false;
  }

  // Outside RTH on a weekday after market close: stale if missing today's regular session
  if (!sched.isWeekend && sched.mins >= sched.closeMins) {
    if (isIntraday || tf === "1D" || tf === "D" || tf === "1d" || tf === "day") {
      return lastEt < curEt;
    }
    if (fetchedMs !== null && fetchedMs > 0 && marketDateEt(fetchedMs / 1000) === curEt) {
      var fetchedSched = getUsSessionSchedule(new Date(fetchedMs));
      if (fetchedSched.mins >= sched.closeMins) return false;
    }
    if (tf === "1W" || tf === "W" || tf === "1w" || tf === "week") {
      return marketWeekStartEt(lastTs) < marketWeekStartEt(nowSec);
    }
    if (tf === "1M" || tf === "M") {
      return lastEt.slice(0, 7) < curEt.slice(0, 7);
    }
    if (tf === "1Y" || tf === "Y") {
      return lastEt.slice(0, 4) < curEt.slice(0, 4);
    }
  }

  return false;
}

function updateDevelopingCandle(candles, quote, rangeKey, nowDate) {
  if (!isArrayLike(candles) || candles.length === 0) return candles || [];
  if (!quote) return candles;

  // Suspend developing candle mutations during extended hours (pre/post market) or closed sessions.
  // Regular trading hours candlestick bars must remain pure RTH data, delegating pre/post action
  // exclusively to the extendedPrice horizontal line and scale badge.
  if (quote.session && quote.session !== "regular" && quote.session !== "live") {
    return candles;
  }

  var rawPrice = quote.regularPrice != null ? quote.regularPrice : (quote.regularMarketPrice != null ? quote.regularMarketPrice : (quote.price != null ? quote.price : null));
  var price = finiteOrNull(rawPrice);
  if (price === null) return candles;

  var list = toArray(candles).slice();
  var lastIdx = list.length - 1;
  var last = Object.assign({}, list[lastIdx]);
  var range = String(rangeKey || "1D");
  var now = (nowDate instanceof Date) ? nowDate : new Date();
  var nowSec = Math.floor(now.getTime() / 1000);

  if (range === "1D" || range === "D" || range === "1d" || range === "day") {
    var curEt = marketDateEt(nowSec);
    var lastEt = marketDateEt(last.timestamp);
    if (curEt !== lastEt && nowSec > last.timestamp) {
      list.push({
        timestamp: nowSec,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 0
      });
      lastIdx = list.length - 1;
      last = Object.assign({}, list[lastIdx]);
    }
  } else if (range === "1W" || range === "W" || range === "1w" || range === "week") {
    var curWeek = marketWeekStartEt(nowSec);
    var lastWeek = marketWeekStartEt(last.timestamp);
    if (curWeek !== lastWeek && nowSec > last.timestamp) {
      list.push({
        timestamp: nowSec,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 0
      });
      lastIdx = list.length - 1;
      last = Object.assign({}, list[lastIdx]);
    }
  } else if (range === "1M" || range === "M") {
    var curMonth = marketDateEt(nowSec).slice(0, 7);
    var lastMonth = marketDateEt(last.timestamp).slice(0, 7);
    if (curMonth !== lastMonth && nowSec > last.timestamp) {
      list.push({
        timestamp: nowSec,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 0
      });
      lastIdx = list.length - 1;
      last = Object.assign({}, list[lastIdx]);
    }
  } else if (range === "1Y" || range === "Y") {
    var curYear = marketDateEt(nowSec).slice(0, 4);
    var lastYear = marketDateEt(last.timestamp).slice(0, 4);
    if (curYear !== lastYear && nowSec > last.timestamp) {
      list.push({
        timestamp: nowSec,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 0
      });
      lastIdx = list.length - 1;
      last = Object.assign({}, list[lastIdx]);
    }
  } else if (range === "60" || range === "60m" || range === "30" || range === "15" || range === "5" || range === "1") {
    var tfNorm = range === "60m" ? "60" : range;
    var periodSec = tfNorm === "60"
      ? candleDurationSec(last, "60", quote.symbol, now, quote)
      : (tfNorm === "30" ? 1800 : (tfNorm === "15" ? 900 : (tfNorm === "5" ? 300 : 60)));
    if (nowSec >= last.timestamp + periodSec) {
      var alignedTs;
      if (tfNorm === "60" && isUsEquitySessionSymbol(quote.symbol)) {
        var sched = getUsSessionSchedule(now, quote);
        var openSec = nowSec - (sched.mins - sched.openMins) * 60 - now.getUTCSeconds();
        if (!sched.isWeekend && sched.mins >= sched.openMins - 2) {
          alignedTs = openSec + Math.max(0, Math.floor((nowSec - openSec) / 3600)) * 3600;
        } else {
          alignedTs = Math.floor(nowSec / 3600) * 3600;
        }
      } else {
        alignedTs = Math.floor(nowSec / periodSec) * periodSec;
      }
      if (alignedTs > last.timestamp) {
        list.push({
          timestamp: alignedTs,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: 0
        });
        lastIdx = list.length - 1;
        last = Object.assign({}, list[lastIdx]);
      }
    }
  }

  last.close = price;
  if (last.high !== null && isFinite(last.high)) {
    last.high = Math.max(last.high, price);
  } else {
    last.high = price;
  }
  if (last.low !== null && isFinite(last.low)) {
    last.low = Math.min(last.low, price);
  } else {
    last.low = price;
  }

  if (range === "1D" || range === "D" || range === "1d" || range === "day") {
    var qTs = finiteOrNull(quote.timestamp);
    var quoteMatchesToday = (qTs === null) || (marketDateEt(qTs) === marketDateEt(nowSec));
    if (quoteMatchesToday) {
      var dHigh = finiteOrNull(quote.regularMarketDayHigh != null ? quote.regularMarketDayHigh : quote.dayHigh);
      var dLow = finiteOrNull(quote.regularMarketDayLow != null ? quote.regularMarketDayLow : quote.dayLow);
      if (dHigh !== null) last.high = Math.max(last.high, dHigh);
      if (dLow !== null) last.low = Math.min(last.low, dLow);
    }
  }

  list[lastIdx] = last;
  return list;
}

function parseColorRgb(c) {
  if (!c) return { r: 0, g: 0, b: 0 };
  if (typeof c === "string") {
    var s = c.trim();
    var m6 = s.match(/^#([0-9a-fA-F]{2})?([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
    if (m6) {
      // #RRGGBB (m6[1] undefined) or #AARRGGBB (m6[1] is AA)
      return {
        r: parseInt(m6[2], 16) / 255,
        g: parseInt(m6[3], 16) / 255,
        b: parseInt(m6[4], 16) / 255
      };
    }
    var m3 = s.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/);
    if (m3) {
      return {
        r: parseInt(m3[1] + m3[1], 16) / 255,
        g: parseInt(m3[2] + m3[2], 16) / 255,
        b: parseInt(m3[3] + m3[3], 16) / 255
      };
    }
  }
  if (typeof c.r === "number" && typeof c.g === "number" && typeof c.b === "number") {
    return {
      r: Math.max(0, Math.min(1, c.r)),
      g: Math.max(0, Math.min(1, c.g)),
      b: Math.max(0, Math.min(1, c.b))
    };
  }
  return { r: 0, g: 0, b: 0 };
}

function rgbToHex(r, g, b) {
  function hexByte(v) {
    var n = Math.max(0, Math.min(255, Math.round(v * 255)));
    var h = n.toString(16);
    return h.length < 2 ? "0" + h : h;
  }
  return "#" + hexByte(r) + hexByte(g) + hexByte(b);
}

function relativeLuminance(color) {
  var rgb = parseColorRgb(color);
  function chan(c) {
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return 0.2126 * chan(rgb.r) + 0.7152 * chan(rgb.g) + 0.0722 * chan(rgb.b);
}

function contrastRatio(c1, c2) {
  var l1 = relativeLuminance(c1);
  var l2 = relativeLuminance(c2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function isLightColor(color) {
  return relativeLuminance(color) > 0.4;
}

function accessibleSemanticColor(tone, bgColor) {
  var lightBg = isLightColor(bgColor);
  if (tone === "up" || tone === "success") return lightBg ? "#136f3a" : "#4ade80";
  if (tone === "down" || tone === "error") return lightBg ? "#b91c1c" : "#f87171";
  if (tone === "warning") return lightBg ? "#92400e" : "#fbbf24";
  if (tone === "info") return lightBg ? "#1d4ed8" : "#60a5fa";
  return lightBg ? "#475569" : "#94a3b8";
}

function accessibleDimColor(fgColor, bgColor) {
  var fg = parseColorRgb(fgColor);
  var bg = parseColorRgb(bgColor);
  var weight = 0.72;
  for (var step = 0; step < 6; step++) {
    var mixed = {
      r: fg.r * weight + bg.r * (1 - weight),
      g: fg.g * weight + bg.g * (1 - weight),
      b: fg.b * weight + bg.b * (1 - weight)
    };
    if (contrastRatio(mixed, bg) >= 4.5 || weight >= 0.99) {
      return rgbToHex(mixed.r, mixed.g, mixed.b);
    }
    weight = Math.min(1, weight + 0.06);
  }
  return rgbToHex(fg.r, fg.g, fg.b);
}

function contrastForeground(fillColor, lightText, darkText) {
  var dark = darkText || "#0b0f14";
  var light = lightText || "#ffffff";
  return contrastRatio(fillColor, dark) >= contrastRatio(fillColor, light) ? dark : light;
}

function quotedFontFamily(family) {
  var f = String(family || "monospace").trim();
  if (!f) return "monospace";
  if (f.indexOf(" ") >= 0 && f.charAt(0) !== '"' && f.charAt(0) !== "'") {
    return '"' + f.replace(/"/g, "") + '"';
  }
  return f;
}

function updateCachedDevelopingCandles(cache, sym, quote, timeframes, nowDate) {
  if (!cache || !sym || !quote || !isArrayLike(timeframes)) return [];
  var changedKeys = [];
  var seen = {};
  var tsNow = nowDate || new Date();
  for (var i = 0; i < timeframes.length; i++) {
    var tf = timeframes[i];
    if (!tf || seen[tf]) continue;
    seen[tf] = true;
    var k = cacheKey(sym, tf);
    var existing = cache[k];
    if (existing && existing.length > 0) {
      var updated = updateDevelopingCandle(existing, quote, tf, tsNow);
      if (updated !== existing) {
        cache[k] = updated;
        changedKeys.push(k);
      }
    }
  }
  return changedKeys;
}

function roundCandlePrice(v) {
  var n = finiteOrNull(v);
  if (n === null) return null;
  var abs = Math.abs(n);
  if (abs === 0) return 0;
  if (abs >= 1) return Math.round(n * 10000) / 10000;
  return Number(n.toPrecision(6));
}

function packCandles(candles) {
  if (!isArrayLike(candles) || candles.length === 0) return [];
  var out = [];
  for (var i = 0; i < candles.length; i++) {
    var c = candles[i];
    if (!c) continue;
    if (Array.isArray(c) && c.length >= 5) {
      out.push([
        Math.round(Number(c[0]) || 0),
        roundCandlePrice(c[1]),
        roundCandlePrice(c[2]),
        roundCandlePrice(c[3]),
        roundCandlePrice(c[4]),
        Math.round(Number(c[5]) || 0)
      ]);
      continue;
    }
    var ts = finiteOrNull(c.timestamp);
    var cl = roundCandlePrice(c.close);
    if (ts === null || cl === null) continue;
    var op = roundCandlePrice(c.open);
    var hi = roundCandlePrice(c.high);
    var lo = roundCandlePrice(c.low);
    out.push([
      Math.round(ts),
      op !== null ? op : cl,
      hi !== null ? hi : cl,
      lo !== null ? lo : cl,
      cl,
      Math.round(Number(c.volume) || 0)
    ]);
  }
  return out;
}

function unpackCandles(raw) {
  if (!isArrayLike(raw) || raw.length === 0) return [];
  var out = [];
  for (var i = 0; i < raw.length; i++) {
    var item = raw[i];
    if (!item) continue;
    if (Array.isArray(item) && item.length >= 5) {
      var ts = finiteOrNull(item[0]);
      var op = finiteOrNull(item[1]);
      var hi = finiteOrNull(item[2]);
      var lo = finiteOrNull(item[3]);
      var cl = finiteOrNull(item[4]);
      if (ts === null || cl === null) continue;
      out.push({
        timestamp: ts,
        open: op !== null ? op : cl,
        high: hi !== null ? hi : cl,
        low: lo !== null ? lo : cl,
        close: cl,
        volume: finiteOrNull(item[5]) || 0
      });
    } else if (typeof item === "object") {
      var ots = finiteOrNull(item.timestamp);
      var ocl = finiteOrNull(item.close);
      if (ots === null || ocl === null) continue;
      out.push({
        timestamp: ots,
        open: finiteOrNull(item.open) !== null ? finiteOrNull(item.open) : ocl,
        high: finiteOrNull(item.high) !== null ? finiteOrNull(item.high) : ocl,
        low: finiteOrNull(item.low) !== null ? finiteOrNull(item.low) : ocl,
        close: ocl,
        volume: finiteOrNull(item.volume) || 0
      });
    }
  }
  return out;
}

function pruneChartCache(cache, maxEntries, accessTimes, protectedKeys) {
  if (!cache || typeof cache !== "object") return {};
  var cap = (isFinite(maxEntries) && maxEntries > 0) ? Math.floor(maxEntries) : 600;
  var keys = Object.keys(cache);
  if (keys.length <= cap) return cache;

  var access = (accessTimes && typeof accessTimes === "object") ? accessTimes : null;
  var prot = (protectedKeys && typeof protectedKeys === "object") ? protectedKeys : null;
  var pruned = {};
  var kept = 0;
  var ranked = [];

  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (prot && prot[k]) {
      pruned[k] = cache[k];
      kept++;
      continue;
    }
    var score = 0;
    if (access && isFinite(access[k])) {
      score = access[k];
    } else {
      var list = cache[k];
      if (isArrayLike(list) && list.length > 0) {
        var last = list[list.length - 1];
        if (last && isFinite(last.timestamp)) score = last.timestamp;
      }
    }
    ranked.push({ key: k, score: score });
  }

  ranked.sort(function (a, b) { return b.score - a.score; });
  var remaining = Math.max(0, cap - kept);
  for (var j = 0; j < remaining && j < ranked.length; j++) {
    var rk = ranked[j].key;
    pruned[rk] = cache[rk];
  }
  return pruned;
}

function mergeChartQuote(existingQuote, chartParsed) {
  if (!chartParsed || !chartParsed.symbol) return existingQuote || null;
  var hasExisting = Boolean(existingQuote && typeof existingQuote === "object" && (existingQuote.price !== undefined || existingQuote.regularPrice !== undefined || existingQuote.regularMarketPrice !== undefined));
  if (hasExisting) {
    var enriched = Object.assign({}, existingQuote);
    if (chartParsed.ftfc) enriched.ftfc = chartParsed.ftfc;
    if (chartParsed.ftfcAnchors) enriched.ftfcAnchors = chartParsed.ftfcAnchors;
    if (chartParsed.closes && (!enriched.closes || enriched.closes.length === 0)) enriched.closes = chartParsed.closes;
    if (chartParsed.name && !enriched.name) enriched.name = chartParsed.name;
    if (enriched.candles !== undefined) delete enriched.candles;
    return enriched;
  }
  var fresh = Object.assign({}, chartParsed);
  if (fresh.candles !== undefined) delete fresh.candles;
  return fresh;
}

var Z_LAYER = {
  TILE_BORDER: 5,
  HEADER: 10,
  CROSSHAIR: 15,
  LEVEL_EDIT: 35,
  SPLITTER: 100,
  OVERLAY: 200,
  TOOLTIP: 9998,
  MODAL: 9999
};

if (typeof module !== "undefined") {
  module.exports = {
    isArrayLike: isArrayLike,
    toArray: toArray,
    defaultWatchlist: defaultWatchlist,
    defaultPinned: defaultPinned,
    defaultState: defaultState,
    normalizeSymbol: normalizeSymbol,
    parseState: parseState,
    serializeState: serializeState,
    addSymbol: addSymbol,
    removeSymbol: removeSymbol,
    parsePinned: parsePinned,
    isPinned: isPinned,
    togglePinned: togglePinned,
    barSymbol: barSymbol,
    searchUrl: searchUrl,
    sparkUrl: sparkUrl,
    sparkQuoteUrl: sparkQuoteUrl,
    armedAlertSymbols: armedAlertSymbols,
    extractFtfcAnchors: extractFtfcAnchors,
    computeFtfcFromAnchors: computeFtfcFromAnchors,
    marketDateEt: marketDateEt,
    quoteSymbolsForView: quoteSymbolsForView,
    chartRanges: chartRanges,
    normalizeRange: normalizeRange,
    chartSpec: chartSpec,
    chartUrl: chartUrl,
    rangeChangeAmount: rangeChangeAmount,
    rangeChangePercent: rangeChangePercent,
    rangeCaption: rangeCaption,
    extendedLabel: extendedLabel,
    parseSearch: parseSearch,
    parseSpark: parseSpark,
    parseChart: parseChart,
    parseCandles: parseCandles,
    aggregateYearlyCandles: aggregateYearlyCandles,
    mergePeriodCandles: mergePeriodCandles,
    mergeQuotes: mergeQuotes,
    backoffDelay: backoffDelay,
    delayedLoaderDelayMs: delayedLoaderDelayMs,
    shouldShowDelayedLoader: shouldShowDelayedLoader,
    formatPrice: formatPrice,
    formatPercent: formatPercent,
    formatChange: formatChange,
    formatQuoteChange: formatQuoteChange,
    amountFromPercent: amountFromPercent,
    formatChangePair: formatChangePair,
    formatCompact: formatCompact,
    changeTone: changeTone,
    barLabel: barLabel,
    barLabelTone: barLabelTone,
    suggestionMeta: suggestionMeta,
    isFavorite: isFavorite,
    insightsUrl: insightsUrl,
    quotePageUrl: quotePageUrl,
    parseQuotePage: parseQuotePage,
    parseInsights: parseInsights,
    isInsightsResponse: isInsightsResponse,
    formatIsoDate: formatIsoDate,
    formatCandleTime: formatCandleTime,
    formatTimeAxisLabel: formatTimeAxisLabel,
    stratScenario: stratScenario,
    detectCandleShape: detectCandleShape,
    detectPivotMachineGun: detectPivotMachineGun,
    detectKickerPattern: detectKickerPattern,
    SETUP_LINE_TIMEFRAMES: SETUP_LINE_TIMEFRAMES,
    isSetupLineTimeframe: isSetupLineTimeframe,
    setupTimeframeLabel: setupTimeframeLabel,
    setupLineColor: setupLineColor,
    detectStratSetupOnCandles: detectStratSetupOnCandles,
    resolveTimeframeSetupTargets: resolveTimeframeSetupTargets,
    computeTriggeredSetupLines: computeTriggeredSetupLines,
    stratInForce: stratInForce,
    computeStratDetails: computeStratDetails,
    computeHoldingStratMatrix: computeHoldingStratMatrix,
    computeHoldingsStratMap: computeHoldingsStratMap,
    extractFTFC: extractFTFC,
    timeframeColor: timeframeColor,
    buildDetailStats: buildDetailStats,
    defaultGridMode: defaultGridMode,
    defaultGridSync: defaultGridSync,
    defaultGridSplits: defaultGridSplits,
    gridTimeframes: gridTimeframes,
    parseInterval: parseInterval,
    isCryptoSymbol: isCryptoSymbol,
    isCoinbaseCryptoSymbol: isCoinbaseCryptoSymbol,
    isHyperliquidCryptoSymbol: isHyperliquidCryptoSymbol,
    cryptoBaseSymbol: cryptoBaseSymbol,
    yahooChartUrl: yahooChartUrl,
    chartCommand: chartCommand,
    parseCoinbaseChart: parseCoinbaseChart,
    parseHyperliquidChart: parseHyperliquidChart,
    extractFTFCFromCandles: extractFTFCFromCandles,
    quoteFromChart: quoteFromChart,
    parseLayouts: parseLayouts,
    saveLayout: saveLayout,
    deleteLayout: deleteLayout,
    isEtfSymbol: isEtfSymbol,
    isSpdrSector: isSpdrSector,
    spdrSectorInfo: spdrSectorInfo,
    holdingsUrl: holdingsUrl,
    resolveCusipToTicker: resolveCusipToTicker,
    parseNportXml: parseNportXml,
    sortHoldings: sortHoldings,
    prepareConstituentCandles: prepareConstituentCandles,
    computeSectorBreadth: computeSectorBreadth,
    stratLivePrice: stratLivePrice,
    timeframeRank: timeframeRank,
    isLevelVisibleOnTimeframe: isLevelVisibleOnTimeframe,
    inHtfPeriod: inHtfPeriod,
    resolveLevelAnchorIndex: resolveLevelAnchorIndex,
    periodStartUtc: periodStartUtc,
    buildReplayCandles: buildReplayCandles,
    buildReplayQuote: buildReplayQuote,
    stepReplayCutoff: stepReplayCutoff,
    formatReplayBadgeTime: formatReplayBadgeTime,
    mapReplayStepInterval: mapReplayStepInterval,
    candleWeekKey: candleWeekKey,
    bfDayStarts: bfDayStarts,
    bfWeekStarts: bfWeekStarts,
    candleQuarterKey: candleQuarterKey,
    bfQuarterStarts: bfQuarterStarts,
    candleYearKey: candleYearKey,
    bfYearStarts: bfYearStarts,
    BF_EPS_REL: BF_EPS_REL,
    computeRayForOrigin: computeRayForOrigin,
    computeActiveBroadening: computeActiveBroadening,
    nodeCommand: nodeCommand,
    normalizeSymbolLevels: normalizeSymbolLevels,
    normalizeAlertLog: normalizeAlertLog,
    appendAlertLog: appendAlertLog,
    isUsDstUtc: isUsDstUtc,
    getUsSessionSchedule: getUsSessionSchedule,
    candleDurationSec: candleDurationSec,
    isUsMarketOpen: isUsMarketOpen,
    isAlertSessionOpen: isAlertSessionOpen,
    discordPriceAlertPayload: discordPriceAlertPayload,
    evaluatePriceLevelAlerts: evaluatePriceLevelAlerts,
    ALERT_MUTE_INDEFINITE: ALERT_MUTE_INDEFINITE,
    nextUsMarketOpenMs: nextUsMarketOpenMs,
    normalizeAlertsMutedUntil: normalizeAlertsMutedUntil,
    isAlertsMuted: isAlertsMuted,
    alertsMuteUntilForMode: alertsMuteUntilForMode,
    alertsMuteStatusText: alertsMuteStatusText,
    sectorBaskets: sectorBaskets,
    getSectorInfo: getSectorInfo,
    parseSectorTickers: parseSectorTickers,
    TICKER_PRESETS: TICKER_PRESETS,
    isPresetToken: isPresetToken,
    resolveTickerPreset: resolveTickerPreset,
    normalizeSectorInput: normalizeSectorInput,
    describeSectorInput: describeSectorInput,
    extractSymbols: extractSymbols,
    formatTickerList: formatTickerList,
    buildScenarioContext: buildScenarioContext,
    evaluateScenarioToken: evaluateScenarioToken,
    parseScenarioQuery: parseScenarioQuery,
    matchesScenarioTokens: matchesScenarioTokens,
    matchesScenarioQuery: matchesScenarioQuery,
    sortSectorHoldings: sortSectorHoldings,
    cacheKey: cacheKey,
    isBasketSector: isBasketSector,
    chunkSymbols: chunkSymbols,
    marketWeekStartEt: marketWeekStartEt,
    isUsEquitySessionSymbol: isUsEquitySessionSymbol,
    isCandleSeriesStale: isCandleSeriesStale,
    updateDevelopingCandle: updateDevelopingCandle,
    updateCachedDevelopingCandles: updateCachedDevelopingCandles,
    packCandles: packCandles,
    unpackCandles: unpackCandles,
    pruneChartCache: pruneChartCache,
    mergeChartQuote: mergeChartQuote,
    SIMULTANEOUS_BREAK_THRESHOLD: SIMULTANEOUS_BREAK_THRESHOLD,
    MIN_BAR_COUNT: MIN_BAR_COUNT,
    DEFAULT_ANALYSIS_BAR_COUNT: DEFAULT_ANALYSIS_BAR_COUNT,
    DEFAULT_RIGHT_OFFSET_BARS: DEFAULT_RIGHT_OFFSET_BARS,
    defaultRightOffsetBars: defaultRightOffsetBars,
    minVisibleChartBars: minVisibleChartBars,
    maxChartViewStart: maxChartViewStart,
    resolveHorizontalViewport: resolveHorizontalViewport,
    clampBarCount: clampBarCount,
    PRICE_SCALE_MIN_LOG_SPAN: PRICE_SCALE_MIN_LOG_SPAN,
    PRICE_SCALE_MAX_LOG_SPAN: PRICE_SCALE_MAX_LOG_SPAN,
    zoomPriceLogRange: zoomPriceLogRange,
    panPriceLogRange: panPriceLogRange,
    priceScaleDragFactor: priceScaleDragFactor,
    priceScaleWheelFactor: priceScaleWheelFactor,
    formatScalePrice: formatScalePrice,
    parseColorRgb: parseColorRgb,
    rgbToHex: rgbToHex,
    relativeLuminance: relativeLuminance,
    contrastRatio: contrastRatio,
    isLightColor: isLightColor,
    accessibleSemanticColor: accessibleSemanticColor,
    accessibleDimColor: accessibleDimColor,
    contrastForeground: contrastForeground,
    quotedFontFamily: quotedFontFamily,
    Z_LAYER: Z_LAYER
  }
}


