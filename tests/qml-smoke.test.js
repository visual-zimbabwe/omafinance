const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const root = path.resolve(__dirname, "..")
const source = file => path.join(root, "src", file)
const qmlFiles = [
  "BarWidget.qml",
  "Panel.qml",
  "Sparkline.qml",
  "CandlestickChart.qml",
  "FinanceListView.qml",
  "FinanceSettingsView.qml",
  "FinanceDetailView.qml",
  "PriceRoll.qml",
  "GridSplitter.qml",
  "GridCell.qml",
  "GridWindow.qml",
  "FinanceAlertsView.qml",
  "SectorAnalysisWindow.qml",
  "BackLink.qml",
  "FtfcStrip.qml",
  "FinanceSurface.qml",
  "FinanceLayoutsView.qml",
  "StratChecklistPopup.qml"
]

test("all plugin QML files parse with qmlformat", () => {
  for (const file of qmlFiles) {
    const result = spawnSync("/usr/lib/qt6/bin/qmlformat", [source(file)], {
      encoding: "utf8"
    })
    assert.equal(result.status, 0, `${file}: ${result.stderr || result.stdout}`)
  }
})

test("panel composes the extracted views", () => {
  const panel = fs.readFileSync(source("Panel.qml"), "utf8")
  for (const component of ["FinanceListView", "FinanceSettingsView", "FinanceDetailView"])
    assert.match(panel, new RegExp(`\\b${component}\\s*\\{`))
  assert.match(panel, /backoffDelay\(2000, quoteFailureCount, 60000\)/)
})

test("panel presents before scheduling one non-blocking open refresh", () => {
  const panel = fs.readFileSync(source("Panel.qml"), "utf8")

  assert.doesNotMatch(panel, /stateFile\.reload\(\)/)
  assert.match(panel, /function open\(\)[\s\S]*?root\.controller\.show\(\);\s*scheduleOpenRefresh\(\);/)
  assert.match(panel, /function toggle\(\)[\s\S]*?else\s*root\.open\(\);/)
  assert.match(panel, /function scheduleOpenRefresh\(\)\s*\{\s*openRefreshTimer\.restart\(\);?\s*\}/)
  assert.match(panel, /function scheduleBarRefresh\(\)[\s\S]*?root\.showBarQuote && !quoteProc\.running/)
  assert.doesNotMatch(panel, /triggeredOnStart:\s*true/)
})

test("ticker-only bar mode suspends background quote requests", () => {
  const panel = fs.readFileSync(source("Panel.qml"), "utf8")
  const tickerSetter = panel.match(/function setShowTicker\(enabled\)\s*\{[\s\S]*?\n    \}/)

  assert.match(panel, /readonly property bool showBarData:\s*showTicker \|\| showPrice \|\| showChange/)
  assert.match(panel, /readonly property bool showBarQuote:\s*showPrice \|\| showChange/)
  assert.match(panel, /id:\s*refreshTimer[\s\S]*?running:\s*root\.showBarQuote && !root\.opened/)
  assert.match(panel, /before !== after && \(opened \|\| showBarQuote\)/)
  assert.ok(tickerSetter)
  assert.doesNotMatch(tickerSetter[0], /scheduleBarRefresh/)
})

test("search renders immediately, uses a short debounce, and caches results", () => {
  const panel = fs.readFileSync(source("Panel.qml"), "utf8")

  assert.match(panel, /function startSearch\(prefix\)[\s\S]*?listView\.field\.text = prefix;[\s\S]*?Qt\.callLater/)
  assert.match(panel, /id:\s*searchDebounce[\s\S]*?interval:\s*100/)
  assert.match(panel, /function cachedSearchResults\(query\)/)
  assert.match(panel, /function cacheSearchResults\(query, results\)/)
  assert.match(panel, /searchCacheTtlMs:\s*300000/)
  assert.match(panel, /id:\s*openRefreshTimer[\s\S]*?searchStarted/)
})

test("background quote refreshes do not show updating status", () => {
  const panel = fs.readFileSync(source("Panel.qml"), "utf8")

  assert.doesNotMatch(panel, /Updating quotes/)
  assert.doesNotMatch(panel, /Updating chart/)
  assert.match(panel, /quoteProc\.running\)\s*return hasQuotes \? "" : "Loading quotes…";/)
  assert.match(panel, /chartProc\.running && currentFetch\)\s*return rangeChart \? "" : "Loading chart…";/)
  assert.match(panel, /return showLastUpdated && chartUpdatedAt > 0 && detailQuote \? "Last updated "/)
})

test("quote refresh uses symbols selected for the active view", () => {
  const panel = fs.readFileSync(source("Panel.qml"), "utf8")

  assert.match(panel, /quoteSymbolsForView\(watchlist, detailSymbol, view\)/)
  assert.match(panel, /Model\.sparkUrl\(quoteSymbols\)/)
})

