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
  return { symbol: true, timeframe: false, crosshair: true, time: true }
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
            windows.push({
              symbol: s,
              workspace: (w.workspace !== undefined && w.workspace !== null) ? w.workspace : ws
            })
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
          list.push({
            symbol: s,
            workspace: (w.workspace !== undefined && w.workspace !== null) ? w.workspace : ws
          })
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
    }
    if (Array.isArray(data.gridSymbols)) {
      var gSymbols = []
      for (var si = 0; si < data.gridSymbols.length; si++) {
        gSymbols.push(normalizeSymbol(data.gridSymbols[si]))
      }
      res.gridSymbols = gSymbols
    }
    if (data.gridSplits !== undefined && typeof data.gridSplits === "object") res.gridSplits = data.gridSplits
    if (data.layouts !== undefined && typeof data.layouts === "object") res.layouts = parseLayouts(data.layouts)
    if (data.breadthWeightMode === "cap" || data.breadthWeightMode === "equal") res.breadthWeightMode = data.breadthWeightMode
    if (data.breadthSortTimeframe !== undefined) res.breadthSortTimeframe = String(data.breadthSortTimeframe)
    if (data.breadthSortAsc !== undefined) res.breadthSortAsc = !!data.breadthSortAsc
    if (data.discordWebhook !== undefined) res.discordWebhook = String(data.discordWebhook || "").trim()
    return res
  } catch (e) {
    return fallback
  }
}

