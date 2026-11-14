import QtQuick
import QtQuick.Controls as QQC
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

FloatingWindow {
    id: root

    property string sectorSymbol: "SMH"
    readonly property var sectorTickers: Model.parseSectorTickers(root.sectorSymbol)
    readonly property bool isMultiTicker: sectorTickers.length > 1
    readonly property var sectorInfo: (!root.isMultiTicker && sectorTickers.length > 0) ? Model.getSectorInfo(sectorTickers[0]) : null
    readonly property string sectorFullName: {
        if (root.isMultiTicker) {
            return sectorTickers.length + " Tickers";
        }
        if (root.sectorInfo) {
            return root.sectorInfo.name;
        }
        var s = (sectorTickers.length === 1) ? sectorTickers[0] : root.sectorSymbol;
        var q = root.quotes[s];
        if (q && (q.shortName || q.longName)) {
            return q.shortName || q.longName;
        }
        return "";
    }
    property string timeframe: "1W"
    property string scenarioFilter: ""
    property string sortField: "weight" // "weight", "mcap", "price", "change", "atr"
    property bool sortAscending: false
    property bool showBroadening: true
    property bool syncCrosshair: true
    property int globalBarCount: (Model && Model.DEFAULT_ANALYSIS_BAR_COUNT !== undefined) ? Model.DEFAULT_ANALYSIS_BAR_COUNT : 8

    property int activeTileIndex: 0
    property bool inDrillDown: false
    property string drillDownSymbol: ""

    property var lockStack: []
    readonly property var activeLockedSymbols: (root.lockStack && root.lockStack.length > 0) ? root.lockStack[root.lockStack.length - 1] : null

    property var holdings: []
    property string holdingsFetchSymbol: ""
    property var quotes: ({})
    property var chartCache: ({})
    property var symbolLevels: ({})
    property var pendingFetches: []
    property var pendingQuoteChunks: []
    property bool fetching: false

    property string discordWebhook: ""
    property bool alertsMuted: false
    property string alertsMuteStatus: ""

    signal alertDispatchRequested(var alert)
    signal alertsMuteToggleRequested
    signal symbolLevelsChangedExternally(string sym, var nextLevels)
    signal quotesReceived(var incomingQuotes)
    signal chartDataReceived(string key, var candles, var quoteEnriched)
    signal symbolDataUpdated(string sym)
    property int drillDownDataRev: 0

    function notifyCacheKeyUpdated(key) {
        var k = String(key || "");
        var sep = k.lastIndexOf("_");
        var sym = sep >= 0 ? k.slice(0, sep) : "";
        if (sym) {
            root.symbolDataUpdated(sym);
            if (root.inDrillDown && sym === root.drillDownSymbol)
                root.drillDownDataRev++;
        } else {
            root.symbolDataUpdated("");
            if (root.inDrillDown)
                root.drillDownDataRev++;
        }
        if (!breadthUpdateTimer.running)
            breadthUpdateTimer.start();
        if (((root.scenarioFilter || "").trim() !== "" || root.sortField !== "weight") && !tileModelSyncTimer.running)
            tileModelSyncTimer.start();
    }

    function notifyQuotesUpdated(changedSymbols) {
        if (!Array.isArray(changedSymbols) || changedSymbols.length === 0)
            return;
        for (var i = 0; i < changedSymbols.length; i++) {
            var s = changedSymbols[i];
            if (s) {
                root.symbolDataUpdated(s);
                if (root.inDrillDown && s === root.drillDownSymbol)
                    root.drillDownDataRev++;
            }
        }
        if (!breadthUpdateTimer.running)
            breadthUpdateTimer.start();
        if (((root.scenarioFilter || "").trim() !== "" || root.sortField !== "weight") && !tileModelSyncTimer.running)
            tileModelSyncTimer.start();
    }

    title: {
        var t = root.sectorTickers;
        var label = (t.length > 1) ? t.join(", ") : root.sectorSymbol;
        return "Omafinance Sector Analysis - " + label + " (" + root.timeframe + ")";
    }
    color: Color.background
    implicitWidth: Style.space(1360)
    implicitHeight: Style.space(880)
    minimumSize: Qt.size(Style.space(800), Style.space(550))

    readonly property color foreground: Color.foreground
    readonly property color dim: Model.accessibleDimColor(foreground, Color.background)
    readonly property color upColor: Model.accessibleSemanticColor("up", Color.background)
    readonly property color downColor: Model.accessibleSemanticColor("down", Color.background)
    readonly property string fontFamily: Style.font.family

    function reloadSector(sym) {
        var raw = (typeof sym === "string" && sym.length > 0) ? sym : root.sectorSymbol;
        var tickers = Model.parseSectorTickers(raw);
        var isMulti = tickers.length > 1;
        var s = (tickers.length === 1) ? tickers[0] : raw;
        if (!isMulti && Model.isBasketSector(s)) {
            loadHoldingsForSector(s);
        } else {
            root.holdingsFetchSymbol = "";
            root.holdings = [];
            syncTileModel();
            recomputeBreadthMetrics();
            refreshBatchQuotes();
            refreshVisibleCharts(false);
        }
    }

    Component.onCompleted: {
        root.reloadSector(root.sectorSymbol);
    }

    onSectorSymbolChanged: {
        root.clearLockStack();
        root.reloadSector(root.sectorSymbol);
    }

    function getTierHoldingsCount(tierIdx) {
        if (!root.lockStack || tierIdx < 0 || tierIdx >= root.lockStack.length)
            return 0;
        var list = root.lockStack[tierIdx];
        if (root.isMultiTicker)
            return list.length;
        var c = 0;
        for (var i = 0; i < list.length; i++) {
            if (list[i] !== root.sectorSymbol)
                c++;
        }
        return c;
    }

    readonly property int activeLockedHoldingsCount: {
        if (!root.activeLockedSymbols)
            return root.totalHoldingsCount;
        if (root.isMultiTicker)
            return root.activeLockedSymbols.length;
        var c = 0;
        for (var i = 0; i < root.activeLockedSymbols.length; i++) {
            if (root.activeLockedSymbols[i] !== root.sectorSymbol)
                c++;
        }
        return c;
    }

    readonly property bool canLockNextTier: {
        if (root.matchingHoldingsCount === 0)
            return false;
        if (root.lockStack.length === 0)
            return true;
        return root.matchingHoldingsCount < root.activeLockedHoldingsCount;
    }

    function clearScenarioFilter() {
        root.scenarioFilter = "";
        if (typeof scenarioBox !== "undefined")
            scenarioBox.clearText();
    }

    function pushLockTier() {
        var symbols = Model.extractSymbols(root.filteredTiles);
        if (symbols.length === 0)
            return;
        var nextStack = root.lockStack ? root.lockStack.slice() : [];
        nextStack.push(symbols);
        root.lockStack = nextStack;
        root.activeTileIndex = 0;
        clearScenarioFilter();
    }

    function copyFilteredTickers() {
        var text = Model.formatTickerList(root.filteredTiles);
        if (!text || text.length === 0)
            return;
        Quickshell.execDetached(["wl-copy", "-n", "--", text]);
        copyFeedbackTimer.restart();
    }

    function popLockTier(targetLength) {
        if (!root.lockStack || targetLength <= 0 || targetLength > root.lockStack.length)
            return;
        root.lockStack = root.lockStack.slice(0, targetLength);
        root.activeTileIndex = 0;
    }

    function clearLockStack() {
        root.lockStack = [];
        root.activeTileIndex = 0;
        clearScenarioFilter();
    }

    onTimeframeChanged: {
        syncTileModel();
        recomputeBreadthMetrics();
        refreshVisibleCharts(true);
    }

    onScenarioFilterChanged: {
        root.activeTileIndex = 0;
        syncTileModel();
    }

    function toggleSector() {
        var keys = Object.keys(Model.sectorBaskets);
        if (!keys || keys.length === 0)
            return;
        var idx = keys.indexOf(root.sectorSymbol);
        var nextIdx = (idx + 1) % keys.length;
        root.sectorSymbol = keys[nextIdx] || "SMH";
    }

    function setSector(sym) {
        var parsed = Model.parseSectorTickers(sym);
        if (parsed.length > 0) {
            var joined = parsed.join(",");
            if (joined !== root.sectorSymbol) {
                root.sectorSymbol = joined;
            }
        }
    }

    function setTimeframe(tf) {
        if (tf && tf !== root.timeframe) {
            root.timeframe = tf;
        }
    }

    property int pendingGlobalBarCount: -2
    function normalizeGlobalZoom(nextZoom) {
        if (nextZoom === -1 || String(nextZoom).trim().toUpperCase() === "ALL")
            return -1;
        return (typeof Model.clampBarCount === "function") ? Model.clampBarCount(nextZoom) : Math.max(8, parseInt(nextZoom, 10) || 8);
    }

    function setGlobalBarCount(nextZoom) {
        var clamped = root.normalizeGlobalZoom(nextZoom);
        if (root.globalBarCount !== clamped) {
            root.globalBarCount = clamped;
        }
    }

    function setGlobalBarCountDebounced(nextZoom) {
        var clamped = root.normalizeGlobalZoom(nextZoom);
        if (clamped !== root.globalBarCount) {
            root.pendingGlobalBarCount = clamped;
            chartZoomDebounceTimer.restart();
        }
    }

    function toggleSortDirection() {
        root.sortAscending = !root.sortAscending;
    }

    function cycleSortField() {
        var fields = ["weight", "mcap", "price", "change", "atr"];
        var idx = fields.indexOf(root.sortField);
        var nextIdx = (idx + 1) % fields.length;
        root.sortField = fields[nextIdx];
    }

    function loadHoldingsForSector(sym) {
        root.holdings = [];
        root.holdingsFetchSymbol = sym;
        if (holdingsProc.running) {
            holdingsProc.signal(9);
        }
        var home = Quickshell.env("HOME") || "/home/juwimana";
        var fpath = home + "/.cache/omafinance/holdings/" + sym + ".json";
        holdingsProc.command = ["cat", fpath];
        holdingsProc.running = true;
    }

    Process {
        id: holdingsProc
        onExited: function (exitCode) {
            if (root.holdingsFetchSymbol !== root.sectorSymbol)
                return;
            var raw = String(holdingsStdout.text || "").trim();
            if (exitCode === 0 && raw) {
                try {
                    var parsed = JSON.parse(raw);
                    if (parsed && Array.isArray(parsed.holdings)) {
                        root.holdings = parsed.holdings;
                    }
                } catch (e) {
                    console.log("[SectorAnalysis] Error parsing holdings:", e);
                }
            }
            refreshBatchQuotes();
            refreshVisibleCharts(false);
        }
        stdout: StdioCollector {
            id: holdingsStdout
            waitForEnd: true
        }
    }

    // Breadth Attack Metrics Calculation (Equal-Weighted, throttled via breadthUpdateTimer)
    property var breadthMetrics: Model.computeBasketAttackMetrics("", "", "Sector", [], {}, {}, "1W")

    function recomputeBreadthMetrics() {
        var dailyCandlesMap = {};
        var targetHoldings = [];
        var labelSym = root.sectorSymbol;
        var labelName = root.sectorFullName;

        if (root.isMultiTicker) {
            for (var i = 0; i < root.sectorTickers.length; i++) {
                var sym = root.sectorTickers[i];
                targetHoldings.push({
                    symbol: sym
                });
                dailyCandlesMap[sym] = root.getCandles(sym, root.timeframe);
            }
        } else {
            for (var j = 0; j < root.holdings.length; j++) {
                var h = root.holdings[j];
                if (h && h.symbol) {
                    var s = h.symbol;
                    dailyCandlesMap[s] = root.getCandles(s, root.timeframe);
                }
            }
            targetHoldings = root.holdings;
        }
        root.breadthMetrics = Model.computeBasketAttackMetrics(labelSym, labelName, "Sector", targetHoldings, dailyCandlesMap, root.quotes, root.timeframe);
    }

    Timer {
        id: breadthUpdateTimer
        interval: 150
        repeat: false
        onTriggered: root.recomputeBreadthMetrics()
    }

    Timer {
        id: tileModelSyncTimer
        interval: 220
        repeat: false
        onTriggered: root.syncTileModel()
    }

    ListModel {
        id: tileListModel
    }

    property var filteredTiles: []

    function computeFilteredTiles() {
        var list = [];
        var filterQuery = (root.scenarioFilter || "").trim();
        var lockedSyms = root.activeLockedSymbols;

        if (root.isMultiTicker) {
            var matchedMulti = [];
            for (var m = 0; m < root.sectorTickers.length; m++) {
                var sym = root.sectorTickers[m];
                if (lockedSyms && lockedSyms.indexOf(sym) === -1)
                    continue;

                var candles = root.getCandles(sym, root.timeframe);
                var quote = root.quotes[sym] || null;
                var matches = true;
                if (filterQuery.length > 0) {
                    matches = Model.matchesScenarioQuery(candles, quote, filterQuery);
                }
                if (matches) {
                    var sInfo = Model.getSectorInfo(sym);
                    var qName = quote ? (quote.shortName || quote.longName || quote.name) : "";
                    matchedMulti.push({
                        symbol: sym,
                        name: sInfo ? sInfo.name : (qName || sym),
                        isEtf: !!sInfo,
                        pctVal: 0,
                        valUSD: 0
                    });
                }
            }
            if (root.sortField === "weight") {
                return root.sortAscending ? matchedMulti.slice().reverse() : matchedMulti;
            } else {
                return Model.sortSectorHoldings(matchedMulti, root.sortField, root.sortAscending ? "asc" : "desc", root.quotes);
            }
        }

        // Single Ticker Mode: Sector ETF Benchmark Tile Candidate
        var etfSymbol = (root.sectorTickers.length === 1) ? root.sectorTickers[0] : root.sectorSymbol;
        var etfInUniverse = (!lockedSyms || lockedSyms.indexOf(etfSymbol) !== -1);
        if (etfInUniverse) {
            var etfCandles = root.getCandles(etfSymbol, root.timeframe);
            var etfQuote = root.quotes[etfSymbol] || null;
            var etfMatches = true;
            if (filterQuery.length > 0) {
                etfMatches = Model.matchesScenarioQuery(etfCandles, etfQuote, filterQuery);
            }
            if (etfMatches) {
                list.push({
                    symbol: etfSymbol,
                    name: root.sectorFullName ? (root.sectorFullName + " (Sector ETF)") : (etfQuote ? (etfQuote.shortName || etfQuote.longName || etfSymbol) : etfSymbol),
                    isEtf: true,
                    pctVal: 100,
                    valUSD: 0
                });
            }
        }

        // Single Ticker Mode: Component Holdings
        var matchedHoldings = [];
        for (var i = 0; i < root.holdings.length; i++) {
            var h = root.holdings[i];
            if (!h || !h.symbol || h.delisted)
                continue;
            var cSym = h.symbol;
            if (lockedSyms && lockedSyms.indexOf(cSym) === -1)
                continue;

            var cCandles = root.getCandles(cSym, root.timeframe);
            var cQuote = root.quotes[cSym] || null;

            var cMatches = true;
            if (filterQuery.length > 0) {
                cMatches = Model.matchesScenarioQuery(cCandles, cQuote, filterQuery);
            }
            if (cMatches) {
                matchedHoldings.push(h);
            }
        }

        // Sort Component Holdings
        var sorted = Model.sortSectorHoldings(matchedHoldings, root.sortField, root.sortAscending ? "asc" : "desc", root.quotes);
        for (var j = 0; j < sorted.length; j++) {
            list.push(sorted[j]);
        }

        return list;
    }

    function syncTileModel() {
        var nextList = root.computeFilteredTiles();
        root.filteredTiles = nextList;

        // Fast path: if exact same symbols in same order, only update metadata in-place (zero delegate churn)
        if (tileListModel.count === nextList.length) {
            var sameOrder = true;
            for (var k = 0; k < nextList.length; k++) {
                if (tileListModel.get(k).symbol !== nextList[k].symbol) {
                    sameOrder = false;
                    break;
                }
            }
            if (sameOrder) {
                for (var u = 0; u < nextList.length; u++) {
                    var itemU = nextList[u];
                    var rowU = tileListModel.get(u);
                    var nextName = itemU.name || "";
                    if (rowU.name !== nextName)
                        tileListModel.setProperty(u, "name", nextName);
                }
                return;
            }
        }

        // Incremental diff by symbol so surviving tiles keep their GridCell & Canvas instances
        var wanted = ({});
        for (var w = 0; w < nextList.length; w++) {
            wanted[nextList[w].symbol] = true;
        }
        for (var r = tileListModel.count - 1; r >= 0; r--) {
            if (!wanted[tileListModel.get(r).symbol])
                tileListModel.remove(r);
        }
        for (var idx = 0; idx < nextList.length; idx++) {
            var target = nextList[idx];
            var foundIdx = -1;
            for (var s = idx; s < tileListModel.count; s++) {
                if (tileListModel.get(s).symbol === target.symbol) {
                    foundIdx = s;
                    break;
                }
            }
            var rowObj = {
                symbol: target.symbol,
                name: target.name || "",
                isEtf: !!target.isEtf,
                pctVal: Number(target.pctVal) || 0,
                valUSD: Number(target.valUSD) || 0
            };
            if (foundIdx === idx) {
                var cur = tileListModel.get(idx);
                if (cur.name !== rowObj.name)
                    tileListModel.setProperty(idx, "name", rowObj.name);
            } else if (foundIdx > idx) {
                tileListModel.move(foundIdx, idx, 1);
                var moved = tileListModel.get(idx);
                if (moved.name !== rowObj.name)
                    tileListModel.setProperty(idx, "name", rowObj.name);
            } else {
                tileListModel.insert(idx, rowObj);
            }
        }
    }

    onHoldingsChanged: {
        syncTileModel();
        recomputeBreadthMetrics();
    }
    onChartCacheChanged: {
        syncTileModel();
        recomputeBreadthMetrics();
        root.symbolDataUpdated("");
        if (root.inDrillDown)
            root.drillDownDataRev++;
    }
    onQuotesChanged: {
        recomputeBreadthMetrics();
    }
    onSortFieldChanged: syncTileModel()
    onSortAscendingChanged: syncTileModel()
    onActiveLockedSymbolsChanged: syncTileModel()

    readonly property int totalHoldingsCount: {
        if (root.isMultiTicker) {
            return root.sectorTickers.length;
        }
        return root.holdings.length > 0 ? root.holdings.length : 1;
    }

    readonly property int matchingHoldingsCount: {
        if (root.isMultiTicker) {
            return root.filteredTiles.length;
        }
        var count = 0;
        for (var i = 0; i < root.filteredTiles.length; i++) {
            if (!root.filteredTiles[i].isEtf || root.holdings.length === 0)
                count++;
        }
        return count;
    }

    // Live Batch Quotes (15-second interval)
    function getAllSymbols() {
        var tickers = Model.parseSectorTickers(root.sectorSymbol);
        if (tickers.length > 1) {
            return tickers;
        }
        var singleSym = (tickers.length === 1) ? tickers[0] : root.sectorSymbol;
        var syms = singleSym ? [singleSym] : [];
        if (Model.isBasketSector(singleSym)) {
            var hSyms = Model.extractSymbols(root.holdings);
            for (var i = 0; i < hSyms.length; i++) {
                if (syms.indexOf(hSyms[i]) === -1)
                    syms.push(hSyms[i]);
            }
        }
        return syms;
    }

    function refreshBatchQuotes() {
        var syms = getAllSymbols();
        if (syms.length === 0)
            return;
        root.pendingQuoteChunks = Model.chunkSymbols(syms, 20);
        if (!quoteProc.running)
            processNextQuoteChunk();
    }

    function processNextQuoteChunk() {
        if (root.pendingQuoteChunks.length === 0)
            return;
        var nextChunk = root.pendingQuoteChunks.shift();
        quoteProc.command = ["curl", "-fsS", "--max-time", "8", "-A", "Mozilla/5.0", Model.sparkUrl(nextChunk)];
        quoteProc.running = true;
    }

    Process {
        id: quoteProc
        onExited: function (exitCode) {
            var raw = String(quoteStdout.text || "").trim();
            if (exitCode === 0 && raw) {
                try {
                    var parsed = Model.parseSpark(raw);
                    if (parsed && typeof parsed === "object") {
                        var keys = Object.keys(parsed);
                        for (var qi = 0; qi < keys.length; qi++) {
                            var qs = keys[qi];
                            var existingQ = root.quotes[qs];
                            root.quotes[qs] = existingQ ? Object.assign({}, existingQ, parsed[qs]) : parsed[qs];
                        }
                        root.quotesReceived(parsed);
                        if (!root.chartCache)
                            root.chartCache = ({});
                        var nowDate = new Date();
                        var tfs = [root.timeframe, "1D", "60"];
                        for (var ki = 0; ki < keys.length; ki++) {
                            var s = keys[ki];
                            var q = parsed[s];
                            Model.updateCachedDevelopingCandles(root.chartCache, s, q, tfs, nowDate);
                        }
                        root.notifyQuotesUpdated(keys);
                    }
                } catch (e) {
                    console.log("[SectorAnalysis] Error parsing spark quotes:", e);
                }
            }
            if (root.pendingQuoteChunks.length > 0) {
                Qt.callLater(root.processNextQuoteChunk);
            }
        }
        stdout: StdioCollector {
            id: quoteStdout
            waitForEnd: true
        }
    }

    Timer {
        id: quoteRefreshTimer
        interval: 15000
        running: root.visible
        repeat: true
        onTriggered: {
            root.refreshBatchQuotes();
            if (root.inDrillDown && root.drillDownSymbol) {
                root.queueFetch(root.drillDownSymbol, "30", true);
                root.queueFetch(root.drillDownSymbol, "60", true);
                root.queueFetch(root.drillDownSymbol, "1D", true);
                root.queueFetch(root.drillDownSymbol, "1W", true);
                root.queueFetch(root.drillDownSymbol, "1M", true);
            }
        }
    }

    // Chart Fetch Engine (Multi-Worker Parallel Fetching)
    function cacheKey(sym, tf) {
        return Model.cacheKey(sym, tf);
    }

    function getCandles(sym, tf) {
        var key = cacheKey(sym, tf);
        return root.chartCache[key] || [];
    }

    function queueFetch(sym, tf, force) {
        var key = cacheKey(sym, tf);
        if (!force && root.chartCache[key] && root.chartCache[key].length > 0)
            return;
        for (var i = 0; i < root.pendingFetches.length; i++) {
            if (root.pendingFetches[i].symbol === sym && root.pendingFetches[i].rangeKey === tf)
                return;
        }
        root.pendingFetches.push({
            symbol: sym,
            rangeKey: tf
        });
        triggerWorkers();
    }

    function requestChartFetch(sym, tf, force) {
        queueFetch(sym, tf, force);
    }

    function triggerWorkers() {
        if (!worker0.running && root.pendingFetches.length > 0)
            worker0.startNext();
        if (!worker1.running && root.pendingFetches.length > 0)
            worker1.startNext();
        if (!worker2.running && root.pendingFetches.length > 0)
            worker2.startNext();
        if (!worker3.running && root.pendingFetches.length > 0)
            worker3.startNext();
    }

    function handleWorkerResult(sym, tf, raw, exitCode) {
        if (exitCode === 0 && raw) {
            try {
                var parsed = Model.parseChart(raw, tf, sym);
                if (parsed && Array.isArray(parsed.candles) && parsed.candles.length > 0) {
                    var k = root.cacheKey(sym, tf);
                    if (!root.chartCache)
                        root.chartCache = ({});
                    root.chartCache[k] = parsed.candles;
                    root.notifyCacheKeyUpdated(k);
                    root.chartDataReceived(k, parsed.candles, parsed.symbol ? parsed : null);

                    if (parsed.symbol && !root.quotes[sym]) {
                        root.quotes[sym] = parsed;
                        var singleMap = ({});
                        singleMap[sym] = parsed;
                        root.quotesReceived(singleMap);
                        root.notifyQuotesUpdated([sym]);
                    }
                }
            } catch (e) {
                console.log("[SectorAnalysis] Chart parse error:", sym, tf, e);
            }
        }
        Qt.callLater(root.triggerWorkers);
    }

    Process {
        id: worker0
        property string curSym: ""
        property string curRange: ""
        function startNext() {
            if (root.pendingFetches.length === 0 || running)
                return;
            var next = root.pendingFetches.shift();
            curSym = next.symbol;
            curRange = next.rangeKey;
            var spec = Model.chartSpec(curRange);
            if (!spec) {
                Qt.callLater(root.triggerWorkers);
                return;
            }
            command = Model.chartCommand(curSym, curRange, spec);
            running = true;
        }
        onExited: function (exitCode) {
            root.handleWorkerResult(curSym, curRange, worker0Out.text, exitCode);
        }
        stdout: StdioCollector {
            id: worker0Out
            waitForEnd: true
        }
    }

    Process {
        id: worker1
        property string curSym: ""
        property string curRange: ""
        function startNext() {
            if (root.pendingFetches.length === 0 || running)
                return;
            var next = root.pendingFetches.shift();
            curSym = next.symbol;
            curRange = next.rangeKey;
            var spec = Model.chartSpec(curRange);
            if (!spec) {
                Qt.callLater(root.triggerWorkers);
                return;
            }
            command = Model.chartCommand(curSym, curRange, spec);
            running = true;
        }
        onExited: function (exitCode) {
            root.handleWorkerResult(curSym, curRange, worker1Out.text, exitCode);
        }
        stdout: StdioCollector {
            id: worker1Out
            waitForEnd: true
        }
    }

    Process {
        id: worker2
        property string curSym: ""
        property string curRange: ""
        function startNext() {
            if (root.pendingFetches.length === 0 || running)
                return;
            var next = root.pendingFetches.shift();
            curSym = next.symbol;
            curRange = next.rangeKey;
            var spec = Model.chartSpec(curRange);
            if (!spec) {
                Qt.callLater(root.triggerWorkers);
                return;
            }
            command = Model.chartCommand(curSym, curRange, spec);
            running = true;
        }
        onExited: function (exitCode) {
            root.handleWorkerResult(curSym, curRange, worker2Out.text, exitCode);
        }
        stdout: StdioCollector {
            id: worker2Out
            waitForEnd: true
        }
    }

    Process {
        id: worker3
        property string curSym: ""
        property string curRange: ""
        function startNext() {
            if (root.pendingFetches.length === 0 || running)
                return;
            var next = root.pendingFetches.shift();
            curSym = next.symbol;
            curRange = next.rangeKey;
            var spec = Model.chartSpec(curRange);
            if (!spec) {
                Qt.callLater(root.triggerWorkers);
                return;
            }
            command = Model.chartCommand(curSym, curRange, spec);
            running = true;
        }
        onExited: function (exitCode) {
            root.handleWorkerResult(curSym, curRange, worker3Out.text, exitCode);
        }
        stdout: StdioCollector {
            id: worker3Out
            waitForEnd: true
        }
    }

    function refreshVisibleCharts(force) {
        var syms = getAllSymbols();
        // 1. Priority 1: active timeframe for ALL symbols
        for (var i = 0; i < syms.length; i++) {
            queueFetch(syms[i], root.timeframe, force);
        }
        // 2. Priority 2: 1D and 60m for breadth calculations (only if not already cached)
        if (root.timeframe !== "1D") {
            for (var j = 0; j < syms.length; j++) {
                queueFetch(syms[j], "1D", false);
            }
        }
        if (root.timeframe !== "60") {
            for (var k = 0; k < syms.length; k++) {
                queueFetch(syms[k], "60", false);
            }
        }
    }

    onInDrillDownChanged: {
        if (root.inDrillDown && root.drillDownSymbol) {
            queueFetch(root.drillDownSymbol, "30", false);
            queueFetch(root.drillDownSymbol, "60", false);
            queueFetch(root.drillDownSymbol, "1D", false);
            queueFetch(root.drillDownSymbol, "1W", false);
            queueFetch(root.drillDownSymbol, "1M", false);
        }
    }

    // Crosshair Sync Handler across 1x1 Tiles
    property real syncedCrosshairTimestamp: 0
    property real syncedCrosshairPrice: 0
    property string syncedCrosshairSourceSymbol: ""

    function broadcastCrosshair(srcSym, ts, pr, c) {
        root.syncedCrosshairSourceSymbol = srcSym;
        root.syncedCrosshairTimestamp = ts;
        root.syncedCrosshairPrice = pr;
    }

    function clearCrosshair() {
        root.syncedCrosshairSourceSymbol = "";
        root.syncedCrosshairTimestamp = 0;
        root.syncedCrosshairPrice = 0;
    }

    // Keyboard Shortcuts
    Item {
        id: keyboardListener
        anchors.fill: parent
        focus: true

        Keys.onPressed: function (event) {
            if ((event.modifiers & Qt.ControlModifier) && event.key === Qt.Key_C) {
                if (!root.inDrillDown && root.filteredTiles.length > 0) {
                    root.copyFilteredTickers();
                    event.accepted = true;
                    return;
                }
            }
            if (event.key === Qt.Key_Escape) {
                if (root.inDrillDown) {
                    root.inDrillDown = false;
                    event.accepted = true;
                    return;
                }
                if (scenarioBox.inputActiveFocus) {
                    keyboardListener.forceActiveFocus();
                    event.accepted = true;
                    return;
                }
            }
            if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
                if (!root.inDrillDown && root.filteredTiles.length > 0) {
                    var sel = root.filteredTiles[root.activeTileIndex];
                    if (sel && sel.symbol) {
                        root.drillDownSymbol = sel.symbol;
                        root.inDrillDown = true;
                        event.accepted = true;
                        return;
                    }
                }
            }
            if (!root.inDrillDown && root.filteredTiles.length > 0) {
                var total = root.filteredTiles.length;
                var cols = gridViewport.cols;
                if (event.key === Qt.Key_Right) {
                    root.activeTileIndex = (root.activeTileIndex + 1) % total;
                    event.accepted = true;
                } else if (event.key === Qt.Key_Left) {
                    root.activeTileIndex = (root.activeTileIndex - 1 + total) % total;
                    event.accepted = true;
                } else if (event.key === Qt.Key_Down) {
                    if (root.activeTileIndex + cols < total)
                        root.activeTileIndex += cols;
                    event.accepted = true;
                } else if (event.key === Qt.Key_Up) {
                    if (root.activeTileIndex - cols >= 0)
                        root.activeTileIndex -= cols;
                    event.accepted = true;
                }
            }
        }
    }

    // MAIN EDGE-TO-EDGE CANVAS
    Column {
        anchors.fill: parent
        spacing: 0

        // MASTER HEADER (Edge-to-edge, Grouped Spacing)
        Rectangle {
            id: masterHeader
            width: parent.width
            height: Model.isBasketSector(root.sectorSymbol) ? Style.space(96) : Style.space(68)
            color: Color.background
            z: Model.Z_LAYER.HEADER

            Column {
                anchors.fill: parent
                anchors.leftMargin: Style.space(12)
                anchors.rightMargin: Style.space(12)
                anchors.topMargin: Style.space(6)
                anchors.bottomMargin: Style.space(6)
                spacing: Style.space(4)

                // ROW 1: Sector & BF Toggle
                Item {
                    width: parent.width
                    height: Style.space(28)

                    // Sector Ticker & Name
                    Row {
                        anchors.left: parent.left
                        anchors.verticalCenter: parent.verticalCenter
                        spacing: Style.space(8)

                        Text {
                            textFormat: Text.PlainText
                            text: "SECTOR:"
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.bodySmall
                            font.bold: true
                            anchors.verticalCenter: parent.verticalCenter
                        }

                        // Sector Ticker Switcher
                        FinanceInputBox {
                            id: sectorBox
                            value: root.sectorSymbol
                            width: Math.max(Style.space(60), Math.min(Style.space(260), inputContentWidth + Style.space(16)))
                            anchors.verticalCenter: parent.verticalCenter
                            foregroundColor: root.foreground
                            dimColor: root.dim
                            fontFamily: root.fontFamily
                            fontPixelSize: Style.font.bodySmall
                            fontBold: true
                            uppercase: true
                            allowRightClick: true
                            inputMethodHints: Qt.ImhUppercaseOnly | Qt.ImhNoPredictiveText
                            horizontalAlignment: (inputContentWidth > (width - Style.space(12))) ? TextInput.AlignLeft : TextInput.AlignHCenter
                            onCommitted: function (text) {
                                var val = text.toUpperCase();
                                if (val.length > 0)
                                    root.setSector(val);
                            }
                            onRightClicked: root.toggleSector()
                            onUnfocusRequested: keyboardListener.forceActiveFocus()
                        }

                        // Sector Full Name
                        Text {
                            textFormat: Text.PlainText
                            text: root.sectorFullName
                            visible: root.sectorFullName.length > 0
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            elide: Text.ElideRight
                            width: Math.min(implicitWidth, Style.space(260))
                            anchors.verticalCenter: parent.verticalCenter
                        }
                    }

                    // Global Broadening Formations Toggle (far right on row 1)
                    FinanceSurface {
                        id: bfBtn
                        elevation: 0
                        radiusToken: "sm"
                        sheen: false
                        active: root.showBroadening
                        foregroundColor: root.foreground
                        surfaceColor: root.showBroadening ? Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.18) : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.08)
                        anchors.right: parent.right
                        anchors.verticalCenter: parent.verticalCenter
                        height: Style.space(24)
                        implicitWidth: bfText.implicitWidth + Style.space(14)

                        Text {
                            id: bfText
                            anchors.centerIn: parent
                            textFormat: Text.PlainText
                            text: "BF: " + (root.showBroadening ? "ON" : "OFF")
                            color: root.showBroadening ? Color.accent : root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                        }

                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: root.showBroadening = !root.showBroadening
                        }
                    }
                }

                // ROW 2: Timeframe, Sort, Scenario, Lock, and Bars (far right)
                Item {
                    width: parent.width
                    height: Style.space(28)

                    Row {
                        anchors.left: parent.left
                        anchors.verticalCenter: parent.verticalCenter
                        spacing: Style.space(12)

                        // Timeframe Buttons (without "TIMEFRAME:" text)
                        Row {
                            spacing: Style.space(4)
                            anchors.verticalCenter: parent.verticalCenter

                            Repeater {
                                model: ["30", "60", "1D", "1W", "1M"]

                                Rectangle {
                                    required property string modelData
                                    width: Math.max(Style.space(32), tfBtnText.implicitWidth + Style.space(10))
                                    height: Math.max(Style.space(22), tfBtnText.implicitHeight + Style.space(6))
                                    radius: Style.space(3)
                                    color: modelData === root.timeframe ? Color.accent : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.08)
                                    Accessible.role: Accessible.Button
                                    Accessible.name: qsTr("Timeframe %1").arg(modelData)

                                    Text {
                                        id: tfBtnText
                                        anchors.centerIn: parent
                                        textFormat: Text.PlainText
                                        text: modelData
                                        color: modelData === root.timeframe ? Model.contrastForeground(Color.accent) : root.foreground
                                        font.family: root.fontFamily
                                        font.pixelSize: Style.font.caption
                                        font.bold: modelData === root.timeframe
                                    }

                                    MouseArea {
                                        anchors.fill: parent
                                        cursorShape: Qt.PointingHandCursor
                                        onClicked: root.setTimeframe(modelData)
                                    }
                                }
                            }
                        }

                        // Sort Selector Button
                        FinanceSurface {
                            elevation: 0
                            radiusToken: "sm"
                            sheen: false
                            foregroundColor: root.foreground
                            surfaceColor: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.08)
                            height: Style.space(24)
                            implicitWidth: sortText.implicitWidth + Style.space(16)
                            anchors.verticalCenter: parent.verticalCenter

                            Text {
                                id: sortText
                                anchors.centerIn: parent
                                textFormat: Text.PlainText
                                text: "SORT: " + root.sortField.toUpperCase() + (root.sortAscending ? " ↑" : " ↓")
                                color: root.foreground
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.caption
                                font.bold: true
                            }

                            MouseArea {
                                anchors.fill: parent
                                cursorShape: Qt.PointingHandCursor
                                acceptedButtons: Qt.LeftButton | Qt.RightButton
                                onClicked: function (mouse) {
                                    if (mouse.button === Qt.RightButton) {
                                        root.cycleSortField();
                                    } else {
                                        root.toggleSortDirection();
                                    }
                                }
                            }
                        }

                        // Scenario Filter
                        Row {
                            spacing: Style.space(8)
                            anchors.verticalCenter: parent.verticalCenter

                            Text {
                                textFormat: Text.PlainText
                                text: "SCENARIO:"
                                color: root.dim
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.bodySmall
                                font.bold: true
                                anchors.verticalCenter: parent.verticalCenter
                            }

                            // Scenario Filter Input Box (commit on Enter/blur, no mid-typing debounce)
                            FinanceInputBox {
                                id: scenarioBox
                                width: Style.space(200)
                                anchors.verticalCenter: parent.verticalCenter
                                value: root.scenarioFilter
                                placeholderText: "1, 2uh, 3s, !r..."
                                clearable: true
                                allowRightClick: true
                                unfocusOnNavKeys: true
                                foregroundColor: root.foreground
                                dimColor: root.dim
                                fontFamily: root.fontFamily
                                fontPixelSize: Style.font.caption
                                onCommitted: function (text) {
                                    root.scenarioFilter = text;
                                }
                                onCleared: root.scenarioFilter = ""
                                onRightClicked: root.clearScenarioFilter()
                                onUnfocusRequested: keyboardListener.forceActiveFocus()
                            }
                        }

                        // Lock Control (Option B: Recursive Multi-Tier Funneling)
                        FinanceSurface {
                            id: lockBtn
                            elevation: 0
                            radiusToken: "sm"
                            sheen: false
                            active: root.lockStack.length > 0
                            foregroundColor: root.foreground
                            surfaceColor: root.lockStack.length > 0 ? Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.16) : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.08)
                            height: Style.space(24)
                            implicitWidth: lockRow.implicitWidth + Style.space(16)
                            opacity: (root.lockStack.length === 0 && root.matchingHoldingsCount === 0) ? 0.4 : 1.0
                            anchors.verticalCenter: parent.verticalCenter

                            Row {
                                id: lockRow
                                anchors.centerIn: parent
                                spacing: Style.space(4)

                                // Lock Icon
                                Text {
                                    textFormat: Text.PlainText
                                    text: "\uf023"
                                    color: root.lockStack.length > 0 ? Color.accent : (root.matchingHoldingsCount === 0 ? root.dim : root.foreground)
                                    font.family: root.fontFamily
                                    font.pixelSize: Style.font.caption
                                    font.bold: true
                                    anchors.verticalCenter: parent.verticalCenter
                                }

                                // Unlocked State: "LOCK" label
                                Text {
                                    visible: root.lockStack.length === 0
                                    textFormat: Text.PlainText
                                    text: "LOCK"
                                    color: root.matchingHoldingsCount === 0 ? root.dim : root.foreground
                                    font.family: root.fontFamily
                                    font.pixelSize: Style.font.caption
                                    font.bold: true
                                    anchors.verticalCenter: parent.verticalCenter
                                }

                                // Locked State: Breadcrumb Tiers
                                Repeater {
                                    model: root.lockStack.length

                                    Row {
                                        id: tierItem
                                        required property int index
                                        spacing: Style.space(4)
                                        anchors.verticalCenter: parent.verticalCenter

                                        Text {
                                            visible: tierItem.index > 0
                                            textFormat: Text.PlainText
                                            text: "▸"
                                            color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.4)
                                            font.family: root.fontFamily
                                            font.pixelSize: Style.font.caption
                                            anchors.verticalCenter: parent.verticalCenter
                                        }

                                        Text {
                                            id: tierText
                                            textFormat: Text.PlainText
                                            text: "" + root.getTierHoldingsCount(tierItem.index)
                                            color: tierItem.index === (root.lockStack.length - 1) ? Color.accent : (tierHover.hovered ? root.foreground : root.dim)
                                            font.family: root.fontFamily
                                            font.pixelSize: Style.font.caption
                                            font.bold: true
                                            anchors.verticalCenter: parent.verticalCenter

                                            MouseArea {
                                                id: tierHover
                                                anchors.fill: parent
                                                anchors.margins: -Style.space(2)
                                                hoverEnabled: true
                                                enabled: tierItem.index < (root.lockStack.length - 1)
                                                cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
                                                onClicked: root.popLockTier(tierItem.index + 1)
                                            }
                                        }
                                    }
                                }

                                // Stack Next Tier Trigger (+N)
                                Item {
                                    visible: root.lockStack.length > 0 && root.canLockNextTier
                                    width: addNextTierText.implicitWidth + Style.space(4)
                                    height: addNextTierText.implicitHeight
                                    anchors.verticalCenter: parent.verticalCenter

                                    Text {
                                        id: addNextTierText
                                        anchors.centerIn: parent
                                        textFormat: Text.PlainText
                                        text: "(+" + root.matchingHoldingsCount + ")"
                                        color: nextTierHover.hovered ? root.foreground : Color.accent
                                        font.family: root.fontFamily
                                        font.pixelSize: Style.font.caption
                                        font.bold: true
                                    }

                                    MouseArea {
                                        id: nextTierHover
                                        anchors.fill: parent
                                        anchors.margins: -Style.space(2)
                                        hoverEnabled: true
                                        cursorShape: Qt.PointingHandCursor
                                        onClicked: root.pushLockTier()
                                    }
                                }

                                // Clear Lock Stack [✕]
                                Item {
                                    visible: root.lockStack.length > 0
                                    width: clearText.implicitWidth + Style.space(4)
                                    height: clearText.implicitHeight
                                    anchors.verticalCenter: parent.verticalCenter

                                    Text {
                                        id: clearText
                                        anchors.centerIn: parent
                                        textFormat: Text.PlainText
                                        text: "✕"
                                        color: clearHover.hovered ? root.foreground : root.dim
                                        font.family: root.fontFamily
                                        font.pixelSize: Style.font.caption
                                        font.bold: true
                                    }

                                    MouseArea {
                                        id: clearHover
                                        anchors.fill: parent
                                        anchors.margins: -Style.space(3)
                                        hoverEnabled: true
                                        cursorShape: Qt.PointingHandCursor
                                        onClicked: root.clearLockStack()
                                    }
                                }
                            }

                            // Click handler for unlocked state
                            MouseArea {
                                anchors.fill: parent
                                enabled: root.lockStack.length === 0 && root.matchingHoldingsCount > 0
                                cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
                                onClicked: root.pushLockTier()
                            }
                        }

                        // Copy Filtered Tickers Button
                        FinanceChipButton {
                            id: copyBtn
                            bordered: true
                            enabled: root.filteredTiles.length > 0
                            checked: copyFeedbackTimer.running
                            iconText: copyFeedbackTimer.running ? "✓" : "\uf0c5"
                            text: copyFeedbackTimer.running ? "COPIED" : "COPY"
                            foreground: copyFeedbackTimer.running ? Color.accent : root.foreground
                            dimColor: root.dim
                            accentColor: Color.accent
                            fontFamily: root.fontFamily
                            fontSize: Style.font.caption
                            horizontalPadding: Style.space(8)
                            verticalPadding: Style.space(3)
                            cornerRadius: Style.space(4)
                            tooltipText: "Copy filtered tickers to clipboard"
                            anchors.verticalCenter: parent.verticalCenter
                            onClicked: root.copyFilteredTickers()
                        }
                    }

                    // Bar Count Selector (far right on row 2)
                    Row {
                        anchors.right: parent.right
                        anchors.verticalCenter: parent.verticalCenter
                        spacing: Style.space(6)

                        Text {
                            textFormat: Text.PlainText
                            text: "BARS:"
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.bodySmall
                            font.bold: true
                            anchors.verticalCenter: parent.verticalCenter
                        }

                        FinanceInputBox {
                            id: barsBox
                            readonly property int parsedBars: parseInt(inputText, 10)
                            readonly property bool barsOutOfRange: inputActiveFocus && inputText.length > 0 && (isNaN(parsedBars) || parsedBars < Model.MIN_BAR_COUNT || parsedBars > Model.MAX_BAR_COUNT)

                            width: Style.space(48)
                            anchors.verticalCenter: parent.verticalCenter
                            value: root.globalBarCount < 0 ? "ALL" : ("" + root.globalBarCount)
                            commitOnBlur: false
                            liveDebounceMs: 120
                            foregroundColor: root.foreground
                            dimColor: root.dim
                            borderColorOverride: barsOutOfRange ? Color.urgent : "transparent"
                            fontFamily: root.fontFamily
                            fontPixelSize: Style.font.caption
                            horizontalAlignment: TextInput.AlignHCenter
                            leftPadding: Style.space(4)
                            rightPadding: Style.space(4)
                            inputMethodHints: Qt.ImhDigitsOnly
                            validator: RegularExpressionValidator {
                                regularExpression: /[0-9]*/
                            }
                            QQC.ToolTip.visible: barsBox.barsOutOfRange
                            QQC.ToolTip.text: "Bars clamped to " + Model.MIN_BAR_COUNT + "–" + Model.MAX_BAR_COUNT
                            onLiveDebounced: function (text) {
                                if (text.length > 0)
                                    root.setGlobalBarCount(text);
                            }
                            onCommitted: function (text) {
                                root.setGlobalBarCount(text);
                            }
                            onUnfocusRequested: keyboardListener.forceActiveFocus()
                        }
                    }
                }

                // ROW 3: Breadth HUD & Showing Counter
                Item {
                    width: parent.width
                    height: Style.space(20)
                    visible: Model.isBasketSector(root.sectorSymbol)

                    Row {
                        anchors.left: parent.left
                        anchors.verticalCenter: parent.verticalCenter
                        spacing: Style.space(8)

                        Text {
                            textFormat: Text.PlainText
                            text: "BREADTH:"
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                            anchors.verticalCenter: parent.verticalCenter
                        }

                        Repeater {
                            model: [
                                { label: "2u", pct: root.breadthMetrics.pct2u, count: root.breadthMetrics.count2u, valColor: root.breadthMetrics.isSimultaneous2u ? root.upColor : root.foreground },
                                { label: "2d", pct: root.breadthMetrics.pct2d, count: root.breadthMetrics.count2d, valColor: root.breadthMetrics.isSimultaneous2d ? root.downColor : root.foreground },
                                { label: "1", pct: root.breadthMetrics.pct1 || 0, count: root.breadthMetrics.count1 || 0, valColor: root.foreground },
                                { label: "3", pct: root.breadthMetrics.pct3 || 0, count: root.breadthMetrics.count3 || 0, valColor: root.foreground },
                                { label: "2u Red", pct: root.breadthMetrics.pctF2u || 0, count: root.breadthMetrics.countF2u || 0, valColor: (root.breadthMetrics.pctF2u || 0) >= 20 ? root.downColor : root.foreground },
                                { label: "2d Green", pct: root.breadthMetrics.pctF2d || 0, count: root.breadthMetrics.countF2d || 0, valColor: (root.breadthMetrics.pctF2d || 0) >= 20 ? root.upColor : root.foreground }
                            ]

                            Row {
                                required property var modelData
                                required property int index
                                spacing: Style.space(8)
                                anchors.verticalCenter: parent.verticalCenter

                                Text {
                                    visible: parent.index > 0
                                    textFormat: Text.PlainText
                                    text: "|"
                                    color: Qt.rgba(root.dim.r, root.dim.g, root.dim.b, 0.3)
                                    anchors.verticalCenter: parent.verticalCenter
                                }

                                Row {
                                    spacing: Style.space(3)
                                    anchors.verticalCenter: parent.verticalCenter

                                    Text {
                                        textFormat: Text.PlainText
                                        text: modelData.label + ": " + Math.round(modelData.pct) + "%"
                                        color: modelData.valColor
                                        font.family: root.fontFamily
                                        font.pixelSize: Style.font.caption
                                        font.bold: true
                                    }

                                    Text {
                                        textFormat: Text.PlainText
                                        text: modelData.count + "/" + root.breadthMetrics.totalHoldings
                                        color: root.dim
                                        font.family: root.fontFamily
                                        font.pixelSize: Style.font.caption
                                    }
                                }
                            }
                        }
                    }

                    // Showing Count (far right on row 3)
                    Item {
                        id: showingTextItem
                        anchors.right: parent.right
                        anchors.verticalCenter: parent.verticalCenter
                        implicitWidth: showingText.implicitWidth
                        implicitHeight: showingText.implicitHeight

                        Text {
                            id: showingText
                            anchors.centerIn: parent
                            textFormat: Text.PlainText
                            text: root.lockStack.length > 0 ? ("Showing: " + root.matchingHoldingsCount + "/" + root.activeLockedHoldingsCount + " (Locked)") : ("Showing: " + root.matchingHoldingsCount + "/" + root.totalHoldingsCount)
                            color: root.lockStack.length > 0 ? Color.accent : root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                        }
                    }
                }
            }
        }

        // 1px Hairline Divider + Parallel Fetch Progress Bar
        Item {
            id: headerDivider
            width: parent.width
            height: 2

            Rectangle {
                anchors.top: parent.top
                width: parent.width
                height: 1
                color: Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.12)
            }

            FinanceLoader {
                readonly property bool workersBusy: worker0.running || worker1.running || worker2.running || worker3.running || root.pendingFetches.length > 0
                readonly property int totalTarget: Math.max(1, (root.holdings || []).length)
                anchors.fill: parent
                active: workersBusy
                progress: workersBusy ? Math.max(0.08, Math.min(1.0, 1.0 - (root.pendingFetches.length / totalTarget))) : 0
                color: Color.accent
            }
        }

        // VIEWPORT CONTAINER (Swaps between 1x1 Dynamic Flex Grid and Drill-Down)
        Item {
            id: mainContainer
            width: parent.width
            height: parent.height - masterHeader.height - headerDivider.height

            // 1. DYNAMIC FLEX 1X1 GRID VIEWPORT (Visible when !inDrillDown)
            Item {
                id: gridViewport
                visible: !root.inDrillDown
                anchors.fill: parent

                readonly property int visibleCount: root.filteredTiles.length
                readonly property int cols: Math.max(1, Math.min(6, Math.ceil(Math.sqrt(Math.max(1, visibleCount)))))
                readonly property int rows: Math.max(1, Math.ceil(visibleCount / cols))
                readonly property real cellWidth: width / cols
                readonly property real cellHeight: height / rows

                Grid {
                    anchors.fill: parent
                    columns: gridViewport.cols
                    spacing: 0

                    Repeater {
                        model: tileListModel

                        Item {
                            id: tileWrapper
                            required property string symbol
                            required property string name
                            required property int index
                            property int dataRev: 0

                            Connections {
                                target: root
                                function onSymbolDataUpdated(sym) {
                                    if (!sym || sym === tileWrapper.symbol)
                                        tileWrapper.dataRev++;
                                }
                            }

                            width: gridViewport.cellWidth
                            height: gridViewport.cellHeight

                            // Hairline Border
                            Rectangle {
                                anchors.fill: parent
                                color: "transparent"
                                border.width: 1
                                border.color: root.activeTileIndex === tileWrapper.index ? Color.accent : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.12)
                                z: Model.Z_LAYER.TILE_BORDER
                            }

                            // 100% Native Omafinance GridCell
                            GridCell {
                                id: cellInstance
                                anchors.fill: parent
                                cellIndex: tileWrapper.index
                                symbol: tileWrapper.symbol
                                companyName: tileWrapper.name || ""
                                timeframe: root.timeframe
                                showBroadening: root.showBroadening
                                hideStratBadge: true
                                disableTickerSearch: true
                                activeFocusCell: root.activeTileIndex === tileWrapper.index
                                zoomCount: root.globalBarCount

                                quote: (tileWrapper.dataRev >= 0) ? (root.quotes[tileWrapper.symbol] || null) : null
                                candles: (tileWrapper.dataRev >= 0) ? root.getCandles(tileWrapper.symbol, root.timeframe) : []
                                hourlyCandles: (tileWrapper.dataRev >= 0) ? root.getCandles(tileWrapper.symbol, "60") : []
                                dailyCandles: (tileWrapper.dataRev >= 0) ? root.getCandles(tileWrapper.symbol, "1D") : []
                                priceLevels: root.symbolLevels[tileWrapper.symbol] || []

                                onFocusRequested: function (idx) {
                                    root.activeTileIndex = idx;
                                    keyboardListener.forceActiveFocus();
                                }
                                onMaximizeRequested: function (idx) {
                                    root.drillDownSymbol = tileWrapper.symbol;
                                    root.inDrillDown = true;
                                }
                                onCrosshairMoved: function (ts, pr, c) {
                                    if (root.syncCrosshair) {
                                        root.broadcastCrosshair(tileWrapper.symbol, ts, pr, c);
                                    }
                                }
                                onCrosshairCleared: {
                                    if (root.syncCrosshair) {
                                        root.clearCrosshair();
                                    }
                                }
                                onZoomChangedManually: function (idx, nextZoom) {
                                    root.setGlobalBarCountDebounced(nextZoom);
                                }
                            }
                        }
                    }
                }

                FinanceStatusBanner {
                    visible: gridViewport.visibleCount === 0
                    anchors.centerIn: parent
                    width: Math.min(Style.space(420), parent.width - Style.space(32))
                    compact: false
                    tone: "info"
                    title: ((root.holdings || []).length === 0 && !root.isMultiTicker) ? qsTr("Loading sector holdings…") : qsTr("No matching tickers")
                    text: ((root.holdings || []).length === 0 && !root.isMultiTicker)
                        ? qsTr("Fetching constituent holdings and chart data for %1.").arg(root.sectorSymbol)
                        : qsTr("No holdings in %1 match the current scenario filter or lock.").arg(root.sectorSymbol)
                    actionText: root.scenarioFilter !== "" ? qsTr("Clear filter") : (root.lockStack.length > 0 ? qsTr("Unlock all") : "")
                    secondaryActionText: (root.scenarioFilter !== "" && root.lockStack.length > 0) ? qsTr("Unlock all") : ""
                    fontFamily: root.fontFamily
                    foreground: root.foreground
                    dimColor: root.dim
                    onActionTriggered: {
                        if (root.scenarioFilter !== "") {
                            root.clearScenarioFilter();
                        } else if (root.lockStack.length > 0) {
                            root.clearLockStack();
                        }
                    }
                    onSecondaryActionTriggered: root.clearLockStack()
                }
            }

            // 2. DRILL-DOWN 2+3 VIEWPORT (Expanded for focus ticker, all other tickers hidden)
            Item {
                id: drillDownViewport
                visible: root.inDrillDown
                anchors.fill: parent

                Column {
                    anchors.fill: parent
                    spacing: 0

                    // Drill-Down Subheader Bar
                    Rectangle {
                        width: parent.width
                        height: Style.space(32)
                        color: Qt.rgba(Color.background.r, Color.background.g, Color.background.b, 0.95)

                        Row {
                            anchors.left: parent.left
                            anchors.leftMargin: Style.space(12)
                            anchors.verticalCenter: parent.verticalCenter
                            spacing: Style.space(12)

                            FinanceChipButton {
                                bordered: true
                                text: "← BACK TO SECTOR GRID (Esc)"
                                checked: true
                                foreground: root.foreground
                                dimColor: root.dim
                                fontFamily: root.fontFamily
                                fontSize: Style.font.caption
                                horizontalPadding: Style.space(8)
                                verticalPadding: Style.space(3)
                                cornerRadius: Style.space(3)
                                onClicked: root.inDrillDown = false
                            }

                            Text {
                                textFormat: Text.PlainText
                                text: root.drillDownSymbol + " · FULL 2+3 MULTI-TIMEFRAME ANALYSIS"
                                color: root.foreground
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.bodySmall
                                font.bold: true
                                anchors.verticalCenter: parent.verticalCenter
                            }
                        }
                    }

                    // Full 2+3 Multi-Timeframe Chart Grid
                    Item {
                        width: parent.width
                        height: parent.height - Style.space(32)

                        readonly property real topRowH: height * 0.48
                        readonly property real botRowH: height - topRowH

                        // TOP ROW (30m, 60m)
                        Item {
                            width: parent.width
                            height: parent.topRowH
                            anchors.top: parent.top

                            GridCell {
                                width: parent.width * 0.5
                                height: parent.height
                                x: 0
                                symbol: root.drillDownSymbol
                                timeframe: "30"
                                showBroadening: root.showBroadening
                                disableTickerSearch: true
                                zoomCount: root.globalBarCount
                                quote: (root.drillDownDataRev >= 0) ? (root.quotes[root.drillDownSymbol] || null) : null
                                candles: (root.drillDownDataRev >= 0) ? root.getCandles(root.drillDownSymbol, "30") : []
                                hourlyCandles: (root.drillDownDataRev >= 0) ? root.getCandles(root.drillDownSymbol, "60") : []
                                dailyCandles: (root.drillDownDataRev >= 0) ? root.getCandles(root.drillDownSymbol, "1D") : []
                                onZoomChangedManually: function (idx, nextZoom) {
                                    root.setGlobalBarCountDebounced(nextZoom);
                                }
                            }

                            GridCell {
                                width: parent.width * 0.5
                                height: parent.height
                                x: parent.width * 0.5
                                symbol: root.drillDownSymbol
                                timeframe: "60"
                                showBroadening: root.showBroadening
                                disableTickerSearch: true
                                zoomCount: root.globalBarCount
                                quote: (root.drillDownDataRev >= 0) ? (root.quotes[root.drillDownSymbol] || null) : null
                                candles: (root.drillDownDataRev >= 0) ? root.getCandles(root.drillDownSymbol, "60") : []
                                hourlyCandles: (root.drillDownDataRev >= 0) ? root.getCandles(root.drillDownSymbol, "60") : []
                                dailyCandles: (root.drillDownDataRev >= 0) ? root.getCandles(root.drillDownSymbol, "1D") : []
                                onZoomChangedManually: function (idx, nextZoom) {
                                    root.setGlobalBarCountDebounced(nextZoom);
                                }
                            }
                        }

                        // BOTTOM ROW (1D, 1W, 1M)
                        Item {
                            width: parent.width
                            height: parent.botRowH
                            anchors.bottom: parent.bottom

                            GridCell {
                                width: parent.width * 0.333
                                height: parent.height
                                x: 0
                                symbol: root.drillDownSymbol
                                timeframe: "1D"
                                showBroadening: root.showBroadening
                                disableTickerSearch: true
                                zoomCount: root.globalBarCount
                                quote: (root.drillDownDataRev >= 0) ? (root.quotes[root.drillDownSymbol] || null) : null
                                candles: (root.drillDownDataRev >= 0) ? root.getCandles(root.drillDownSymbol, "1D") : []
                                hourlyCandles: (root.drillDownDataRev >= 0) ? root.getCandles(root.drillDownSymbol, "60") : []
                                dailyCandles: (root.drillDownDataRev >= 0) ? root.getCandles(root.drillDownSymbol, "1D") : []
                                onZoomChangedManually: function (idx, nextZoom) {
                                    root.setGlobalBarCountDebounced(nextZoom);
                                }
                            }

                            GridCell {
                                width: parent.width * 0.333
                                height: parent.height
                                x: parent.width * 0.333
                                symbol: root.drillDownSymbol
                                timeframe: "1W"
                                showBroadening: root.showBroadening
                                disableTickerSearch: true
                                zoomCount: root.globalBarCount
                                quote: (root.drillDownDataRev >= 0) ? (root.quotes[root.drillDownSymbol] || null) : null
                                candles: (root.drillDownDataRev >= 0) ? root.getCandles(root.drillDownSymbol, "1W") : []
                                hourlyCandles: (root.drillDownDataRev >= 0) ? root.getCandles(root.drillDownSymbol, "60") : []
                                dailyCandles: (root.drillDownDataRev >= 0) ? root.getCandles(root.drillDownSymbol, "1D") : []
                                onZoomChangedManually: function (idx, nextZoom) {
                                    root.setGlobalBarCountDebounced(nextZoom);
                                }
                            }

                            GridCell {
                                width: parent.width * 0.334
                                height: parent.height
                                x: parent.width * 0.666
                                symbol: root.drillDownSymbol
                                timeframe: "1M"
                                showBroadening: root.showBroadening
                                disableTickerSearch: true
                                zoomCount: root.globalBarCount
                                quote: (root.drillDownDataRev >= 0) ? (root.quotes[root.drillDownSymbol] || null) : null
                                candles: (root.drillDownDataRev >= 0) ? root.getCandles(root.drillDownSymbol, "1M") : []
                                hourlyCandles: (root.drillDownDataRev >= 0) ? root.getCandles(root.drillDownSymbol, "60") : []
                                dailyCandles: (root.drillDownDataRev >= 0) ? root.getCandles(root.drillDownSymbol, "1D") : []
                                onZoomChangedManually: function (idx, nextZoom) {
                                    root.setGlobalBarCountDebounced(nextZoom);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Timer {
        id: chartZoomDebounceTimer
        interval: 80
        repeat: false
        onTriggered: {
            if (root.pendingGlobalBarCount !== -2) {
                root.setGlobalBarCount(root.pendingGlobalBarCount);
                root.pendingGlobalBarCount = -2;
            }
        }
    }

    Timer {
        id: copyFeedbackTimer
        interval: 1500
        repeat: false
    }
}