test("detail loading is a delayed icon beside the ticker", () => {
  const panel = fs.readFileSync(source("Panel.qml"), "utf8")
  const detail = fs.readFileSync(source("FinanceDetailView.qml"), "utf8")
  const loader = fs.readFileSync(source("FinanceLoader.qml"), "utf8")

  assert.match(panel, /readonly property bool detailDataLoading/)
  assert.doesNotMatch(panel, /Loading market details/)
  assert.match(detail, /id:\s*tickerLabel/)
  assert.match(loader, /shouldShowDelayedLoader/)
  assert.match(detail, /id:\s*detailsSpinner\b/)
  assert.match(detail, /FinanceLoader\s*\{/)
  assert.doesNotMatch(detail, /Loading market details/)
  const ticker = detail.indexOf("id: tickerLabel")
  const spinner = detail.search(/id:\s*detailsSpinner\b/)
  const status = detail.indexOf("controller.detailDataStatusText")
  assert.notEqual(ticker, -1)
  assert.notEqual(spinner, -1)
  assert.ok(ticker < spinner)
  assert.ok(status === -1 || spinner < status)
})

test("detail enrichment uses a bounded five-minute cache", () => {
  const panel = fs.readFileSync(source("Panel.qml"), "utf8")

  assert.match(panel, /detailCacheTtlMs:\s*300000/)
  assert.match(panel, /detailCacheLimit:\s*16/)
  assert.match(panel, /function restoreDetailCache\(symbol\)/)
  assert.match(panel, /restoreDetailCache\(next\);\s*fetchDetail\(\);/)
  assert.match(panel, /cacheDetailData\(root\.insightsFetchSymbol, "insights"/)
  assert.match(panel, /cacheDetailData\(root\.quotePageFetchSymbol, "page"/)
  assert.match(panel, /if \(insightsLoaded\)\s*return;/)
  assert.match(panel, /if \(quotePageLoaded\)\s*return;/)
})

test("detail header stacks small ticker, company name, then price", () => {
  const detail = fs.readFileSync(source("FinanceDetailView.qml"), "utf8")
  const ticker = detail.indexOf("id: tickerLabel")
  const company = detail.indexOf("id: companyName")
  const price = detail.indexOf("price: controller.activeQuote ? controller.detailMainPrice")

  assert.notEqual(ticker, -1)
  assert.notEqual(company, -1)
  assert.notEqual(price, -1)
  assert.ok(ticker < company)
  assert.ok(company < price)
  assert.match(detail, /id:\s*tickerLabel[\s\S]*?font\.pixelSize:\s*Style\.font\.body[\s\S]*?font\.bold:\s*true/)
  assert.match(detail, /id:\s*companyName[\s\S]*?font\.pixelSize:\s*Style\.font\.display/)
})

test("extended-hours price sits beside the at-close block", () => {
  const detail = fs.readFileSync(source("FinanceDetailView.qml"), "utf8")

  assert.match(detail, /Row\s*\{\s*width:\s*parent\.width\s*spacing:\s*Style\.space\(32\)/)
  assert.match(detail, /width:\s*controller\.showExtended \? implicitWidth : parent\.width/)
  assert.doesNotMatch(detail, /width:\s*\(parent\.width - parent\.spacing\) \/ 2/)
})

test("watchlist pointer-down prefetches details without duplicating the click fetch", () => {
  const panel = fs.readFileSync(source("Panel.qml"), "utf8")
  const list = fs.readFileSync(source("FinanceListView.qml"), "utf8")

  assert.match(list, /onPressed:\s*function\s*\(mouse\)[\s\S]*?mouse\.button === Qt\.LeftButton[\s\S]*?controller\.prefetchDetail\(symbol\)/)
  assert.match(panel, /function prefetchDetail\(symbol\)[\s\S]*?detailEnrichmentTimer\.stop\(\);[\s\S]*?fetchInsights\(\);[\s\S]*?fetchQuotePage\(\);/)
  assert.match(panel, /function prepareDetail\(symbol\)[\s\S]*?if \(detailSymbol === next\)\s*return true;/)
  assert.match(panel, /function openDetail\(symbol\)\s*\{\s*if \(!prepareDetail\(symbol\)\)/)
})

test("detail chart starts immediately while large enrichment waits one frame", () => {
  const panel = fs.readFileSync(source("Panel.qml"), "utf8")

  assert.match(panel, /function fetchDetail\(\)\s*\{[\s\S]*?startChartFetch\(\);[\s\S]*?detailEnrichmentTimer\.restart\(\);/)
  assert.match(panel, /id:\s*detailEnrichmentTimer\s*\n\s*interval:\s*16/)
  assert.match(panel, /onTriggered:\s*\{[\s\S]*?root\.fetchInsights\(\);[\s\S]*?root\.fetchQuotePage\(\);/)
})

test("watchlist virtualizes a capped set of reusable rows", () => {
  const list = fs.readFileSync(source("FinanceListView.qml"), "utf8")

  assert.match(list, /ListView\s*\{\s*id:\s*watchlistRows/)
  assert.match(list, /height:\s*Math\.min\(controller\.watchlist\.length, 8\) \* controller\.rowHeight/)
  assert.match(list, /reuseItems:\s*true/)
  assert.match(list, /cacheBuffer:\s*controller\.rowHeight/)
  assert.match(list, /positionViewAtIndex\(currentIndex, ListView\.Contain\)/)
})

test("sparklines cache normalized geometry for paint and hover", () => {
  const sparkline = fs.readFileSync(source("Sparkline.qml"), "utf8")

  assert.match(sparkline, /property var cachedGeometry:\s*null/)
  assert.match(sparkline, /function refreshGeometry\(\)/)
  assert.match(sparkline, /geometry\.xs\.push\(xAt\(geometry, i\)\)/)
  assert.match(sparkline, /geometry\.ys\.push\(yAt\(geometry, nums\[i\]\)\)/)
  assert.match(sparkline, /function updateHover\(px\)\s*\{\s*var g = cachedGeometry/)
  assert.match(sparkline, /var g = root\.cachedGeometry/)
  assert.match(sparkline, /onValuesChanged:\s*refreshGeometry\(\)/)
  assert.match(sparkline, /onPadChanged:\s*refreshGeometry\(\)/)
})

test("candlestick chart renders OHLC candles and interactive crosshairs", () => {
  const candleChart = fs.readFileSync(source("CandlestickChart.qml"), "utf8")
  const detail = fs.readFileSync(source("FinanceDetailView.qml"), "utf8")

  assert.match(candleChart, /property var candles:\s*\[\]/)
  assert.match(candleChart, /property string symbol:\s*""/)
  assert.match(candleChart, /onSymbolChanged:\s*resetZoom\(\)/)
  assert.match(candleChart, /onRangeKeyChanged:\s*resetZoom\(\)/)
  assert.match(candleChart, /onCandlesChanged:\s*refreshGeometry\(\)/)
  assert.match(candleChart, /Model\.stratScenario/)
  assert.match(candleChart, /function buildGeom\(\)/)
  assert.match(candleChart, /updateHover\(mouse\.x,\s*mouse\.y\)/)
  assert.match(candleChart, /ctx\.fillRect\(bodyLeft, bodyTop/)
  assert.match(detail, /\bCandlestickChart\s*\{/)
  assert.match(detail, /symbol:\s*controller\.detailSymbol/)
})

test("detail price changes use tone-colored text without pill backgrounds", () => {
  const detail = fs.readFileSync(source("FinanceDetailView.qml"), "utf8")
  const price = detail.indexOf("price: controller.activeQuote ? controller.detailMainPrice")
  const change = detail.indexOf("id: detailChange")

  assert.doesNotMatch(detail, /pillFill\(/)
  assert.ok(price < change)
  assert.match(detail, /id:\s*detailChange[\s\S]*?color:\s*controller\.toneColor\(controller\.shownMainChange\)/)
  assert.match(detail, /id:\s*extChange[\s\S]*?color:\s*controller\.toneColor\(controller\.sessionQuote \? controller\.sessionQuote\.extendedChangePercent : null\)/)
})

test("only changed detail price digits roll in their direction color", () => {
  const detail = fs.readFileSync(source("FinanceDetailView.qml"), "utf8")
  const roll = fs.readFileSync(source("PriceRoll.qml"), "utf8")

  assert.equal((detail.match(/\bPriceRoll\s*\{/g) || []).length, 2)
  assert.match(detail, /active:\s*controller\.opened && controller\.view === "detail"/)
  assert.match(roll, /rollDirection = next > lastPrice \? 1 : -1/)
  assert.match(roll, /changed: oldCharacter !== newCharacter/)
  assert.match(roll, /modelData\.changed && root\.animating \? root\.activeColor : root\.neutralColor/)
  assert.match(roll, /NumberAnimation[\s\S]*?property:\s*"rollProgress"[\s\S]*?Easing\.OutCubic/)
})

test("change style follows the show-change setting and precedes refresh", () => {
  const settings = fs.readFileSync(source("FinanceSettingsView.qml"), "utf8")
  const changeStyle = settings.indexOf('text: qsTr("Change on bar")')
  const refresh = settings.indexOf('label: "Background refresh (seconds)"')

  assert.notEqual(changeStyle, -1)
  assert.ok(changeStyle < refresh)
  assert.match(settings, /visible:\s*controller\.showChange[\s\S]*text:\s*qsTr\("Change on bar"\)/)
  assert.match(settings, /ButtonGroup\s*{[\s\S]*?visible:\s*controller\.showChange[\s\S]*?value:\s*controller\.changeStyle/)
})

test("manifest entry points exist", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"))
  assert.equal(manifest.id, "mohamedmansour.finance")
  assert.equal(manifest.barWidget.defaults.showLastUpdated, false)
  assert.equal(manifest.barWidget.schema.find(item => item.key === "showLastUpdated").defaultValue, false)
  for (const entry of Object.values(manifest.entryPoints))
    assert.equal(fs.existsSync(path.join(root, entry)), true, `missing ${entry}`)
})

test("detail view presents FTFC 60|D|W|M on far right of header", () => {
  const detail = fs.readFileSync(source("FinanceDetailView.qml"), "utf8")
  const ftfc = fs.readFileSync(source("FtfcStrip.qml"), "utf8")
  const panel = fs.readFileSync(source("Panel.qml"), "utf8")

  assert.match(panel, /function timeframeColor\(quote, tf\)/)
  assert.match(detail, /id:\s*detailHeader/)
  assert.match(detail, /FtfcStrip\s*\{[\s\S]*?id:\s*ftfcRow[\s\S]*?anchors\.right:\s*parent\.right/)
  assert.match(ftfc, /\["60", "D", "W", "M"\]/)
  assert.match(ftfc, /controller\.timeframeColor\(root\.quote, modelData\)/)
})

test("watchlist rows display FTFC 60|D|W|M replacing snapshot chart", () => {
  const list = fs.readFileSync(source("FinanceListView.qml"), "utf8")

  assert.doesNotMatch(list, /\bSparkline\s*\{/)
  assert.match(list, /FtfcStrip\s*\{[\s\S]*?id:\s*ftfcRow/)
})

test("detail view includes Grid button after Pin", () => {
  const detail = fs.readFileSync(source("FinanceDetailView.qml"), "utf8")
  const pinIdx = detail.indexOf('text: Model.isPinned(controller.pinned, controller.detailSymbol) ? "Pinned" : "Pin"')
  const gridIdx = detail.indexOf('text: "Grid"')

  assert.notEqual(pinIdx, -1)
  assert.notEqual(gridIdx, -1)
  assert.ok(gridIdx > pinIdx)
  assert.match(detail, /onClicked:\s*controller\.openGrid\(controller\.detailSymbol\)/)
})

test("panel configures and loads GridWindow with persistence", () => {
  const panel = fs.readFileSync(source("Panel.qml"), "utf8")

  assert.match(panel, /readonly property var detailActionIds:[\s\S]*?"grid"/)
  assert.match(panel, /function openGrid\(symbol\)/)
  assert.match(panel, /property var activeGridWindows:\s*\[\]/)
  assert.match(panel, /gridWindowComponent\.createObject/)
  assert.match(panel, /GridWindow\s*\{/)
  assert.match(panel, /onStateSaveRequested:\s*function\s*\(mode,\s*sync,\s*symbols,\s*splits\)/)
})

test("grid window provides 2x2, 2+3, and 1x1 layouts with zero grid lines", () => {
  const gridWin = fs.readFileSync(source("GridWindow.qml"), "utf8")
  const gridCell = fs.readFileSync(source("GridCell.qml"), "utf8")

  assert.match(gridWin, /property bool gridExpanded:\s*false/)
  assert.match(gridWin, /id:\s*activeGridLabel/)
  assert.match(gridWin, /id:\s*expandedGridRow/)
  assert.match(gridWin, /model:\s*\["2x2",\s*"2\+3",\s*"1x1"\]/)
  assert.match(gridWin, /SYM\s*"\s*\+\s*\(root\.syncSymbol/)
  assert.match(gridWin, /CROSS\s*"\s*\+\s*\(root\.syncCrosshair/)
  assert.match(gridWin, /TIME\s*"\s*\+\s*\(root\.syncTime/)
  assert.match(gridCell, /showGridLines:\s*false/)
  assert.match(gridCell, /showTooltipHeader:\s*false/)
})

test("candlestick chart provides pure logarithmic right price scale without R/L toggle", () => {
  const chart = fs.readFileSync(source("CandlestickChart.qml"), "utf8")
  const cell = fs.readFileSync(source("GridCell.qml"), "utf8")
  const grid = fs.readFileSync(source("GridWindow.qml"), "utf8")

  assert.match(chart, /property bool showPriceScale:\s*true/)
  assert.match(chart, /readonly property int scaleGutterWidth:\s*showPriceScale \? Style\.space\(52\) : 0/)
  assert.match(chart, /var right = Math\.max\(left \+ 1, w - root\.pad - scaleGutter\);/)
  assert.match(chart, /var logMin = Math\.log\(safeMin\);/)
  assert.doesNotMatch(chart, /property string scaleMode/)
  assert.doesNotMatch(chart, /id:\s*scaleModeBtn/)
  assert.match(chart, /property bool hoveringScale:\s*false/)
  assert.match(chart, /property int hoveredTickIndex:\s*-1/)
  assert.match(chart, /if\s*\(ratio\s*>=\s*2\.2\)/)
  assert.match(chart, /multipliers\s*=\s*\[1,\s*2,\s*5\]/)
  assert.match(chart, /id:\s*verticalCrosshair[\s\S]*?dashPattern:\s*\[2,\s*3\]/)
  assert.match(chart, /id:\s*horizontalCrosshair[\s\S]*?dashPattern:\s*\[2,\s*3\]/)
  assert.match(cell, /property bool tfExpanded:\s*false/)
  assert.match(cell, /property bool changingInterval:\s*false/)
  assert.match(cell, /function startIntervalInput\(/)
  assert.match(cell, /id:\s*intervalOverlay/)
  assert.match(cell, /id:\s*activeTfLabel/)
  assert.match(cell, /id:\s*expandedTfRow/)
  assert.match(grid, /function getActiveCellItem\(\)/)
})

test("grid keyboard focus manages active cell across layouts and clicks", () => {
  const cell = fs.readFileSync(source("GridCell.qml"), "utf8")
  const grid = fs.readFileSync(source("GridWindow.qml"), "utf8")

  assert.match(cell, /focus:\s*activeFocusCell/)
  assert.match(cell, /onActiveFocusCellChanged:/)
  assert.match(cell, /root\.forceActiveFocus\(\)[\s\S]*?root\.focusRequested\(root\.cellIndex\)/)
  assert.match(grid, /onActiveCellIndexChanged:/)
  assert.match(grid, /onGridModeChanged:[\s\S]*?item\.forceActiveFocus\(\)/)
  assert.match(grid, /Qt\.Key_Tab[\s\S]*?activeItem\.forceActiveFocus\(\)/)
})

test("grid cell displays strat scenario always visible and OHLC values on hover", () => {
  const gridCell = fs.readFileSync(source("GridCell.qml"), "utf8")

  assert.match(gridCell, /readonly property var currentBar:/)
  assert.match(gridCell, /readonly property var activeCandle:\s*root\.activeHoverCandle !== null \? root\.activeHoverCandle : root\.currentBar/)
  assert.match(gridCell, /visible:\s*root\.activeCandle !== null/)
  assert.match(gridCell, /visible:\s*root\.activeCandle && root\.activeCandle\.strat && root\.activeCandle\.strat !== "-"/)
  assert.match(gridCell, /text:\s*\(root\.activeCandle && root\.activeCandle\.strat && root\.activeCandle\.strat !== "-"\) \? String\(root\.activeCandle\.strat\)\.toUpperCase\(\) : ""/)
  assert.match(gridCell, /color:\s*\(root\.activeCandle && root\.activeCandle\.close >= root\.activeCandle\.open\) \? root\.upColor : root\.downColor/)
  assert.match(gridCell, /font\.bold:\s*true/)
  assert.match(gridCell, /visible:\s*root\.activeHoverCandle !== null/)
})

test("candlestick chart renders bottom time scale and crosshair date badge", () => {
  const chart = fs.readFileSync(source("CandlestickChart.qml"), "utf8")

  assert.match(chart, /property bool showTimeScale:\s*true/)
  assert.match(chart, /readonly property int timeScaleHeight:\s*showTimeScale \? Style\.space\(18\) : 0/)
  assert.match(chart, /id:\s*axisDateBadge/)
  assert.match(chart, /Model\.formatTimeAxisLabel/)
  assert.match(chart, /Model\.formatCandleTime\(root\.hoverCandle\.timestamp,\s*root\.rangeKey\)/)
  assert.match(chart, /id:\s*verticalCrosshair[\s\S]*?showTimeScale/)
})

test("grid window provides dual-speed live updating timers and silent backoff", () => {
  const grid = fs.readFileSync(source("GridWindow.qml"), "utf8")

  assert.match(grid, /readonly property int liveRefreshMs:\s*Model\.backoffDelay\(2000,\s*quoteFailureCount,\s*60000\)/)
  assert.match(grid, /readonly property int chartRefreshMs:\s*Model\.backoffDelay\(15000,\s*chartFailureCount,\s*120000\)/)
  assert.match(grid, /id:\s*liveTimer[\s\S]*?interval:\s*root\.liveRefreshMs[\s\S]*?running:\s*root\.visible[\s\S]*?refreshQuotes/)
  assert.match(grid, /id:\s*chartLiveTimer[\s\S]*?interval:\s*root\.chartRefreshMs[\s\S]*?running:\s*root\.visible[\s\S]*?refreshAllCharts\(true\)/)
  assert.match(grid, /function activeSymbols\(\)/)
  assert.match(grid, /function refreshQuotes\(\)/)
  assert.match(grid, /id:\s*quoteProc/)
  assert.match(grid, /Model\.sparkUrl\(syms\)/)
  assert.match(grid, /requestChartFetch\(sym,\s*tf,\s*isForced\)/)
})

test("grid cell provides live ticker search suggestions with debouncing and keyboard navigation", () => {
  const gridCell = fs.readFileSync(source("GridCell.qml"), "utf8")

  assert.match(gridCell, /id:\s*searchProc/)
  assert.match(gridCell, /id:\s*searchDebounce[\s\S]*?interval:\s*100/)
  assert.match(gridCell, /function cachedSearchResults\(query\)/)
  assert.match(gridCell, /function cacheSearchResults\(query, results\)/)
  assert.match(gridCell, /id:\s*suggestionsPopup/)
  assert.match(gridCell, /model:\s*root\.suggestions/)
  assert.match(gridCell, /Model\.suggestionMeta\(modelData\)/)
  assert.match(gridCell, /Qt\.Key_Down[\s\S]*?root\.suggestionIndex/)
  assert.match(gridCell, /Qt\.Key_Up[\s\S]*?root\.suggestionIndex/)
})

test("detail view holdings table renders Strat timeframe columns and hover tooltip", () => {
  const detail = fs.readFileSync(source("FinanceDetailView.qml"), "utf8")
  const panel = fs.readFileSync(source("Panel.qml"), "utf8")

  // Check detail view properties and layout
  assert.match(detail, /Model\.sortHoldings\(rawHoldings,\s*holdingsSortKey,\s*holdingsSortAsc,\s*controller\.detailHoldingsStratMap\)/)
  assert.match(detail, /key:\s*"60"/)
  assert.match(detail, /key:\s*"1D"/)
  assert.match(detail, /key:\s*"1W"/)
  assert.match(detail, /key:\s*"1M"/)
  assert.match(detail, /key:\s*"1Y"/)
  assert.match(panel, /id:\s*stratTooltipOverlay/)
  assert.match(panel, /3-Bar Sequence:/)
  assert.match(panel, /Status:/)
  assert.match(panel, /Trig H:/)
  assert.match(panel, /Trig L:/)

  // Check panel holdings strat fetching
  assert.match(panel, /property var detailHoldingsStratMap:\s*\(\{\}\)/)
  assert.match(panel, /id:\s*holdingsStratProc/)
  assert.match(panel, /function fetchHoldingsStrat\(symbol\)/)
  assert.match(panel, /fetch-holdings-strat\.js/)
})

test("fetch-holdings-strat script exists and exports holdings strat pipeline", () => {
  const scriptPath = path.join(__dirname, "..", "scripts", "fetch-holdings-strat.js")
  assert.ok(fs.existsSync(scriptPath))
  const scriptContent = fs.readFileSync(scriptPath, "utf8")
  assert.match(scriptContent, /Model\.holdingsUrl/)
  assert.match(scriptContent, /Model\.parseNportXml/)
  assert.match(scriptContent, /query1\.finance\.yahoo\.com\/v8\/finance\/chart/)
  assert.match(scriptContent, /Model\.computeHoldingsStratMap/)
})

test("fetch-etf-holdings script exists and integrates with SEC EDGAR dynamic discovery", () => {
  const scriptPath = path.join(__dirname, "..", "scripts", "fetch-etf-holdings.js")
  assert.ok(fs.existsSync(scriptPath))
  const scriptContent = fs.readFileSync(scriptPath, "utf8")
  assert.match(scriptContent, /company_tickers_mf\.json/)
  assert.match(scriptContent, /efts\.sec\.gov/)
  assert.match(scriptContent, /openfigi\.com/)
  assert.match(scriptContent, /Model\.parseNportXml/)
})

test("grid cells provide live 9-rule Strat checklist text status on execution timeframe with localized inspector popup", () => {
  const popup = fs.readFileSync(source("StratChecklistPopup.qml"), "utf8")
  const grid = fs.readFileSync(source("GridWindow.qml"), "utf8")
  const cell = fs.readFileSync(source("GridCell.qml"), "utf8")

  assert.match(popup, /STRAT CHECKLIST/)
  assert.match(popup, /STRAT RATIONALE/)
  assert.match(popup, /TRADEABLE/)
  assert.match(popup, /BLOCKED/)
  assert.match(popup, /Color\.background/)
  assert.doesNotMatch(grid, /masterStratChecklist/)
  assert.match(cell, /stratChecklist/)
  assert.match(cell, /isExecutionTimeframeCell/)
  assert.match(cell, /id:\s*stratBadgeText/)
  assert.match(cell, /id:\s*cellChecklistPopup/)
  assert.match(cell, /signal stratTradeableDetected/)
  assert.match(grid, /notifyStratTradeable/)
  assert.match(grid, /alertDispatchRequested/)
  assert.match(grid, /discordAlertPayload/)
  assert.doesNotMatch(grid, /notify-send/)
})

test("all alert delivery goes through Panel.dispatchAlert and honours mute", () => {
  const panel = fs.readFileSync(source("Panel.qml"), "utf8")
  const grid = fs.readFileSync(source("GridWindow.qml"), "utf8")
  const bar = fs.readFileSync(source("BarWidget.qml"), "utf8")
  const alertsView = fs.readFileSync(source("FinanceAlertsView.qml"), "utf8")

  const dispatch = panel.match(/function dispatchAlert\(alert\) \{[\s\S]*?\n    \}\n/)
  assert.ok(dispatch, "dispatchAlert exists")
  assert.match(dispatch[0], /Model\.isAlertsMuted\(root\.alertsMutedUntil/)
  assert.match(dispatch[0], /if \(muted\)\s*return;[\s\S]*notify-send[\s\S]*pw-play[\s\S]*curl/)
  // notify-send / pw-play / Discord curl appear only inside dispatchAlert
  assert.equal((panel.match(/notify-send/g) || []).length, 1)
  assert.equal((panel.match(/"pw-play"/g) || []).length, 1)
  assert.match(panel, /onAlertDispatchRequested:[\s\S]*?root\.dispatchAlert\(alert\)/)
  assert.match(panel, /alertsMutedUntil: root\.alertsMutedUntil/)
  assert.match(panel, /function toggleAlertsMute\(\): void/)
  assert.doesNotMatch(grid, /pw-play|webhooks\//)
  assert.match(grid, /ALERTS /)
  assert.match(bar, /Qt\.RightButton[\s\S]*toggleAlertsMute/)
  assert.match(alertsView, /controller\.setAlertsMute\(modelData\.mode\)/)
})

test("candlestick chart renders extended-hours price line and right-scale badge when session is outside regular hours", () => {
  const chart = fs.readFileSync(source("CandlestickChart.qml"), "utf8")
  const cell = fs.readFileSync(source("GridCell.qml"), "utf8")
  const detail = fs.readFileSync(source("FinanceDetailView.qml"), "utf8")

  assert.match(chart, /property var extendedPrice:\s*null/)
  assert.match(chart, /onExtendedPriceChanged:\s*refreshGeometry\(\)/)
  assert.match(chart, /var extVal = Model\.finiteOrNull\(root\.extendedPrice\)/)
  assert.match(chart, /yExtended:\s*hasExtended \? priceToY\(extVal\) : null/)
  assert.match(chart, /g\.extendedPrice >= g\.lastClose/)
  assert.match(cell, /extendedPrice:\s*\(root\.quote && root\.quote\.hasExtended && root\.quote\.session !== "regular" && root\.quote\.session !== "live"\) \? root\.quote\.extendedPrice : null/)
  assert.match(detail, /extendedPrice:\s*\(controller\.sessionQuote && controller\.sessionQuote\.hasExtended && controller\.sessionQuote\.session !== "regular" && controller\.sessionQuote\.session !== "live"\) \? controller\.sessionQuote\.extendedPrice : null/)
})

test("candlestick chart supports 30m timeframe, followLatest auto-scroll, and draggable trigger/target price levels with custom text and price", () => {
  const chart = fs.readFileSync(source("CandlestickChart.qml"), "utf8")
  const cell = fs.readFileSync(source("GridCell.qml"), "utf8")
  const grid = fs.readFileSync(source("GridWindow.qml"), "utf8")

  assert.match(cell, /model:\s*\["30",\s*"60",\s*"1D",\s*"1W",\s*"1M",\s*"1Y"\]/)
  assert.match(chart, /property bool followLatest:\s*true/)
  assert.match(chart, /var vStart = root\.followLatest \? maxStart : Math\.max\(0, Math\.min\(maxStart, root\.viewStart\)\)/)
  assert.match(chart, /property var priceLevels:\s*\[\]/)
  assert.match(chart, /function resolveLevelEndpoints\(lvl,\s*g\)/)
  assert.match(chart, /Model\.resolveLevelAnchorIndex\(lvl,\s*all,\s*root\.rangeKey\)/)
  assert.match(chart, /function hitTestLevel\(px,\s*py\)/)
  assert.match(chart, /function startLevelEdit\(index\)/)
  assert.match(chart, /function commitLevelEdit\(\)/)
  assert.match(chart, /id:\s*levelEditOverlay/)
  assert.match(chart, /id:\s*levelTextInput/)
  assert.match(chart, /customTxt \+ " · " \+ priceStr/)
  assert.match(cell, /readonly property bool editingLevel:\s*chart\.editingLevel/)
  assert.match(cell, /signal priceLevelsModified\(string sym,\s*var nextLevels\)/)
  assert.match(grid, /property var symbolLevels:\s*\(\{\}\)/)
  assert.match(grid, /function updateSymbolLevels\(sym,\s*nextLevels\)/)
  assert.match(grid, /activeCell\.editingLevel/)
})

test("grid window and panel persist cellTimeframes across state and layouts and support multi-timeframe bar replay", () => {
  const panel = fs.readFileSync(source("Panel.qml"), "utf8")
  const grid = fs.readFileSync(source("GridWindow.qml"), "utf8")
  const cell = fs.readFileSync(source("GridCell.qml"), "utf8")
  const chart = fs.readFileSync(source("CandlestickChart.qml"), "utf8")

  assert.match(panel, /property var gridTimeframes:/)
  assert.match(panel, /property var gridZooms:/)
  assert.match(panel, /cellTimeframes:\s*initialTfs/)
  assert.match(panel, /cellZooms:\s*initialZooms/)
  assert.match(panel, /gridWin\.cellTimeframes/)
  assert.match(panel, /gridWin\.cellZooms/)
  assert.match(grid, /property var cellZooms:/)
  assert.match(grid, /function setZoomForCell\(index,\s*newZoom\)/)
  assert.match(cell, /property int zoomCount:\s*-1/)
  assert.match(chart, /property int configuredZoom:\s*-1/)
  assert.match(chart, /signal zoomChangedManually\(int nextViewCount\)/)
  assert.match(grid, /property real replayCutoffTs:\s*0/)
  assert.match(grid, /property string replayStepInterval:\s*"Auto"/)
  assert.match(grid, /function setReplayStepInterval\(interval\)/)
  assert.match(grid, /Model\.buildReplayCandles/)
  assert.match(grid, /Model\.buildReplayQuote/)
  assert.match(grid, /function stepReplay\(dir\)/)
  assert.match(cell, /property real replayCutoffTs:\s*0/)
  assert.match(cell, /signal replayRequested\(real timestamp\)/)
  assert.match(chart, /signal replayRequested\(real timestamp\)/)
})

test("grid cell is free of obsolete focus basket support and renders clean header", () => {
  const cell = fs.readFileSync(source("GridCell.qml"), "utf8")
  const window = fs.readFileSync(source("GridWindow.qml"), "utf8")

  assert.doesNotMatch(cell, /focusSupportBadgeItem/)
  assert.doesNotMatch(cell, /computeFocusBasketSupport/)
  assert.doesNotMatch(cell, /cellSupportPopup/)
  assert.doesNotMatch(window, /fetch-attack\.js/)
  assert.doesNotMatch(window, /attackScanTimer/)
})

test("sector analysis window dynamically cycles across configured sector baskets including XLK", () => {
  const saw = fs.readFileSync(source("SectorAnalysisWindow.qml"), "utf8")
  assert.match(saw, /function toggleSector\(\)/)
  assert.match(saw, /Model\.sectorBaskets/)
})

test("candlestick chart renders broadening formation lines with white #FFFFFF and hierarchy dash/alpha styles", () => {
  const chart = fs.readFileSync(source("CandlestickChart.qml"), "utf8")
  assert.match(chart, /var strokeColor = Model\.isLightColor\(Color\.background\) \? Color\.foreground : "#FFFFFF"/)
  assert.match(chart, /var dashPattern = \(lvl === 0\) \? \[\] : \(\(lvl === 1\) \? \[6, 4\] : \[2, 3\]\)/)
  assert.match(chart, /var lineAlpha = \(lvl === 0\) \? 1\.0 : \(\(lvl === 1\) \? 0\.75 : 0\.40\)/)
  assert.match(chart, /ctx\.globalAlpha = lineAlpha/)
  assert.match(chart, /var isThirtyMinChart = \(root\.rangeKey === "30"/)
  assert.match(chart, /var isHourlyChart = \(root\.rangeKey === "60"/)
  assert.match(chart, /var isWeeklyChart = \(root\.rangeKey === "1W"/)
  assert.match(chart, /var isMonthlyChart = \(root\.rangeKey === "1M"/)
  assert.match(chart, /var anchorMode = isThirtyMinChart \? "day" : \(isHourlyChart \? "week" : \(isWeeklyChart \? "quarter" : \(isMonthlyChart \? "year" : "month"\)\)\)/)
})

test("alert engine integrates RTH session gating, edge-crossing state sync, price level alerts, and FinanceAlertsView", () => {
  const cell = fs.readFileSync(source("GridCell.qml"), "utf8")
  const win = fs.readFileSync(source("GridWindow.qml"), "utf8")
  const chart = fs.readFileSync(source("CandlestickChart.qml"), "utf8")
  const panel = fs.readFileSync(source("Panel.qml"), "utf8")
  const alertsView = fs.readFileSync(source("FinanceAlertsView.qml"), "utf8")

  assert.match(cell, /new Date\(root\.liveClockMs\)/)
  assert.match(win, /Model\.evaluateStratAlertTransition/)
  assert.match(win, /Model\.evaluatePriceLevelAlerts/)
  assert.match(chart, /function toggleEditingLevelAlert\(\)/)
  assert.match(chart, /function cycleEditingLevelCondition\(\)/)
  assert.match(panel, /FinanceAlertsView\s*\{/)
  assert.match(panel, /function evaluateWatchlistPriceAlerts\(incomingQuotes\)/)
  assert.match(panel, /function triggerWatchlistStratScan\(\)/)
  assert.match(alertsView, /Alert Book & Study Radar/)
})

test("grid window supports F fullscreen toggle, Tab/Backtab timeframe cycling in 1x1, chart double-click, and transient 1x1 persistence protection", () => {
  const cell = fs.readFileSync(source("GridCell.qml"), "utf8")
  const win = fs.readFileSync(source("GridWindow.qml"), "utf8")
  const chart = fs.readFileSync(source("CandlestickChart.qml"), "utf8")
  const panel = fs.readFileSync(source("Panel.qml"), "utf8")

  assert.match(win, /event\.key === Qt\.Key_F/)
  assert.match(win, /root\.toggleMaximize\(root\.resolveTargetCellIndex\(\)\)/)
  assert.match(win, /event\.key === Qt\.Key_Tab \|\| event\.key === Qt\.Key_Backtab/)
  assert.match(win, /var persistedMode = \(root\.gridMode === "1x1"\)/)
  assert.match(chart, /signal chartDoubleClicked/)
  assert.match(chart, /signal chartPressed/)
  assert.match(cell, /onChartDoubleClicked:/)
  assert.match(cell, /onChartPressed:/)
  assert.match(panel, /previousGridMode:\s*baseMode/)
})

test("sector analysis window supports multi-tier recursive locking, 4-worker chart engine, and 2+3 drilldown", () => {
  const win = fs.readFileSync(source("SectorAnalysisWindow.qml"), "utf8")
  const cell = fs.readFileSync(source("GridCell.qml"), "utf8")

  assert.match(win, /property var lockStack:\s*\[\]/)
  assert.match(win, /function pushLockTier\(\)/)
  assert.match(win, /function popLockTier\(targetLength\)/)
  assert.match(win, /function clearLockStack\(\)/)
  assert.match(win, /function getTierHoldingsCount\(tierIdx\)/)
  assert.match(win, /readonly property int activeLockedHoldingsCount:/)
  assert.match(win, /readonly property bool canLockNextTier:/)
  assert.match(win, /onSectorSymbolChanged:\s*\{[\s\S]*?root\.clearLockStack\(\)/)
  assert.match(win, /id:\s*lockBtn/)
  assert.match(win, /\(Locked\)/)
  assert.match(cell, /companyName/)
  assert.match(cell, /hideStratBadge/)
  assert.match(win, /readonly property var sectorTickers:\s*Model\.parseSectorTickers/)
  assert.match(win, /readonly property bool isMultiTicker:\s*sectorTickers\.length > 1/)
  assert.match(win, /font\.capitalization:\s*Font\.AllUppercase/)
  assert.match(win, /id:\s*sectorBox[\s\S]*?clip:\s*true/)
  assert.match(win, /onTextEdited:[\s\S]*?text\.toUpperCase\(\)/)
  assert.match(win, /"1:\s*"\s*\+\s*Math\.round\(root\.breadthMetrics\.pct1/)
  assert.match(win, /"3:\s*"\s*\+\s*Math\.round\(root\.breadthMetrics\.pct3/)
  assert.match(win, /"2u Red:\s*"\s*\+\s*Math\.round\(root\.breadthMetrics\.pctF2u/)
  assert.match(win, /"2d Green:\s*"\s*\+\s*Math\.round\(root\.breadthMetrics\.pctF2d/)
  assert.match(win, /root\.breadthMetrics\.isSimultaneous2u \? root\.upColor : root\.foreground/)
  assert.match(win, /root\.breadthMetrics\.isSimultaneous2d \? root\.downColor : root\.foreground/)
  assert.match(win, /function reloadSector\(sym\)/)
  assert.match(win, /property string holdingsFetchSymbol:/)
  assert.match(win, /property int globalBarCount:\s*\(Model && Model\.DEFAULT_ANALYSIS_BAR_COUNT !== undefined\) \? Model\.DEFAULT_ANALYSIS_BAR_COUNT : 8/)
  assert.match(win, /function setGlobalBarCount\(nextZoom\)/)
  assert.match(win, /id:\s*copyBtn/)
  assert.match(win, /function copyFilteredTickers\(\)/)
  assert.match(win, /Model\.formatTickerList\(root\.filteredTiles\)/)
  assert.match(win, /Quickshell\.execDetached\(\["wl-copy",\s*"-n",\s*"--",\s*text\]\)/)
  assert.match(win, /id:\s*copyFeedbackTimer/)
  assert.match(win, /"\\uf0c5"/)
  assert.match(win, /event\.modifiers & Qt\.ControlModifier[\s\S]*?event\.key === Qt\.Key_C/)
})

test("shared feedback primitives provide interactive, loading, status, empty-state, and transition support", () => {
  const chip = fs.readFileSync(source("FinanceChipButton.qml"), "utf8")
  const loader = fs.readFileSync(source("FinanceLoader.qml"), "utf8")
  const banner = fs.readFileSync(source("FinanceStatusBanner.qml"), "utf8")
  const backLink = fs.readFileSync(source("BackLink.qml"), "utf8")
  const surface = fs.readFileSync(source("FinanceSurface.qml"), "utf8")
  const listView = fs.readFileSync(source("FinanceListView.qml"), "utf8")
  const layoutsView = fs.readFileSync(source("FinanceLayoutsView.qml"), "utf8")
  const alertsView = fs.readFileSync(source("FinanceAlertsView.qml"), "utf8")
  const gridWin = fs.readFileSync(source("GridWindow.qml"), "utf8")
  const sectorWin = fs.readFileSync(source("SectorAnalysisWindow.qml"), "utf8")

  assert.match(chip, /Behavior on color/)
  assert.match(chip, /Style\.duration\(/)
  assert.match(chip, /hoverEnabled:\s*true/)
  assert.match(loader, /RotationAnimation on rotation/)
  assert.match(loader, /property real progress:/)
  assert.match(banner, /Accessible\.role:\s*Accessible\.AlertMessage/)
  assert.match(banner, /property int autoHideMs:/)
  assert.match(backLink, /hoverEnabled:\s*true/)
  assert.match(backLink, /Behavior on color/)
  assert.match(surface, /Behavior on border\.color/)
  assert.match(listView, /FinanceStatusBanner\s*\{/)
  assert.match(layoutsView, /FinanceStatusBanner\s*\{/)
  assert.match(alertsView, /FinanceStatusBanner\s*\{/)
  assert.match(gridWin, /FinanceChipButton\s*\{/)
  assert.match(gridWin, /FinanceLoader\s*\{/)
  assert.match(sectorWin, /FinanceChipButton\s*\{/)
  assert.match(sectorWin, /FinanceLoader\s*\{/)
  assert.match(sectorWin, /FinanceStatusBanner\s*\{/)
})