function serializeState(watchlist, pinned, detailRange, gridMode, gridSync, gridSymbols, gridSplits, layouts, breadthWeightMode, breadthSortTimeframe, breadthSortAsc, discordWebhook) {
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
  if (breadthWeightMode !== undefined) obj.breadthWeightMode = breadthWeightMode
  if (breadthSortTimeframe !== undefined) obj.breadthSortTimeframe = breadthSortTimeframe
  if (breadthSortAsc !== undefined) obj.breadthSortAsc = breadthSortAsc
  if (discordWebhook !== undefined && discordWebhook !== "") obj.discordWebhook = discordWebhook
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

function quoteSymbolsForView(watchlist, detailSymbol, view) {
  var detail = normalizeSymbol(detailSymbol)
  if (view === "detail" && detail) return [detail]
  return Array.isArray(watchlist) ? watchlist.slice() : []
}

function chartRanges() {
  return ["60", "1D", "1W", "1M", "1Y"]
}

function normalizeRange(value) {
  var key = String(value || "")
  var ranges = chartRanges()
  return ranges.indexOf(key) !== -1 ? key : defaultDetailRange()
}

function chartSpec(range) {
  switch (String(range || "1D")) {
    case "60": return { range: "1mo", interval: "60m" }
    case "1W": return { range: "5y", interval: "1wk" }
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
  return "https://query1.finance.yahoo.com/v8/finance/chart/"
    + encodeURIComponent(sym)
    + "?range=" + spec.range
    + "&interval=" + spec.interval
    + "&includePrePost=" + prepost
}

function chartUrl(symbol, rangeKey) {
  var sym = normalizeSymbol(symbol)
  var rk = String(rangeKey || "1D")
  if (isCoinbaseCryptoSymbol(sym) && (rk === "60" || rk === "1D" || rk === "1W")) {
    var gran = (rk === "60") ? "3600" : "86400"
    return "https://api.exchange.coinbase.com/products/" + encodeURIComponent(sym) + "/candles?granularity=" + gran
  }
  return yahooChartUrl(sym, rk)
}

function chartCommand(symbol, rangeKey) {
  var sym = normalizeSymbol(symbol)
  var rk = String(rangeKey || "1D")
  if (isHyperliquidCryptoSymbol(sym) && (rk === "60" || rk === "1D" || rk === "1W")) {
    var coin = cryptoBaseSymbol(sym)
    var interval = (rk === "60") ? "1h" : "1d"
    var lookbackDays = (rk === "60") ? 30 : 400
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
      "curl", "-fsS", "--max-time", "8", "-A", "Mozilla/5.0",
      "-X", "POST",
      "-H", "Content-Type: application/json",
      "-d", payload,
      "https://api.hyperliquid.xyz/info"
    ]
  }
  return ["curl", "-fsS", "--max-time", "8", "-A", "Mozilla/5.0", chartUrl(sym, rk)]
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
    case "60": return "60-Minute Candles (1 Month)"
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

    if (range === "60") {
      var d1h = new Date(t1 * 1000)
      var d2h = new Date(t2 * 1000)
      if (d1h.getUTCFullYear() !== d2h.getUTCFullYear() ||
          d1h.getUTCMonth() !== d2h.getUTCMonth() ||
          d1h.getUTCDate() !== d2h.getUTCDate()) {
        return false
      }
      var offsetSec = t1 % 3600
      return Math.floor((t1 - offsetSec) / 3600) === Math.floor((t2 - offsetSec) / 3600)
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

function extractFTFC(timestamps, indicators, price, meta) {
  var quote = indicators && indicators.quote && indicators.quote[0] ? indicators.quote[0] : null
  var hasExplicitOpen = !!(quote && quote.open && quote.open.length)
  var p = finiteOrNull(price)
  var rawCandles = parseCandles(timestamps, indicators)
  var hourlyCandles = mergePeriodCandles(rawCandles, "60")
  var N = hourlyCandles.length

  var fallback = { "60": "flat", "D": "flat", "W": "flat", "M": "flat" }
  if (!N || p === null) return fallback

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

  var candles = parseCandles(result.timestamp, result.indicators)
  if (rangeKey === "1Y") {
    candles = aggregateYearlyCandles(candles)
  } else {
    candles = mergePeriodCandles(candles, rangeKey)
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
  var ftfc = isHourly ? extractFTFC(result.timestamp, result.indicators, ftfcPrice, meta) : null

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
    dayHigh: finiteOrNull(meta.regularMarketDayHigh),
    dayLow: finiteOrNull(meta.regularMarketDayLow),
    volume: finiteOrNull(meta.regularMarketVolume),
    open: openPx,
    fiftyTwoWeekHigh: finiteOrNull(meta.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: finiteOrNull(meta.fiftyTwoWeekLow),
    priceHint: meta.priceHint,
    yahooRange: meta.range ? String(meta.range) : "",
    closes: closes,
    candles: candles,
    ftfc: ftfc
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
    var ftfc = (rk === "60") ? extractFTFCFromCandles(candles, last.close) : null

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
      ftfc: ftfc
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
    var ftfc = (rk === "60") ? extractFTFCFromCandles(candles, last.close) : null

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
      ftfc: ftfc
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
      if (Object.prototype.hasOwnProperty.call(incoming, key)) out[key] = incoming[key]
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
  var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  var hours = d.getHours()
  var minutes = d.getMinutes()
  var ampm = hours >= 12 ? "PM" : "AM"
  var h12 = hours % 12 || 12
  var mStr = (minutes < 10 ? "0" : "") + minutes
  var timeStr = h12 + ":" + mStr + " " + ampm

  if (range === "60") {
    var mon60 = months[d.getMonth()]
    var day60 = d.getDate()
    var year60 = d.getFullYear()
    return mon60 + " " + day60 + ", " + year60 + " " + timeStr
  }
  if (range === "1Y") return String(d.getUTCFullYear())
  if (range === "1M" || range === "All") return months[d.getUTCMonth()] + " " + d.getUTCFullYear()
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

  if (range === "60") {
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

  var sc = stratScenario(current, prev)
  var bar = (sc && sc !== "-") ? sc.toUpperCase() : "-"

  var curOpen = Number(current.open)
  var curHigh = Number(current.high)
  var curLow = Number(current.low)
  var curClose = Number(current.close)
  if (liveQuote && isFinite(Number(liveQuote.price))) {
    curClose = Number(liveQuote.price)
    if (isFinite(Number(liveQuote.dayHigh)) && Number(liveQuote.dayHigh) > curHigh) curHigh = Number(liveQuote.dayHigh)
    if (isFinite(Number(liveQuote.dayLow)) && Number(liveQuote.dayLow) < curLow) curLow = Number(liveQuote.dayLow)
  }

  var trigHigh = Number(prev.high)
  var trigLow = Number(prev.low)

  var polarity = "neutral"
  if (isFinite(curClose) && isFinite(curOpen)) {
    polarity = curClose >= curOpen ? "green" : "red"
  }

  var inForce = "-"
  if (sc === "2u") {
    inForce = (isFinite(curClose) && isFinite(trigHigh) && curClose >= trigHigh) ? "In-Force" : "Not In-Force"
  } else if (sc === "2d") {
    inForce = (isFinite(curClose) && isFinite(trigLow) && curClose <= trigLow) ? "In-Force" : "Not In-Force"
  } else if (sc === "1") {
    inForce = "Inside Bar"
  } else if (sc === "3") {
    if (isFinite(curClose) && isFinite(trigHigh) && curClose >= trigHigh) {
      inForce = "3 (In-Force Up)"
    } else if (isFinite(curClose) && isFinite(trigLow) && curClose <= trigLow) {
      inForce = "3 (In-Force Down)"
    } else {
      inForce = "3 (Inside Range)"
    }
  }

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
  "000000000": "FLEX",
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
    if (customMap && customMap[c]) return customMap[c]
    if (SPDR_CUSIP_MAP[c]) return SPDR_CUSIP_MAP[c]
    var c8 = c.slice(0, 8)
    if (customMap && customMap[c8]) return customMap[c8]
    if (SPDR_CUSIP_MAP[c8]) return SPDR_CUSIP_MAP[c8]
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

    var valMatch = block.match(/<(?:\w+:)?valUSD>([^<]+)<\/(?:\w+:)?valUSD>/i)
    var valUSD = valMatch ? (parseFloat(valMatch[1]) || 0) : 0

    var pctMatch = block.match(/<(?:\w+:)?pctVal>([^<]+)<\/(?:\w+:)?pctVal>/i)
    var pctVal = pctMatch ? (parseFloat(pctMatch[1]) || 0) : 0

    var symbol = resolveCusipToTicker(cusip, name, customMap)
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
  if (!Array.isArray(holdings)) return []
  var list = holdings.slice()
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

function allSpdrSectorsList() {
  return [
    { symbol: "XLC", name: "Communication Services", seriesId: "S000062095" },
    { symbol: "XLY", name: "Consumer Discretionary", seriesId: "S000006408" },
    { symbol: "XLP", name: "Consumer Staples", seriesId: "S000006409" },
    { symbol: "XLE", name: "Energy", seriesId: "S000006410" },
    { symbol: "XLF", name: "Financials", seriesId: "S000006411" },
    { symbol: "XLV", name: "Health Care", seriesId: "S000006412" },
    { symbol: "XLI", name: "Industrials", seriesId: "S000006413" },
    { symbol: "XLB", name: "Materials", seriesId: "S000006414" },
    { symbol: "XLK", name: "Technology", seriesId: "S000006415" },
    { symbol: "XLU", name: "Utilities", seriesId: "S000006416" },
    { symbol: "XLRE", name: "Real Estate", seriesId: "S000051152" }
  ]
}

function sparkCandlesUrl(symbols, interval, range) {
  var syms = Array.isArray(symbols) ? symbols : [symbols]
  var clean = []
  for (var i = 0; i < syms.length; i++) {
    var s = normalizeSymbol(syms[i])
    if (s && clean.indexOf(s) === -1) clean.push(s)
  }
  if (clean.length === 0) return ""
  var iv = interval || "1d"
  var rg = range || "2y"
  return "https://query1.finance.yahoo.com/v7/finance/spark?symbols=" + clean.join(",") + "&range=" + rg + "&interval=" + iv + "&includePrePost=false"
}

function parseSparkCandles(rawJson, interval) {
  var out = {}
  try {
    var data = typeof rawJson === "string" ? JSON.parse(rawJson) : (rawJson || {})
    var results = data.spark && data.spark.result ? data.spark.result : []
    for (var i = 0; i < results.length; i++) {
      var item = results[i]
      var sym = normalizeSymbol(item && item.symbol)
      var resp = item && item.response && item.response[0] ? item.response[0] : null
      if (!sym || !resp) continue
      var candles = parseCandles(resp.timestamp, resp.indicators)
      if (candles.length === 0) continue
      if (interval === "60m" || interval === "60" || interval === "1h") {
        out[sym] = mergePeriodCandles(candles, "60")
      } else {
        out[sym] = candles
      }
    }
  } catch (e) {}
  return out
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
  var list = Array.isArray(holdings) ? holdings : []
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

function computeSectorBreadthMetrics(holdings, hourlyCandlesMap, dailyCandlesMap, weightMode, preparedCandles) {
  var tfs = ["60", "1D", "1W", "1M", "1Y"]
  var res = {}
  var isCapWeight = (weightMode === "cap")
  var list = Array.isArray(holdings) ? holdings : []
  var prepared = preparedCandles || prepareConstituentCandles(dailyCandlesMap)

  for (var t = 0; t < tfs.length; t++) {
    var tf = tfs[t]
    var count2u = 0
    var count2d = 0
    var countOther = 0
    var totalCount = 0
    var sum2u = 0
    var sum2d = 0
    var sumOther = 0
    var totalWeight = 0

    for (var i = 0; i < list.length; i++) {
      var h = list[i]
      if (!h || h.delisted) continue
      var sym = normalizeSymbol(h.symbol)
      if (!sym) continue

      var candles = null
      if (tf === "60") {
        candles = hourlyCandlesMap ? hourlyCandlesMap[sym] : null
      } else {
        var p = prepared[sym]
        candles = p ? p[tf] : null
      }

      if (!candles || candles.length < 2) continue

      var current = candles[candles.length - 1]
      var prev = candles[candles.length - 2]
      var sc = stratScenario(current, prev)

      if (sc === "-") continue

      var w = 1
      if (isCapWeight) {
        var pct = Number(h.pctVal)
        if (isFinite(pct) && pct > 0) {
          w = pct
        } else {
          var val = Number(h.valUSD)
          w = (isFinite(val) && val > 0) ? val : 1
        }
      }

      totalCount++
      totalWeight += w

      if (sc === "2u") {
        count2u++
        sum2u += w
      } else if (sc === "2d") {
        count2d++
        sum2d += w
      } else {
        countOther++
        sumOther += w
      }
    }

    var pct2u = 0
    var pct2d = 0
    var pctOther = 0
    var netDelta = 0

    if (totalWeight > 0) {
      pct2u = (sum2u / totalWeight) * 100
      pct2d = (sum2d / totalWeight) * 100
      pctOther = (sumOther / totalWeight) * 100
      netDelta = pct2u - pct2d
    }

    res[tf] = {
      pct2u: pct2u,
      pct2d: pct2d,
      pctOther: pctOther,
      netDelta: netDelta,
      count2u: count2u,
      count2d: count2d,
      countOther: countOther,
      totalCount: totalCount,
      totalWeight: totalWeight
    }
  }

  return res
}

function computeAllSectorsBreadth(sectorsHoldingsMap, hourlyCandlesMap, dailyCandlesMap, weightMode) {
  var sectors = allSpdrSectorsList()
  var prepared = prepareConstituentCandles(dailyCandlesMap)
  var out = []
  for (var i = 0; i < sectors.length; i++) {
    var sec = sectors[i]
    var sym = sec.symbol
    var holdingsData = sectorsHoldingsMap ? sectorsHoldingsMap[sym] : null
    var holdings = (holdingsData && holdingsData.holdings) ? holdingsData.holdings : (Array.isArray(holdingsData) ? holdingsData : [])
    var tfMetrics = computeSectorBreadthMetrics(holdings, hourlyCandlesMap, dailyCandlesMap, weightMode, prepared)
    out.push({
      symbol: sym,
      name: sec.name,
      seriesId: sec.seriesId,
      holdingsCount: holdings.length,
      timeframes: tfMetrics
    })
  }
  return out
}

function sortSectorBreadth(sectorsList, sortTimeframe, sortAsc) {
  if (!Array.isArray(sectorsList)) return []
  var list = sectorsList.slice()
  var tf = sortTimeframe || "1Y"
  var asc = !!sortAsc

  list.sort(function (a, b) {
    var aTf = (a && a.timeframes && a.timeframes[tf]) ? a.timeframes[tf] : null
    var bTf = (b && b.timeframes && b.timeframes[tf]) ? b.timeframes[tf] : null
    var aDelta = aTf ? Number(aTf.netDelta) : -9999
    var bDelta = bTf ? Number(bTf.netDelta) : -9999
    if (!isFinite(aDelta)) aDelta = -9999
    if (!isFinite(bDelta)) bDelta = -9999

    if (Math.abs(aDelta - bDelta) > 0.0001) {
      return asc ? (aDelta - bDelta) : (bDelta - aDelta)
    }
    return String(a.symbol || "").localeCompare(String(b.symbol || ""))
  })

  return list
}

function formatNetDelta(val) {
  var n = Number(val)
  if (!isFinite(n)) return "0.0%"
  var sign = n > 0 ? "+" : ""
  return sign + n.toFixed(1) + "%"
}

function stratRuleRationales() {
  return {
    1: "Full Timeframe Continuity (FTFC): Price relative to open must align across 60, 1D, 1W, and 1M (all green for long, all red for short). Eliminates low-probability counter-trend traps.",
    2: "Actionable Strat Signal: Trades must strictly originate from recognized combos (2-1-2, 2-2 Reversal, 2-2 Continuation, 3-1-2). Prevents arbitrary or emotional market entry.",
    3: "Signal Bar Confirmation: Scenario classifications (1, 2, 3) are dynamic until the candle closes. Entering before close risks failed signals and false breakouts.",
    4: "Time and Run Exhaustion: Entering late in a candle\x27s period or after 3+ consecutive uncorrected 2-bars carries high risk of instant reversal when the next period opens.",
    5: "Trigger Execution: Orders must execute strictly when price breaks the signal candle extreme, mechanically turning the current bar into a live Scenario 2 or 3 in your favor.",
    6: "Chop Avoidance: Scenario 1 represents indecision and range contraction. Trading inside an unresolved inside bar leads to whipsaws and theta decay.",
    7: "Untagged Macro Targets: Strat targets are previous pivot highs/lows and broadening boundaries. Target must be untagged with at least 1:2 Risk-to-Reward remaining.",
    8: "Structural Invalidation Stop: Non-negotiable stop placed at the opposite extreme of the signal candle. Breaching this level invalidates the trade hypothesis.",
    9: "Runway Quality: Major 1W/1M previous extremes act as heavy supply/demand zones. There must be no opposing HTF wall blocking the path to target."
  }
}

function evaluateStratChecklist(symbol, hourlyCandles, dailyCandles, liveQuote, nowDate) {
  var sym = normalizeSymbol(symbol)
  var hourly = Array.isArray(hourlyCandles) ? hourlyCandles : []
  var daily = Array.isArray(dailyCandles) ? dailyCandles : []
  var weekly = mergePeriodCandles(daily, "1W")
  var monthly = mergePeriodCandles(daily, "1M")

  var qPrice = (liveQuote && isFinite(liveQuote.regularMarketPrice)) ? Number(liveQuote.regularMarketPrice) : null
  var currentPrice = qPrice
  if (currentPrice === null && hourly.length > 0) {
    currentPrice = Number(hourly[hourly.length - 1].close)
  }
  if (currentPrice === null && daily.length > 0) {
    currentPrice = Number(daily[daily.length - 1].close)
  }

  var c60 = hourly.length > 0 ? hourly[hourly.length - 1] : null
  var p60 = hourly.length > 1 ? hourly[hourly.length - 2] : null
  var c1D = daily.length > 0 ? daily[daily.length - 1] : null
  var p1D = daily.length > 1 ? daily[daily.length - 2] : null
  var c1W = weekly.length > 0 ? weekly[weekly.length - 1] : null
  var p1W = weekly.length > 1 ? weekly[weekly.length - 2] : null
  var c1M = monthly.length > 0 ? monthly[monthly.length - 1] : null
  var p1M = monthly.length > 1 ? monthly[monthly.length - 2] : null

  var price60 = (qPrice !== null && c60) ? qPrice : (c60 ? Number(c60.close) : null)
  var price1D = (qPrice !== null && c1D) ? qPrice : (c1D ? Number(c1D.close) : null)
  var price1W = (qPrice !== null && c1W) ? qPrice : (c1W ? Number(c1W.close) : null)
  var price1M = (qPrice !== null && c1M) ? qPrice : (c1M ? Number(c1M.close) : null)

  var col60 = (c60 && price60 !== null) ? (price60 >= Number(c60.open) ? "G" : "R") : "-"
  var col1D = (c1D && price1D !== null) ? (price1D >= Number(c1D.open) ? "G" : "R") : "-"
  var col1W = (c1W && price1W !== null) ? (price1W >= Number(c1W.open) ? "G" : "R") : "-"
  var col1M = (c1M && price1M !== null) ? (price1M >= Number(c1M.open) ? "G" : "R") : "-"

  var isBullishFTFC = (col60 === "G" && col1D === "G" && col1W === "G" && col1M === "G")
  var isBearishFTFC = (col60 === "R" && col1D === "R" && col1W === "R" && col1M === "R")
  var direction = isBullishFTFC ? "LONG" : (isBearishFTFC ? "SHORT" : (col1D === "G" ? "LONG" : (col1D === "R" ? "SHORT" : "CONFLICT")))

  // 1. FTFC Polarity
  var r1Pass = isBullishFTFC || isBearishFTFC
  var r1Detail = "1M(" + col1M + ") 1W(" + col1W + ") 1D(" + col1D + ") 60m(" + col60 + ")"
  if (!r1Pass) {
    r1Detail = "Conflict: " + r1Detail
  }

  // 2. Actionable Signal on Setup TF
  var setupTf = "60"
  var signalCandle = p60
  var isLong = (direction === "LONG")

  var sc60 = (c60 && p60) ? stratScenario(c60, p60) : "-"

  var validSignal = false
  var signalName = "-"
  if (hourly.length >= 3) {
    var p2_60 = hourly[hourly.length - 3]
    var sc_prev = stratScenario(p60, p2_60)
    if (sc_prev === "1") {
      signalName = "60m 2-1-2 " + (isLong ? "Up" : "Down")
      validSignal = true
    } else if ((sc_prev === "2d" && isLong) || (sc_prev === "2u" && !isLong)) {
      signalName = "60m 2-2 Reversal " + (isLong ? "Up" : "Down")
      validSignal = true
    } else if ((sc_prev === "2u" && isLong) || (sc_prev === "2d" && !isLong)) {
      signalName = "60m 2-2 Continuation " + (isLong ? "Up" : "Down")
      validSignal = true
    } else if (sc_prev === "3") {
      signalName = "60m 3-2 " + (isLong ? "Up" : "Down")
      validSignal = true
    }
  }
  if (!validSignal && daily.length >= 3) {
    setupTf = "1D"
    signalCandle = p1D
    var p2_1D = daily[daily.length - 3]
    var sc_prev1D = stratScenario(p1D, p2_1D)
    if (sc_prev1D === "1" || sc_prev1D === "2d" || sc_prev1D === "2u" || sc_prev1D === "3") {
      signalName = "1D Strat Signal (" + sc_prev1D + ")"
      validSignal = true
    }
  }

  var r2Pass = validSignal
  var r2Detail = validSignal ? signalName : "No actionable combo pattern"

  // 3. Signal Candle Closed
  var r3Pass = signalCandle !== null
  var r3Detail = signalCandle ? (setupTf + " Signal closed [" + Number(signalCandle.low).toFixed(2) + " - " + Number(signalCandle.high).toFixed(2) + "]") : "No closed signal candle"

  // 4. Time/Run Exhaustion Filter
  var r4Pass = true
  var r4Detail = "Fresh setup, no exhaustion"
  if (c60) {
    var isOpposingWick = isLong ? (col60 === "R") : (col60 === "G")
    if (isOpposingWick) {
      r4Pass = false
      r4Detail = "60m bar pulled back opposing trade color"
    }
  }

  // 5. Execution Trigger Crossed
  var triggerPrice = signalCandle ? (isLong ? Number(signalCandle.high) : Number(signalCandle.low)) : null
  var stopPrice = signalCandle ? (isLong ? Number(signalCandle.low) : Number(signalCandle.high)) : null
  var signalCandleTimestamp = (signalCandle && signalCandle.timestamp != null) ? signalCandle.timestamp : null

  var r5Pass = false
  var r5Detail = "No trigger available"
  if (triggerPrice !== null && currentPrice !== null) {
    if (isLong) {
      r5Pass = (currentPrice >= triggerPrice)
      var deltaLong = currentPrice - triggerPrice
      r5Detail = "Trig: $" + triggerPrice.toFixed(2) + " | Cur: $" + currentPrice.toFixed(2) + " (" + (deltaLong >= 0 ? "+$" + deltaLong.toFixed(2) : "-$" + Math.abs(deltaLong).toFixed(2) + " below") + ")"
    } else {
      r5Pass = (currentPrice <= triggerPrice)
      var deltaShort = triggerPrice - currentPrice
      r5Detail = "Trig: $" + triggerPrice.toFixed(2) + " | Cur: $" + currentPrice.toFixed(2) + " (" + (deltaShort >= 0 ? "-$" + deltaShort.toFixed(2) : "+$" + Math.abs(deltaShort).toFixed(2) + " above") + ")"
    }
  }

  // 6. Execution Bar Not Stuck in Scenario 1
  var r6Pass = (sc60 !== "1")
  var r6Detail = "60m Bar: Scenario " + sc60.toUpperCase() + (sc60 === "1" ? " (Consolidation Chop)" : " (In-Force)")

  // 7. Untagged HTF Targets — Lock T1 relative to signal/trigger at inception
  var targetPrice = null
  var targetName = ""
  var targets = []
  if (isLong) {
    if (setupTf === "60" && p1D && triggerPrice !== null && Number(p1D.high) > triggerPrice) {
      targets.push({ name: "1D High", price: Number(p1D.high) })
    }
    if (p1W && triggerPrice !== null && Number(p1W.high) > triggerPrice) {
      targets.push({ name: "1W High", price: Number(p1W.high) })
    }
    if (p1M && triggerPrice !== null && Number(p1M.high) > triggerPrice) {
      targets.push({ name: "1M High", price: Number(p1M.high) })
    }
    if (targets.length === 0) {
      if (p1D && Number(p1D.high) > 0) targets.push({ name: "1D High", price: Number(p1D.high) })
      else if (p1W && Number(p1W.high) > 0) targets.push({ name: "1W High", price: Number(p1W.high) })
      else if (p1M && Number(p1M.high) > 0) targets.push({ name: "1M High", price: Number(p1M.high) })
    }
  } else {
    if (setupTf === "60" && p1D && triggerPrice !== null && Number(p1D.low) < triggerPrice) {
      targets.push({ name: "1D Low", price: Number(p1D.low) })
    }
    if (p1W && triggerPrice !== null && Number(p1W.low) < triggerPrice) {
      targets.push({ name: "1W Low", price: Number(p1W.low) })
    }
    if (p1M && triggerPrice !== null && Number(p1M.low) < triggerPrice) {
      targets.push({ name: "1M Low", price: Number(p1M.low) })
    }
    if (targets.length === 0) {
      if (p1D && Number(p1D.low) > 0) targets.push({ name: "1D Low", price: Number(p1D.low) })
      else if (p1W && Number(p1W.low) > 0) targets.push({ name: "1W Low", price: Number(p1W.low) })
      else if (p1M && Number(p1M.low) > 0) targets.push({ name: "1M Low", price: Number(p1M.low) })
    }
  }

  if (targets.length > 0) {
    targetPrice = targets[0].price
    targetName = targets[0].name
  }

  // Check Target Hit & Invalidation
  var isTargetHit = false
  if (targetPrice !== null && currentPrice !== null) {
    if (isLong) {
      if (currentPrice >= targetPrice) isTargetHit = true
      if (c60 && Number(c60.high) >= targetPrice) isTargetHit = true
      if (c1D && Number(c1D.high) >= targetPrice) isTargetHit = true
    } else {
      if (currentPrice <= targetPrice) isTargetHit = true
      if (c60 && Number(c60.low) <= targetPrice) isTargetHit = true
      if (c1D && Number(c1D.low) <= targetPrice) isTargetHit = true
    }
  }

  var isStoppedOut = false
  if (stopPrice !== null && currentPrice !== null) {
    if (isLong) {
      if (currentPrice <= stopPrice) isStoppedOut = true
      if (c60 && Number(c60.low) <= stopPrice) isStoppedOut = true
    } else {
      if (currentPrice >= stopPrice) isStoppedOut = true
      if (c60 && Number(c60.high) >= stopPrice) isStoppedOut = true
    }
  }

  // 4. Time/Run Exhaustion Filter
  var r4Pass = true
  var r4Detail = "Fresh setup, no exhaustion"
  if (isTargetHit) {
    r4Pass = false
    r4Detail = "Target reached (" + targetName + " $" + (targetPrice != null ? targetPrice.toFixed(2) : "") + ") — exhaustion risk"
  } else if (c60) {
    var isOpposingWick = isLong ? (col60 === "R") : (col60 === "G")
    if (isOpposingWick) {
      r4Pass = false
      r4Detail = "60m bar pulled back opposing trade color"
    }
  }

  var r7Pass = false
  var r7Detail = "No untagged HTF target found"
  if (isTargetHit) {
    r7Pass = false
    r7Detail = "Target reached: " + targetName + " $" + (targetPrice != null ? targetPrice.toFixed(2) : "") + " (Exhausted)"
  } else if (targetPrice !== null && stopPrice !== null && currentPrice !== null) {
    var reward = Math.abs(targetPrice - currentPrice)
    var risk = Math.abs(currentPrice - stopPrice)
    var rr = risk > 0 ? (reward / risk) : 0
    r7Pass = (reward > 0)
    r7Detail = "Target: " + targetName + " $" + targetPrice.toFixed(2) + " (Room: $" + reward.toFixed(2) + ", R:R 1:" + rr.toFixed(1) + ")"
  } else if (targetPrice !== null) {
    r7Pass = true
    r7Detail = "Target: " + targetName + " $" + targetPrice.toFixed(2)
  }

  // 8. Stop-Loss Anchored to Signal TF
  var r8Pass = false
  var r8Detail = "Stop not defined"
  if (isStoppedOut) {
    r8Pass = false
    r8Detail = "Stopped out: $" + (stopPrice != null ? stopPrice.toFixed(2) : "") + " breached"
  } else if (stopPrice !== null && currentPrice !== null) {
    r8Pass = isLong ? (currentPrice > stopPrice) : (currentPrice < stopPrice)
    r8Detail = "Stop-Loss: $" + stopPrice.toFixed(2) + " (" + setupTf + " Signal " + (isLong ? "Low" : "High") + ")"
  }

  // 9. Runway Quality
  var r9Pass = r7Pass
  var r9Detail = r9Pass ? ("Runway clear toward " + targetName) : "Opposing pivot blocks path or target untagged"

  var rationales = stratRuleRationales()

  var rules = [
    { id: 1, title: "FTFC confirmed: all timeframes share same color.", shortTitle: "1. FTFC Polarity", passed: r1Pass, detail: r1Detail, rationale: rationales[1] },
    { id: 2, title: "Valid Strat signal on active setup timeframe.", shortTitle: "2. Valid Signal", passed: r2Pass, detail: r2Detail, rationale: rationales[2] },
    { id: 3, title: "Signal candle has completed and closed.", shortTitle: "3. Signal Closed", passed: r3Pass, detail: r3Detail, rationale: rationales[3] },
    { id: 4, title: "Entry is fresh: no time or run exhaustion.", shortTitle: "4. No Exhaustion", passed: r4Pass, detail: r4Detail, rationale: rationales[4] },
    { id: 5, title: "Execution trigger price crossed by min 1 tick.", shortTitle: "5. Trigger Crossed", passed: r5Pass, detail: r5Detail, rationale: rationales[5] },
    { id: 6, title: "Execution candle is not stuck in Scenario 1.", shortTitle: "6. Avoid 1-Chop", passed: r6Pass, detail: r6Detail, rationale: rationales[6] },
    { id: 7, title: "Untagged HTF target provides sufficient room.", shortTitle: "7. Untagged Target", passed: r7Pass, detail: r7Detail, rationale: rationales[7] },
    { id: 8, title: "Stop-loss anchored to signal candle opposite.", shortTitle: "8. Stop Defined", passed: r8Pass, detail: r8Detail, rationale: rationales[8] },
    { id: 9, title: "No major opposing HTF pivot blocks runway.", shortTitle: "9. Clear Runway", passed: r9Pass, detail: r9Detail, rationale: rationales[9] }
  ]

  var passedCount = 0
  for (var i = 0; i < rules.length; i++) {
    if (rules[i].passed) passedCount++
  }

  var isTradeable = (passedCount === rules.length) && !isTargetHit && !isStoppedOut
  var badgeText = passedCount + "/9"
  var badgeTone = "neutral"
  if (isTradeable) {
    badgeTone = (direction === "SHORT") ? "down" : "up"
  }

  return {
    symbol: sym,
    direction: direction,
    setupTimeframe: setupTf,
    signalCandleTimestamp: signalCandleTimestamp,
    passedCount: passedCount,
    totalRules: rules.length,
    isTradeable: isTradeable,
    isTriggered: r5Pass,
    isTargetHit: isTargetHit,
    isStoppedOut: isStoppedOut,
    badgeText: badgeText,
    badgeTone: badgeTone,
    triggerPrice: isFinite(triggerPrice) ? triggerPrice : null,
    targetPrice: isFinite(targetPrice) ? targetPrice : null,
    targetName: targetName,
    targets: targets,
    stopPrice: isFinite(stopPrice) ? stopPrice : null,
    rules: rules
  }
}

function discordAlertPayload(chk, eventType) {
  if (!chk || !chk.symbol || !chk.direction) return null
  var isBull = chk.direction === "BULLISH" || chk.direction === "LONG"
  var color = isBull ? 3066993 : 15158332
  var triggerStr = (chk.triggerPrice != null && isFinite(chk.triggerPrice)) ? ("$" + Number(chk.triggerPrice).toFixed(2)) : "N/A"
  var stopStr = (chk.stopPrice != null && isFinite(chk.stopPrice)) ? ("$" + Number(chk.stopPrice).toFixed(2)) : "N/A"
  var targetStr = (chk.targetPrice != null && isFinite(chk.targetPrice) && chk.targetName) ? (chk.targetName + " $" + Number(chk.targetPrice).toFixed(2)) : ((chk.targetPrice != null && isFinite(chk.targetPrice)) ? "$" + Number(chk.targetPrice).toFixed(2) : "N/A")

  var tf = chk.setupTimeframe || ""
  var type = eventType || "TRIGGERED"

  var content = "@everyone 🚨 **The Strat Tradeable Alert: " + chk.symbol + " [" + chk.direction + "]**"
  var title = "🚨 The Strat Tradeable Alert: " + chk.symbol + " [" + chk.direction + "]"
  var desc = "**9/9 Rules Verified** on `" + tf + "` setup."

  if (type === "TARGET_HIT") {
    content = "@everyone 🎯 **The Strat Target Hit: " + chk.symbol + " [" + chk.direction + "]**"
    title = "🎯 The Strat Target Hit: " + chk.symbol + " [" + chk.direction + "]"
    desc = "**Target Reached (" + (chk.targetName || "T1") + ")** on `" + tf + "` setup. Exhaustion risk — take profit / trail stop."
    color = 3066993
  } else if (type === "STOPPED") {
    content = "@everyone 🛑 **The Strat Setup Invalidated: " + chk.symbol + " [" + chk.direction + "]**"
    title = "🛑 The Strat Setup Invalidated: " + chk.symbol + " [" + chk.direction + "]"
    desc = "**Stop-Loss Breached** on `" + tf + "` setup."
    color = 15158332
  }

  return JSON.stringify({
    content: content,
    embeds: [
      {
        title: title,
        description: desc,
        color: color,
        fields: [
          { name: "Trigger", value: triggerStr, inline: true },
          { name: "Stop", value: stopStr, inline: true },
          { name: "Target", value: targetStr, inline: true }
        ],
        footer: { text: "Omafinance Strat Execution Engine" },
        timestamp: new Date().toISOString()
      }
    ]
  })
}

if (typeof module !== "undefined") {
  module.exports = {
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
    isSpdrSector: isSpdrSector,
    spdrSectorInfo: spdrSectorInfo,
    holdingsUrl: holdingsUrl,
    resolveCusipToTicker: resolveCusipToTicker,
    parseNportXml: parseNportXml,
    sortHoldings: sortHoldings,
    allSpdrSectorsList: allSpdrSectorsList,
    sparkCandlesUrl: sparkCandlesUrl,
    parseSparkCandles: parseSparkCandles,
    prepareConstituentCandles: prepareConstituentCandles,
    computeSectorBreadthMetrics: computeSectorBreadthMetrics,
    computeAllSectorsBreadth: computeAllSectorsBreadth,
    sortSectorBreadth: sortSectorBreadth,
    formatNetDelta: formatNetDelta,
    stratRuleRationales: stratRuleRationales,
    evaluateStratChecklist: evaluateStratChecklist,
    discordAlertPayload: discordAlertPayload
  }
}


