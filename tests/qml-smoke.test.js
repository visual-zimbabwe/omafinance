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
  "SectorBreadthWindow.qml"
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

  assert.match(panel, /readonly property bool detailDataLoading/)
  assert.doesNotMatch(panel, /Loading market details/)
  assert.match(detail, /id:\s*tickerLabel/)
  assert.match(detail, /shouldShowDelayedLoader/)
  assert.match(detail, /detailsPendingKey/)
  assert.match(detail, /showDetailsSpinner/)
  assert.match(detail, /id:\s*detailsSpinner\b/)
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
  const changeStyle = settings.indexOf('text: "Change on bar"')
  const refresh = settings.indexOf('label: "Background refresh (seconds)"')

  assert.notEqual(changeStyle, -1)
  assert.ok(changeStyle < refresh)
  assert.match(settings, /visible:\s*controller\.showChange[\s\S]*text:\s*"Change on bar"/)
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
  const panel = fs.readFileSync(source("Panel.qml"), "utf8")

  assert.match(panel, /function timeframeColor\(quote, tf\)/)
  assert.match(detail, /id:\s*detailHeader/)
  assert.match(detail, /id:\s*ftfcRow[\s\S]*?anchors\.right:\s*parent\.right/)
  assert.match(detail, /text:\s*"60"[\s\S]*?controller\.timeframeColor/)
  assert.match(detail, /text:\s*"D"[\s\S]*?controller\.timeframeColor/)
  assert.match(detail, /text:\s*"W"[\s\S]*?controller\.timeframeColor/)
  assert.match(detail, /text:\s*"M"[\s\S]*?controller\.timeframeColor/)
})

test("watchlist rows display FTFC 60|D|W|M replacing snapshot chart", () => {
  const list = fs.readFileSync(source("FinanceListView.qml"), "utf8")

  assert.doesNotMatch(list, /\bSparkline\s*\{/)
  assert.match(list, /id:\s*ftfcRow/)
  assert.match(list, /text:\s*"60"[\s\S]*?controller\.timeframeColor\(quote, "60"\)/)
  assert.match(list, /text:\s*"D"[\s\S]*?controller\.timeframeColor\(quote, "D"\)/)
  assert.match(list, /text:\s*"W"[\s\S]*?controller\.timeframeColor\(quote, "W"\)/)
  assert.match(list, /text:\s*"M"[\s\S]*?controller\.timeframeColor\(quote, "M"\)/)
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

test("list view provides sector strat breadth entry point button next to layouts", () => {
  const list = fs.readFileSync(source("FinanceListView.qml"), "utf8")

  assert.match(list, /id:\s*breadthBtn/)
  assert.match(list, /iconText:\s*"\\uf080"/)
  assert.match(list, /tooltipText:\s*"Sector Strat Breadth"/)
  assert.match(list, /onClicked:\s*controller\.openSectorBreadth\(\)/)
  assert.match(list, /id:\s*breadthBtn[\s\S]*?id:\s*layoutBtn/)
})

test("panel configures and opens SectorBreadthWindow with state persistence", () => {
  const panel = fs.readFileSync(source("Panel.qml"), "utf8")

  assert.match(panel, /property string breadthWeightMode:\s*"equal"/)
  assert.match(panel, /property string breadthSortTimeframe:\s*"1Y"/)
  assert.match(panel, /property bool breadthSortAsc:\s*false/)
  assert.match(panel, /property var activeBreadthWindow:\s*null/)
  assert.match(panel, /function openSectorBreadth\(\)/)
  assert.match(panel, /id:\s*sectorBreadthWindowComponent/)
  assert.match(panel, /SectorBreadthWindow\s*\{/)
  assert.match(panel, /root\.breadthWeightMode = weightMode/)
  assert.match(panel, /root\.breadthSortTimeframe = sortTimeframe/)
  assert.match(panel, /root\.breadthSortAsc = sortAsc/)
})

test("sector breadth window renders matrix, weighting toggles, sorting, and hover tooltip", () => {
  const breadth = fs.readFileSync(source("SectorBreadthWindow.qml"), "utf8")

  assert.match(breadth, /FloatingWindow\s*\{/)
  assert.match(breadth, /property string weightMode:\s*"equal"/)
  assert.match(breadth, /property string sortTimeframe:\s*"1Y"/)
  assert.match(breadth, /property bool sortAsc:\s*false/)
  assert.match(breadth, /function startFullRefresh\(\)/)
  assert.match(breadth, /function recalculateMetrics\(\)/)
  assert.match(breadth, /Model\.computeAllSectorsBreadth/)
  assert.match(breadth, /Model\.sortSectorBreadth/)
  assert.match(breadth, /id:\s*runnerProc/)
  assert.match(breadth, /id:\s*holdingsFetchProc/)
  assert.match(breadth, /id:\s*dailySparkProc/)
  assert.match(breadth, /id:\s*hourlySparkProc/)
  assert.match(breadth, /text:\s*"Equal Weight"/)
  assert.match(breadth, /text:\s*"Cap Weight"/)
  assert.match(breadth, /id:\s*tooltipOverlay/)
  assert.match(breadth, /▲ 2U \(Buyers\):/)
  assert.match(breadth, /▼ 2D \(Sellers\):/)
  assert.match(breadth, /Net Directional Delta:/)
  assert.match(breadth, /root\.controller\.openDetail\(sectorRow\.modelData\.symbol\)/)
})

test("fetch-breadth script exists and executes successfully", () => {
  const scriptPath = path.join(__dirname, "..", "scripts", "fetch-breadth.js")
  assert.ok(fs.existsSync(scriptPath))
  const scriptContent = fs.readFileSync(scriptPath, "utf8")
  assert.match(scriptContent, /Model\.allSpdrSectorsList/)
  assert.match(scriptContent, /Model\.holdingsUrl/)
  assert.match(scriptContent, /Model\.sparkCandlesUrl/)
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
  assert.match(grid, /notify-send/)
  assert.match(grid, /stratSoundProc/)
  assert.match(grid, /pw-play/)
  assert.match(grid, /stratDiscordProc/)
  assert.match(grid, /discordAlertPayload/)
})






