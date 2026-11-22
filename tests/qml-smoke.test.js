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
  "InlineExpandSelector.qml",
  "FinanceInputBox.qml",
  "FinanceChipButton.qml",
  "FinanceLoader.qml",
  "FinanceStatusBanner.qml"
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
  assert.match(gridWin, /InlineExpandSelector\s*\{[\s\S]*?model:\s*\["2x2",\s*"2\+3",\s*"1x1"\]/)
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
  assert.match(cell, /InlineExpandSelector\s*\{[\s\S]*?model:\s*\["30",\s*"60",\s*"1D",\s*"1W",\s*"1M",\s*"1Y"\]/)
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

test("strat checklist UI, badge, popup, and checklist-driven strat alerts are completely removed", () => {
  const grid = fs.readFileSync(source("GridWindow.qml"), "utf8")
  const cell = fs.readFileSync(source("GridCell.qml"), "utf8")
  const panel = fs.readFileSync(source("Panel.qml"), "utf8")
  const alertsView = fs.readFileSync(source("FinanceAlertsView.qml"), "utf8")

  assert.equal(fs.existsSync(source("StratChecklistPopup.qml")), false)
  assert.doesNotMatch(cell, /stratChecklist|isExecutionTimeframeCell|stratBadgeText|cellChecklistPopup|stratTradeableDetected|hideStratBadge/)
  assert.doesNotMatch(grid, /masterStratChecklist|notifyStratTradeable|evaluateStratAlertTransition|discordAlertPayload|signalStates/)
  assert.doesNotMatch(panel, /evaluateStratChecklist|evaluateStratAlertTransition|discordAlertPayload|triggerWatchlistStratScan|armedWatchlistSetups|signalStates/)
  assert.doesNotMatch(alertsView, /Watchlist Strat Radar|armedWatchlistSetups/)
  assert.match(grid, /alertDispatchRequested/)
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
  assert.match(chart, /Model\.resolveHorizontalViewport\(total,\s*root\.viewCount,\s*defaultCount,\s*root\.viewStart,\s*root\.followLatest,\s*root\.rightOffsetBars\)/)
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

test("alert engine integrates RTH session gating, price level alerts, and FinanceAlertsView", () => {
  const win = fs.readFileSync(source("GridWindow.qml"), "utf8")
  const chart = fs.readFileSync(source("CandlestickChart.qml"), "utf8")
  const panel = fs.readFileSync(source("Panel.qml"), "utf8")
  const alertsView = fs.readFileSync(source("FinanceAlertsView.qml"), "utf8")

  assert.match(win, /Model\.evaluatePriceLevelAlerts/)
  assert.match(chart, /function toggleEditingLevelAlert\(\)/)
  assert.match(chart, /function cycleEditingLevelCondition\(\)/)
  assert.match(panel, /FinanceAlertsView\s*\{/)
  assert.match(panel, /function evaluateWatchlistPriceAlerts\(incomingQuotes\)/)
  assert.match(alertsView, /Alert Book/)
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
  assert.match(win, /readonly property var sectorTickers:\s*Model\.parseSectorTickers/)
  assert.match(win, /readonly property bool isMultiTicker:\s*sectorTickers\.length > 1/)
  const inputBox = fs.readFileSync(source("FinanceInputBox.qml"), "utf8")
  assert.match(win, /id:\s*sectorBox[\s\S]*?uppercase:\s*true/)
  assert.match(inputBox, /font\.capitalization:[\s\S]*?Font\.AllUppercase/)
  assert.match(inputBox, /clip:\s*true/)
  assert.match(inputBox, /onTextEdited:[\s\S]*?text\.toUpperCase\(\)/)
  assert.match(win, /label:\s*"1",\s*pct:\s*root\.breadthMetrics\.pct1/)
  assert.match(win, /label:\s*"3",\s*pct:\s*root\.breadthMetrics\.pct3/)
  assert.match(win, /label:\s*"2u Red",\s*pct:\s*root\.breadthMetrics\.pctF2u/)
  assert.match(win, /label:\s*"2d Green",\s*pct:\s*root\.breadthMetrics\.pctF2d/)
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

test("grid window and cell headers adapt or constrain controls without overlapping", () => {
  const gridWin = fs.readFileSync(source("GridWindow.qml"), "utf8")
  const gridCell = fs.readFileSync(source("GridCell.qml"), "utf8")
  const selector = fs.readFileSync(source("InlineExpandSelector.qml"), "utf8")

  assert.match(gridWin, /id:\s*masterHeader[\s\S]*?height:\s*Style\.space\(36\)/)
  assert.match(gridWin, /readonly property bool compactSync:/)
  assert.match(gridWin, /id:\s*leftControlsRow[\s\S]*?anchors\.right:\s*rightControlsRow\.left/)
  assert.match(gridWin, /QQC\.Popup\s*\{\s*id:\s*syncPopup/)
  assert.match(gridWin, /InlineExpandSelector\s*\{/)
  assert.match(gridCell, /anchors\.right:\s*\(stratTagItem\.visible\s*&&\s*stratTagItem\.width\s*>\s*0\)\s*\?\s*stratTagItem\.left\s*:\s*parent\.right/)
  assert.match(gridCell, /InlineExpandSelector\s*\{/)
  assert.match(selector, /HoverHandler\s*\{/)
})

test("sector analysis toolbar inputs share FinanceInputBox and scenario filter commits without debounce", () => {
  const inputBox = fs.readFileSync(source("FinanceInputBox.qml"), "utf8")
  const sectorWin = fs.readFileSync(source("SectorAnalysisWindow.qml"), "utf8")

  assert.match(inputBox, /FinanceSurface\s*\{/)
  assert.match(inputBox, /property int liveDebounceMs:\s*0/)
  assert.match(inputBox, /signal committed\(string text\)/)
  assert.match(inputBox, /if\s*\(activeFocus && root\.liveDebounceMs > 0\)/)
  assert.match(sectorWin, /FinanceInputBox\s*\{\s*id:\s*sectorBox/)
  assert.match(sectorWin, /FinanceInputBox\s*\{\s*id:\s*scenarioBox/)
  assert.match(sectorWin, /FinanceInputBox\s*\{\s*id:\s*barsBox/)
  assert.doesNotMatch(sectorWin, /scenarioDebounceTimer/)
  assert.doesNotMatch(sectorWin, /barDebounceTimer/)
})

test("sector breadth and chartCache lifecycle preserve JS arrays and recompute on cache changes", () => {
  const modelSrc = fs.readFileSync(source("Model.js"), "utf8")
  const panelSrc = fs.readFileSync(source("Panel.qml"), "utf8")
  const sectorWin = fs.readFileSync(source("SectorAnalysisWindow.qml"), "utf8")
  const banner = fs.readFileSync(source("FinanceStatusBanner.qml"), "utf8")

  // Model.js must use QVariantList-safe isArrayLike for candle/holding sequences
  assert.match(modelSrc, /function isArrayLike\(v\)/)
  assert.match(modelSrc, /function computeSectorBreadth[\s\S]*?if \(!isArrayLike\(candles\)/)
  assert.doesNotMatch(modelSrc, /function detectStratAttack|function computeBasketAttackMetrics/)
  assert.doesNotMatch(sectorWin, /detectStratAttack|computeBasketAttackMetrics/)
  assert.match(modelSrc, /function buildScenarioContext[\s\S]*?if \(!isArrayLike\(candles\)/)

  // Panel.qml must emit candleCacheUpdated on disk load and assign chartCache after createObject
  assert.match(panelSrc, /id:\s*candleCacheFile[\s\S]*?root\.candleCacheUpdated\(""\)/)
  assert.match(panelSrc, /root\.chartCache\[key\]\s*=\s*Model\.toArray\(candles\)/)
  assert.match(panelSrc, /function openSectorAnalysisWindow[\s\S]*?win\.chartCache\s*=\s*root\.chartCache/)
  assert.doesNotMatch(panelSrc, /sectorAnalysisComponent\.createObject\(root,\s*\{[\s\S]*?chartCache:\s*root\.chartCache/)

  // SectorAnalysisWindow must recompute breadth on chartCache and quotes changes
  assert.match(sectorWin, /onChartCacheChanged:\s*\{[\s\S]*?recomputeBreadthMetrics\(\)/)
  assert.match(sectorWin, /onQuotesChanged:\s*\{[\s\S]*?recomputeBreadthMetrics\(\)/)

  // FinanceStatusBanner must import Model.js
  assert.match(banner, /import\s+"Model\.js"\s+as\s+Model/)
})

test("regression guards: multi-ticker sync, chart quote protection, FinanceInputBox commit/selectAll, GridWindow wildcard cache key, and FinanceDetailView anchor", () => {
  const sectorWin = fs.readFileSync(source("SectorAnalysisWindow.qml"), "utf8")
  const panelSrc = fs.readFileSync(source("Panel.qml"), "utf8")
  const inputBox = fs.readFileSync(source("FinanceInputBox.qml"), "utf8")
  const gridWin = fs.readFileSync(source("GridWindow.qml"), "utf8")
  const detailView = fs.readFileSync(source("FinanceDetailView.qml"), "utf8")

  // 1. SectorAnalysisWindow derives tickers directly from Model.parseSectorTickers(root.sectorSymbol) in computeFilteredTiles & recomputeBreadthMetrics
  assert.match(sectorWin, /function recomputeBreadthMetrics\(\)\s*\{[\s\S]*?var tickers = Model\.parseSectorTickers\(root\.sectorSymbol\)/)
  assert.match(sectorWin, /function computeFilteredTiles\(\)\s*\{[\s\S]*?var tickers = Model\.parseSectorTickers\(root\.sectorSymbol\)/)
  assert.match(sectorWin, /onSectorTickersChanged:\s*syncTileModel\(\)/)
  assert.match(sectorWin, /function loadHoldingsForSector\(sym\)\s*\{[\s\S]*?syncTileModel\(\)/)
  assert.match(sectorWin, /q\.shortName \|\| q\.longName \|\| q\.name/)

  // 2. Panel.updateSharedCandles uses Model.mergeChartQuote so 1W/1M/60m charts never clobber 1D spark quotes
  assert.match(panelSrc, /function updateSharedCandles[\s\S]*?Model\.mergeChartQuote\(existing,\s*quoteEnriched\)/)
  assert.doesNotMatch(panelSrc, /function updateSharedCandles[\s\S]*?Object\.assign\(\{\},\s*existing,\s*quoteEnriched\)/)

  // 3. FinanceInputBox avoids Binding race on blur, prevents double-commit on Enter, and selects all on first click
  assert.doesNotMatch(inputBox, /Binding\s*\{\s*target:\s*textInput/)
  assert.match(inputBox, /property bool _skipBlurCommit:\s*false/)
  assert.match(inputBox, /enabled:\s*!textInput\.activeFocus[\s\S]*?textInput\.forceActiveFocus\(\)[\s\S]*?textInput\.selectAll\(\)/)

  // 4. GridWindow.notifyCacheKeyUpdated supports "" wildcard key
  assert.match(gridWin, /function notifyCacheKeyUpdated\(key\)\s*\{\s*var k = String\(key \|\| ""\);/)
  assert.doesNotMatch(gridWin, /function notifyCacheKeyUpdated\(key\)\s*\{\s*if \(!key\)\s*return;/)

  // 5. FinanceDetailView holdingsHeaderMouseArea anchors to sibling holdingsHeaderLeft, not nested child
  assert.doesNotMatch(detailView, /anchors\.fill:\s*holdingsTitleText/)
})



test("SectorAnalysisWindow preserves and labels @ ticker presets", () => {
  const win = fs.readFileSync(source("SectorAnalysisWindow.qml"), "utf8")
  assert.match(win, /function setSector\(sym\)\s*\{[\s\S]*?Model\.describeSectorInput\(sym\)[\s\S]*?Model\.normalizeSectorInput\(sym\)/)
  assert.match(win, /readonly property string sectorFullName:\s*\{[\s\S]*?Model\.describeSectorInput\(root\.sectorSymbol\)/)
})

test("real-time streaming hub, off-thread cache, active-gating, virtualized GridView, and batched Canvas optimizations are wired", () => {
  const panel = fs.readFileSync(source("Panel.qml"), "utf8")
  const grid = fs.readFileSync(source("GridWindow.qml"), "utf8")
  const cell = fs.readFileSync(source("GridCell.qml"), "utf8")
  const chart = fs.readFileSync(source("CandlestickChart.qml"), "utf8")
  const sector = fs.readFileSync(source("SectorAnalysisWindow.qml"), "utf8")
  const settings = fs.readFileSync(source("FinanceSettingsView.qml"), "utf8")
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"))

  // Phase 1: Dead refreshAttackScan removed; live developing candles & compression enabled
  assert.doesNotMatch(grid, /refreshAttackScan/)
  assert.match(grid, /function isChartFresh\(/)
  assert.match(grid, /function applyQuotesToDevelopingCandles\(/)
  assert.match(panel, /function applyLiveQuotesToDetailAndCache\(/)
  assert.match(panel, /Model\.armedAlertSymbols\(root\.symbolLevels\)/)

  // Phase 2: Persistent NDJSON streaming daemon + active/alert-gated lifecycle + liveStreaming setting
  assert.ok(fs.existsSync(path.join(root, "scripts", "market-stream.js")))
  assert.equal(manifest.barWidget.defaults.liveStreaming, true)
  assert.match(settings, /label:\s*"Real-time streaming"/)
  assert.match(panel, /id:\s*streamProc[\s\S]*?stdinEnabled:\s*true[\s\S]*?market-stream\.js/)
  assert.match(panel, /readonly property bool shouldStreamLive:/)
  assert.match(panel, /function handleStreamLine\(line\)/)
  assert.match(grid, /property bool hubStreamingActive:\s*false/)
  assert.match(sector, /property bool hubStreamingActive:\s*false/)

  // Phase 3: Off-thread compact v2 cache + in-memory pruning
  assert.match(panel, /function pruneInMemoryChartCache\(/)
  assert.match(panel, /op:\s*"cacheFlush"/)
  assert.match(panel, /Model\.unpackCandles/)

  // Phase 4: Active-gated GridCells, virtualized scrollable GridView (>36), lazy drilldown, coalesced/batched CandlestickChart
  assert.doesNotMatch(grid, /onQuotesChanged:\s*root\.notifyCacheKeyUpdated\(""\)/)
  assert.match(grid, /cellActive:\s*root\.visible && root\.gridMode === "1x1"/)
  assert.match(cell, /property bool cellActive:\s*true/)
  assert.match(cell, /renderActive:\s*root\.cellActive/)
  assert.match(chart, /function _flushGeometry\(\)/)
  assert.match(chart, /Qt\.callLater\(root\._flushGeometry\)/)
  assert.match(chart, /wheelZoomRequiresModifier/)
  assert.match(sector, /readonly property int virtualizeThreshold:\s*36/)
  assert.match(sector, /GridView\s*\{\s*id:\s*tileGridView/)
  assert.match(sector, /Loader\s*\{\s*id:\s*drillDownLoader[\s\S]*?active:\s*root\.inDrillDown/)
})

test("charts support 1-bar minimum zoom and interactive price scale (cursor, drag zoom/pan, wheel zoom, clipping, compact ticks, and Auto reset)", () => {
  const chart = fs.readFileSync(source("CandlestickChart.qml"), "utf8")
  const cell = fs.readFileSync(source("GridCell.qml"), "utf8")
  const grid = fs.readFileSync(source("GridWindow.qml"), "utf8")
  const sector = fs.readFileSync(source("SectorAnalysisWindow.qml"), "utf8")

  // Minimum bars = Model.MIN_BAR_COUNT (1) across chart, GridWindow, and SectorAnalysisWindow (no candle width cap)
  assert.match(chart, /Math\.max\(Model\.MIN_BAR_COUNT,/)
  assert.match(chart, /root\.configuredZoom >= Model\.MIN_BAR_COUNT/)
  assert.match(chart, /var candleW = slotW >= 7 \? Math\.max\(1, slotW - 4\)/)
  assert.match(grid, /root\.cellZooms\[index\] >= Model\.MIN_BAR_COUNT/)
  assert.doesNotMatch(sector, /Model\.MAX_BAR_COUNT/)

  // Price scale state, cursor, drag zoom/pan, wheel zoom, and hit-zone separation
  assert.match(chart, /property bool autoPriceScale:\s*true/)
  assert.match(chart, /property bool draggingPriceScale:\s*false/)
  assert.match(chart, /function resetPriceScale\(\)/)
  assert.match(chart, /Qt\.SizeVerCursor/)
  assert.match(chart, /Model\.priceScaleDragFactor/)
  assert.match(chart, /Model\.priceScaleWheelFactor/)
  assert.match(chart, /Model\.zoomPriceLogRange/)
  assert.match(chart, /Model\.panPriceLogRange/)
  assert.match(chart, /Model\.formatScalePrice/)
  assert.match(chart, /if \(root\.showPriceScale && px >= g\.right\)\s*return null;/)

  // Plot-area clipping, hover gutter affordance, off-screen badge indicator, and Auto ('A') reset button
  assert.match(chart, /ctx\.clip\(\);/)
  assert.match(chart, /root\.hoveringScale \|\| root\.draggingPriceScale/)
  assert.match(chart, /isLastAbove \? "▲" : \(isLastBelow \? "▼" : ""\)/)
  assert.match(chart, /id:\s*autoScaleResetBtn/)

  // Alt+R reset wiring across GridCell, GridWindow, and SectorAnalysisWindow (preserving bare R replay)
  assert.match(cell, /function resetPriceScale\(\)/)
  assert.match(cell, /event\.key === Qt\.Key_R && \(event\.modifiers & Qt\.AltModifier\)/)
  assert.match(grid, /event\.key === Qt\.Key_R && \(event\.modifiers & Qt\.AltModifier\)/)
  assert.match(sector, /signal resetAllPriceScalesRequested/)
  assert.match(sector, /\(event\.modifiers & Qt\.AltModifier\) && event\.key === Qt\.Key_R/)
})

test("real-time chart reliability: cache prune broadcast, onQuotesUpdated sync, stale-while-revalidate, session boundary, and RTH watchdog", () => {
  const panel = fs.readFileSync(source("Panel.qml"), "utf8")
  const hub = fs.readFileSync(source("HubRegistry.js"), "utf8")
  const grid = fs.readFileSync(source("GridWindow.qml"), "utf8")
  const sector = fs.readFileSync(source("SectorAnalysisWindow.qml"), "utf8")
  const stream = fs.readFileSync(path.join(root, "scripts", "market-stream.js"), "utf8")

  // 1. Prune notifies all child windows & follower panels; onQuotesUpdated defensively syncs chartCache
  assert.match(panel, /function pruneInMemoryChartCache[\s\S]*?root\.candleCacheUpdated\(""\);[\s\S]*?HubRegistry\.broadcastCandleKey\(root, root\.chartCache, ""\);/)
  assert.match(panel, /function onQuotesUpdated\(changedSymbols\)\s*\{\s*if \(gridWin\.chartCache !== root\.chartCache\)\s*gridWin\.chartCache = root\.chartCache;/)
  assert.match(panel, /function onQuotesUpdated\(changedSymbols\)\s*\{\s*if \(secWin\.chartCache !== root\.chartCache\)\s*secWin\.chartCache = root\.chartCache;/)
  assert.match(panel, /function collectProtectedCacheKeys\(\)[\s\S]*?HubRegistry\.allPanels\(\)/)

  // 2. Stale-while-revalidate on fromCache hits, 20s in-flight TTL, and intraday TFs in developing candle updates
  assert.match(panel, /msg\.fromCache && Model\.isCandleSeriesStale\(/)
  assert.match(panel, /\(Date\.now\(\) - inFlightTs\) < 20000/)
  assert.match(panel, /var tfs = \["1", "5", "15", "30", "60", "1D", "1W", "1M", "1Y"\];/)

  // 3. Centralized 09:30 / 16:00 ET session boundary detector + detail chartLiveTimer across all ranges
  assert.match(panel, /signal sessionBoundaryCrossed\(string sessionState\)/)
  assert.match(panel, /id:\s*sessionBoundaryTimer/)
  assert.match(panel, /running:\s*root\.opened && root\.view === "detail" && root\.detailSymbol !== ""/)
  assert.match(hub, /function broadcastSessionBoundary\(/)

  // 4. GridWindow does not stamp chartFetchedAt blindly in notifyCacheKeyUpdated; uses stale check and session boundary handler
  assert.doesNotMatch(grid, /function notifyCacheKeyUpdated\(key\)\s*\{[\s\S]*?root\.chartFetchedAt\[k\]\s*=\s*Date\.now\(\)/)
  assert.match(grid, /Model\.isCandleSeriesStale\(/)
  assert.match(grid, /function handleSessionBoundary\(/)

  // 5. SectorAnalysisWindow has viewport-only refresh, session boundary handler, pending cleanup, and no periodic tile polling timer
  assert.match(sector, /function refreshViewportCharts\(force\)/)
  assert.match(sector, /function handleSessionBoundary\(/)
  assert.match(sector, /function clearHubPendingKey\(key\)/)
  assert.match(sector, /Model\.isCandleSeriesStale\(/)
  assert.doesNotMatch(sector, /id:\s*tileRefreshTimer/)

  // 6. market-stream.js proto3 marketHours default, 45s RTH stale-socket watchdog, and safe async command catch
  assert.match(stream, /const hasMarketHours = decoded\[7\] !== undefined;/)
  assert.match(stream, /staleTimeoutMs:\s*45000/)
  assert.match(stream, /startWatchdog\(\)/)
  assert.match(stream, /Promise\.resolve\(handleCommand\(cmd\)\)\.catch\(/)
})

test("GridWindow automatic Strat setup lines toggle, solid rendering, and strict GridWindow-only scoping", () => {
  const grid = fs.readFileSync(source("GridWindow.qml"), "utf8")
  const cell = fs.readFileSync(source("GridCell.qml"), "utf8")
  const chart = fs.readFileSync(source("CandlestickChart.qml"), "utf8")
  const panel = fs.readFileSync(source("Panel.qml"), "utf8")
  const sector = fs.readFileSync(source("SectorAnalysisWindow.qml"), "utf8")
  const detail = fs.readFileSync(source("FinanceDetailView.qml"), "utf8")

  // GridWindow toggle defaults ON, sits beside BF chip, persists setupLines, hydrates 1W/1M, and wires all 8 GridCells
  assert.match(grid, /property bool showSetupLines:\s*true/)
  assert.match(grid, /id:\s*setupLinesChip[\s\S]*?text:\s*"SETUPS " \+ \(root\.showSetupLines \? "\[ON\]" : "\[OFF\]"\)/)
  assert.match(grid, /setupLines:\s*root\.showSetupLines/)
  assert.match(grid, /function getSetupLines\(sym, targetTf\)/)
  assert.match(grid, /Model\.computeTriggeredSetupLines\(/)
  assert.equal((grid.match(/setupLines:\s*root\.showSetupLines \? root\.getSetupLines\(/g) || []).length, 8)

  // Panel restores gridSync.setupLines (default true)
  assert.match(panel, /showSetupLines:\s*root\.gridSync \? root\.gridSync\.setupLines !== false : true/)

  // GridCell forwards setupLines; SectorAnalysisWindow and FinanceDetailView do NOT pass setupLines
  assert.match(cell, /property var setupLines:\s*\[\]/)
  assert.match(cell, /setupLines:\s*root\.setupLines/)
  assert.doesNotMatch(sector, /setupLines\s*:/)
  assert.doesNotMatch(detail, /setupLines\s*:/)

  // CandlestickChart renders solid setupLines with Model.setupLineColor (no dash pattern)
  assert.match(chart, /property var setupLines:\s*\[\]/)
  assert.match(chart, /onSetupLinesChanged:\s*refreshGeometry\(\)/)
  assert.match(chart, /Model\.setupLineColor\(sLine\.timeframe, sLine\.kind, slIsLight\)/)
  assert.match(chart, /ctx\.setLineDash\(\[\]\)/)

  // CandlestickChart supports TradingView-style right-side whitespace & unrestricted left/right horizontal panning
  assert.match(chart, /property int rightOffsetBars:\s*-1/)
  assert.match(chart, /Model\.resolveHorizontalViewport\(/)
  assert.match(chart, /var slotW = innerW \/ Math\.max\(1, vCount\);/)
  assert.match(chart, /if \(g\.maxStart > 0\)/)
  assert.match(chart, /if \(idx >= g\.candles\.length\)/)
})
