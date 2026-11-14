import QtQuick
import QtQuick.Controls as QQC
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

FloatingWindow {
    id: root

    property string mainSymbol: "AAPL"
    property var watchlist: []
    property var pinned: []
    property string detailRange: "1D"

    property string gridMode: "2x2" // "2x2", "2+3", "1x1"
    property string previousGridMode: "2x2"
    property bool gridExpanded: false
    property bool syncSymbol: true
    property bool syncTimeframe: false
    property bool syncCrosshair: true
    property bool syncTime: true
    property bool showBroadening: false
    property string discordWebhook: ""

    property int activeCellIndex: 0
    property bool focusMovedByKeyboard: false
    property var cellSymbols: ["AAPL", "AAPL", "AAPL", "AAPL", "AAPL"]
    property var cellTimeframes: ["60", "1D", "1W", "1M", "1Y"]
    property var cellZooms: [-1, -1, -1, -1, -1]

    // Split Ratios
    property real rowSplitRatio: 0.5
    property real topColSplitRatio: 0.5
    property real botColSplitRatio: 0.5
    property real botCol1Ratio: 0.333
    property real botCol2Ratio: 0.333

    // Quotes and Candles Cache
    property var quotes: ({})
    property var chartCache: ({})
    property var symbolLevels: ({})
    property var symbolPriceMemory: ({})
    property real replayCutoffTs: 0
    property string replayStepInterval: "Auto"
    property bool replayIntervalExpanded: false
    property var pendingFetches: []
    property bool fetching: false
    property int quoteFailureCount: 0
    property int chartFailureCount: 0
    readonly property int liveRefreshMs: Model.backoffDelay(2000, quoteFailureCount, 60000)
    readonly property int chartRefreshMs: Model.backoffDelay(15000, chartFailureCount, 120000)
    property bool quoteRefreshPending: false
    signal stateSaveRequested(string mode, var sync, var symbols, var splits)
    signal symbolLevelsChangedExternally(string sym, var nextLevels)
    signal signalStatesUpdated(var nextStates)
    signal quotesReceived(var incomingQuotes)
    signal chartDataReceived(string key, var candles, var quoteEnriched)
    // Delivery (notification, sound, Discord, log) is owned by Panel.dispatchAlert so mute applies everywhere.
    signal alertDispatchRequested(var alert)
    signal alertsMuteToggleRequested
    property bool alertsMuted: false
    property string alertsMuteStatus: ""

    function setReplayCutoff(ts) {
        root.replayCutoffTs = (isFinite(ts) && ts > 0) ? ts : 0;
        if (root.replayCutoffTs > 0) {
            var stepTf = Model.mapReplayStepInterval(root.replayStepInterval);
            var sym = symbolForCell(root.activeCellIndex);
            if (stepTf && sym) {
                requestChartFetch(sym, stepTf, false);
            }
        }
    }

    function setReplayStepInterval(interval) {
        root.replayStepInterval = interval || "Auto";
        var tfKey = Model.mapReplayStepInterval(root.replayStepInterval);
        var sym = symbolForCell(root.activeCellIndex);
        if (tfKey && sym) {
            requestChartFetch(sym, tfKey, false);
        }
    }

    function stepReplay(dir) {
        var sym = symbolForCell(root.activeCellIndex);
        var stepTf = Model.mapReplayStepInterval(root.replayStepInterval);
        if (!stepTf) {
            stepTf = timeframeForCell(root.activeCellIndex);
        }
        var raw = root.chartCache[cacheKey(sym, stepTf)] || [];
        if (raw.length < 2) {
            requestChartFetch(sym, stepTf, false);
            var activeTf = timeframeForCell(root.activeCellIndex);
            raw = root.chartCache[cacheKey(sym, activeTf)] || root.chartCache[cacheKey(sym, "30")] || root.chartCache[cacheKey(sym, "60")] || [];
        }
        root.replayCutoffTs = Model.stepReplayCutoff(raw, root.replayCutoffTs, dir);
    }

    function updateSymbolLevels(sym, nextLevels) {
        if (!sym)
            return;
        var nextMap = Object.assign({}, root.symbolLevels);
        nextMap[sym] = nextLevels || [];
        root.symbolLevels = nextMap;
        root.symbolLevelsChangedExternally(sym, nextLevels || []);
    }

    title: root.mainSymbol ? "Omafinance Grid - " + root.mainSymbol : "Omafinance Grid"
    color: Color.background
    implicitWidth: Style.space(1200)
    implicitHeight: Style.space(750)
    minimumSize: Qt.size(Style.space(700), Style.space(500))

    readonly property color foreground: Color.foreground
    readonly property color dim: Model.accessibleDimColor(foreground, Color.background)
    readonly property color upColor: Model.accessibleSemanticColor("up", Color.background)
    readonly property color downColor: Model.accessibleSemanticColor("down", Color.background)
    readonly property string fontFamily: Style.font.family

    function activeCellCount() {
        if (root.gridMode === "1x1")
            return 1;
        if (root.gridMode === "2+3")
            return 5;
        return 4;
    }

    function activeSymbols() {
        var count = activeCellCount();
        var symbols = [];
        for (var i = 0; i < count; i++) {
            var idx = (root.gridMode === "1x1") ? root.activeCellIndex : i;
            var sym = symbolForCell(idx);
            if (sym && symbols.indexOf(sym) === -1)
                symbols.push(sym);
        }
        return symbols;
    }

    function refreshQuotes() {
        var syms = activeSymbols();
        if (syms.length === 0) {
            root.quoteRefreshPending = false;
            return;
        }
        if (quoteProc.running) {
            root.quoteRefreshPending = true;
            return;
        }
        root.quoteRefreshPending = false;
        quoteProc.command = ["curl", "-fsS", "--max-time", "8", "-A", "Mozilla/5.0", Model.sparkUrl(syms)];
        quoteProc.running = true;
    }

    function symbolForCell(index) {
        if (root.syncSymbol)
            return root.mainSymbol;
        return (root.cellSymbols && root.cellSymbols[index]) ? root.cellSymbols[index] : root.mainSymbol;
    }

    function timeframeForCell(index) {
        if (root.syncTimeframe && root.cellTimeframes && root.cellTimeframes.length > 0)
            return root.cellTimeframes[0] || "1D";
        if (root.cellTimeframes && root.cellTimeframes[index])
            return root.cellTimeframes[index];
        var defaults = Model.gridTimeframes(root.gridMode === "1x1" ? root.previousGridMode : root.gridMode);
        return defaults[index] || "1D";
    }

    function zoomForCell(index) {
        if (root.cellZooms && isFinite(root.cellZooms[index]) && root.cellZooms[index] >= 5)
            return Math.round(root.cellZooms[index]);
        return -1;
    }

    property int cellRev0: 0
    property int cellRev1: 0
    property int cellRev2: 0
    property int cellRev3: 0
    property int cellRev4: 0

    function cellRev(index) {
        if (index === 0) return root.cellRev0;
        if (index === 1) return root.cellRev1;
        if (index === 2) return root.cellRev2;
        if (index === 3) return root.cellRev3;
        if (index === 4) return root.cellRev4;
        return 0;
    }

    function bumpCellRev(index) {
        if (index === 0) root.cellRev0++;
        else if (index === 1) root.cellRev1++;
        else if (index === 2) root.cellRev2++;
        else if (index === 3) root.cellRev3++;
        else if (index === 4) root.cellRev4++;
    }

    function notifyCacheKeyUpdated(key) {
        if (!key) return;
        var sep = key.lastIndexOf("_");
        var sym = sep >= 0 ? key.slice(0, sep) : "";
        var count = root.gridMode === "2x2" ? 4 : 5;
        for (var i = 0; i < count; i++) {
            var cSym = root.symbolForCell(i);
            if (!sym || cSym === sym) {
                root.bumpCellRev(i);
            }
        }
    }

    function notifyQuotesUpdated(changedSymbols) {
        if (!Array.isArray(changedSymbols) || changedSymbols.length === 0) return;
        var count = root.gridMode === "2x2" ? 4 : 5;
        for (var i = 0; i < count; i++) {
            var cSym = root.symbolForCell(i);
            if (changedSymbols.indexOf(cSym) !== -1) {
                root.bumpCellRev(i);
            }
        }
    }

    Timer {
        id: saveStateDebounceTimer
        interval: 400
        repeat: false
        onTriggered: root.saveGridState()
    }

    function setZoomForCell(index, newZoom) {
        var updated = [];
        for (var i = 0; i < 5; i++) {
            var z = (root.cellZooms && isFinite(root.cellZooms[i]) && root.cellZooms[i] >= 5) ? Math.round(root.cellZooms[i]) : -1;
            updated.push(z);
        }
        updated[index] = (isFinite(newZoom) && newZoom >= 5) ? Math.round(newZoom) : -1;
        root.cellZooms = updated;
        saveStateDebounceTimer.restart();
    }

    function cacheKey(sym, tf) {
        return Model.cacheKey(sym, tf);
    }

    function getCandles(sym, tf) {
        var key = cacheKey(sym, tf);
        var raw = root.chartCache[key] || [];
        if (root.replayCutoffTs <= 0)
            return raw;
        var stepTf = Model.mapReplayStepInterval(root.replayStepInterval);
        var subBars = [];
        if (stepTf && (stepTf === "1" || stepTf === "5" || stepTf === "15")) {
            subBars = root.chartCache[cacheKey(sym, stepTf)] || [];
        }
        if (subBars.length === 0) {
            subBars = root.chartCache[cacheKey(sym, "5")] || root.chartCache[cacheKey(sym, "15")] || root.chartCache[cacheKey(sym, "1")] || [];
        }
        return Model.buildReplayCandles(tf, raw, root.chartCache[cacheKey(sym, "30")] || [], root.chartCache[cacheKey(sym, "60")] || [], root.chartCache[cacheKey(sym, "1D")] || [], root.replayCutoffTs, subBars);
    }

    function getQuote(sym) {
        var q = root.quotes[sym] || null;
        if (root.replayCutoffTs <= 0)
            return q;
        var stepTf = Model.mapReplayStepInterval(root.replayStepInterval);
        var subBars = [];
        if (stepTf && (stepTf === "1" || stepTf === "5" || stepTf === "15")) {
            subBars = root.chartCache[cacheKey(sym, stepTf)] || [];
        }
        if (subBars.length === 0) {
            subBars = root.chartCache[cacheKey(sym, "5")] || root.chartCache[cacheKey(sym, "15")] || root.chartCache[cacheKey(sym, "1")] || [];
        }
        return Model.buildReplayQuote(q, root.chartCache[cacheKey(sym, "30")] || [], root.chartCache[cacheKey(sym, "60")] || [], root.chartCache[cacheKey(sym, "1D")] || [], root.replayCutoffTs, subBars);
    }

    function requestChartFetch(sym, tf, force) {
        var key = cacheKey(sym, tf);
        if (!force && root.chartCache[key])
            return;
        for (var i = 0; i < root.pendingFetches.length; i++) {
            if (root.pendingFetches[i].symbol === sym && root.pendingFetches[i].rangeKey === tf)
                return;
        }
        root.pendingFetches.push({
            symbol: sym,
            rangeKey: tf
        });
        if (!chartFetchProc.running)
            processNextFetch();
    }

    property string currentFetchSymbol: ""
    property string currentFetchRange: ""
    property bool isRetryingYahoo: false

    function processNextFetch() {
        if (root.pendingFetches.length === 0)
            return;
        var next = root.pendingFetches.shift();
        currentFetchSymbol = next.symbol;
        currentFetchRange = next.rangeKey;
        isRetryingYahoo = false;
        chartFetchProc.command = Model.chartCommand(next.symbol, next.rangeKey);
        chartFetchProc.running = true;
    }

    Process {
        id: quoteProc
        onExited: function (exitCode) {
            var raw = String(quoteStdout.text || "").trim();
            var parsed = exitCode === 0 && raw ? Model.parseSpark(raw) : ({});
            if (Object.keys(parsed).length > 0) {
                root.quotes = Model.mergeQuotes(root.quotes, parsed);
                root.quoteFailureCount = 0;
                root.evaluateActivePriceLevelAlerts(parsed);
                root.quotesReceived(parsed);
            } else {
                root.quoteFailureCount = Math.min(10, root.quoteFailureCount + 1);
            }
            if (root.quoteRefreshPending)
                Qt.callLater(root.refreshQuotes);
        }
        stdout: StdioCollector {
            id: quoteStdout
            waitForEnd: true
        }
    }

    Process {
        id: chartFetchProc
        onExited: function (exitCode) {
            var raw = chartFetchStdout.text;
            var parsed = (exitCode === 0 && raw) ? Model.parseChart(raw, root.currentFetchRange, root.currentFetchSymbol) : null;
            if (!parsed && !root.isRetryingYahoo && Model.isCryptoSymbol(root.currentFetchSymbol)) {
                root.isRetryingYahoo = true;
                chartFetchProc.command = ["curl", "-fsS", "--max-time", "8", "-A", "Mozilla/5.0", Model.yahooChartUrl(root.currentFetchSymbol, root.currentFetchRange)];
                chartFetchProc.running = true;
                return;
            }
            root.isRetryingYahoo = false;
            if (parsed && parsed.candles) {
                var key = root.cacheKey(root.currentFetchSymbol, root.currentFetchRange);
                if (!root.chartCache)
                    root.chartCache = ({});
                root.chartCache[key] = parsed.candles;
                root.notifyCacheKeyUpdated(key);
                root.chartDataReceived(key, parsed.candles, parsed.symbol ? parsed : null);

                if (parsed.symbol) {
                    var existingQuote = root.quotes[root.currentFetchSymbol];
                    if (!existingQuote) {
                        root.quotes[root.currentFetchSymbol] = parsed;
                        root.notifyQuotesUpdated([root.currentFetchSymbol]);
                        var singleQuoteMap = ({});
                        singleQuoteMap[root.currentFetchSymbol] = parsed;
                        root.evaluateActivePriceLevelAlerts(singleQuoteMap);
                    } else if (parsed.ftfc || parsed.bar60) {
                        var enriched = Object.assign({}, existingQuote);
                        if (parsed.ftfc) enriched.ftfc = parsed.ftfc;
                        if (parsed.bar60) enriched.bar60 = parsed.bar60;
                        if (parsed.closes && (!enriched.closes || enriched.closes.length === 0)) enriched.closes = parsed.closes;
                        root.quotes[root.currentFetchSymbol] = enriched;
                        root.notifyQuotesUpdated([root.currentFetchSymbol]);
                    }
                }
                root.chartFailureCount = 0;
            } else {
                root.chartFailureCount = Math.min(10, root.chartFailureCount + 1);
            }
            if (root.pendingFetches.length > 0)
                Qt.callLater(root.processNextFetch);
        }
        stdout: StdioCollector {
            id: chartFetchStdout
            waitForEnd: true
        }
    }

    property var signalStates: ({})

    function evaluateActivePriceLevelAlerts(incomingQuotes) {
        if (root.replayCutoffTs > 0 || !incomingQuotes)
            return;
        var nextMem = Object.assign({}, root.symbolPriceMemory);
        var nextLevelsMap = Object.assign({}, root.symbolLevels);
        var memChanged = false;
        var keys = Object.keys(incomingQuotes);
        for (var i = 0; i < keys.length; i++) {
            var sym = keys[i];
            var q = incomingQuotes[sym] || root.quotes[sym];
            if (!q || typeof q.price !== "number" || !isFinite(q.price))
                continue;
            var prevP = nextMem["PRICE:" + sym];
            nextMem["PRICE:" + sym] = q.price;
            memChanged = true;
            var symLvls = nextLevelsMap[sym];
            if (!Array.isArray(symLvls) || symLvls.length === 0)
                continue;
            var res = Model.evaluatePriceLevelAlerts(sym, symLvls, prevP, q.price, q, new Date());
            if (res.triggered && res.triggered.length > 0) {
                nextLevelsMap[sym] = res.nextLevels;
                root.symbolLevels = nextLevelsMap;
                root.symbolLevelsChangedExternally(sym, res.nextLevels);
                for (var t = 0; t < res.triggered.length; t++) {
                    var ev = res.triggered[t];
                    root.alertDispatchRequested({
                        title: ev.title,
                        body: ev.body,
                        discordPayload: ev.discordPayload,
                        logEntry: ev.logEntry
                    });
                }
            }
        }
        if (memChanged)
            root.symbolPriceMemory = nextMem;
    }

    function notifyStratTradeable(chk) {
        if (root.replayCutoffTs > 0)
            return;
        if (!chk || !chk.symbol || !chk.direction || !chk.setupTimeframe)
            return;

        var q = root.getQuote(chk.symbol);
        var transition = Model.evaluateStratAlertTransition(chk, q, root.signalStates, root.symbolPriceMemory, {
            replayActive: root.replayCutoffTs > 0,
            nowDate: new Date(),
            enableArmedAlerts: true
        });

        root.symbolPriceMemory = transition.nextPriceMemory;
        if (transition.stateUpdated) {
            root.signalStates = transition.nextStates;
            root.signalStatesUpdated(transition.nextStates);
        }

        if (!transition.shouldNotify || !transition.eventType)
            return;

        root.alertDispatchRequested({
            title: transition.title,
            body: transition.body,
            discordPayload: Model.discordAlertPayload(chk, transition.eventType),
            logEntry: transition.logEntry
        });
    }

    Timer {
        id: liveTimer
        interval: root.liveRefreshMs
        running: root.visible
        repeat: true
        onTriggered: if (!quoteProc.running)
            root.refreshQuotes()
    }

    Timer {
        id: chartLiveTimer
        interval: root.chartRefreshMs
        running: root.visible
        repeat: true
        onTriggered: root.refreshAllCharts(true)
    }

    function refreshAllCharts(force) {
        var isForced = force === true;
        var stepTf = Model.mapReplayStepInterval(root.replayStepInterval);
        if (root.gridMode === "1x1") {
            var sym1 = symbolForCell(root.activeCellIndex);
            var tf1 = timeframeForCell(root.activeCellIndex);
            requestChartFetch(sym1, tf1, isForced);
            requestChartFetch(sym1, "30", isForced);
            requestChartFetch(sym1, "60", isForced);
            requestChartFetch(sym1, "1D", isForced);
            if (stepTf)
                requestChartFetch(sym1, stepTf, isForced);
            return;
        }
        var count = root.gridMode === "2+3" ? 5 : 4;
        for (var i = 0; i < count; i++) {
            var sym = symbolForCell(i);
            var tf = timeframeForCell(i);
            requestChartFetch(sym, tf, isForced);
            requestChartFetch(sym, "30", isForced);
            requestChartFetch(sym, "60", isForced);
            requestChartFetch(sym, "1D", isForced);
        }
        if (stepTf) {
            var activeSym = symbolForCell(root.activeCellIndex);
            requestChartFetch(activeSym, stepTf, isForced);
        }
    }

    function handleCrosshairMoved(sourceIndex, timestamp, price, candle) {
        root.focusMovedByKeyboard = false;
        if (!root.syncCrosshair && !root.syncTime)
            return;
        if (root.gridMode === "1x1")
            return;
        if (sourceIndex !== 0)
            cell0.syncToTimestamp(timestamp);
        if (sourceIndex !== 1)
            cell1.syncToTimestamp(timestamp);
        if (root.gridMode === "2x2") {
            if (sourceIndex !== 2)
                cell2.syncToTimestamp(timestamp);
            if (sourceIndex !== 3)
                cell3.syncToTimestamp(timestamp);
        } else if (root.gridMode === "2+3") {
            if (sourceIndex !== 2)
                cell2_3.syncToTimestamp(timestamp);
            if (sourceIndex !== 3)
                cell3_3.syncToTimestamp(timestamp);
            if (sourceIndex !== 4)
                cell4.syncToTimestamp(timestamp);
        }
    }

    function handleCrosshairCleared(sourceIndex) {
        if (!root.syncCrosshair && !root.syncTime)
            return;
        if (root.gridMode === "1x1")
            return;
        if (sourceIndex !== 0)
            cell0.syncToTimestamp(-1);
        if (sourceIndex !== 1)
            cell1.syncToTimestamp(-1);
        if (root.gridMode === "2x2") {
            if (sourceIndex !== 2)
                cell2.syncToTimestamp(-1);
            if (sourceIndex !== 3)
                cell3.syncToTimestamp(-1);
        } else if (root.gridMode === "2+3") {
            if (sourceIndex !== 2)
                cell2_3.syncToTimestamp(-1);
            if (sourceIndex !== 3)
                cell3_3.syncToTimestamp(-1);
            if (sourceIndex !== 4)
                cell4.syncToTimestamp(-1);
        }
    }

    function setSymbolForCell(index, newSymbol) {
        var sym = Model.normalizeSymbol(newSymbol);
        if (!sym)
            return;
        if (root.syncSymbol) {
            root.mainSymbol = sym;
            var nextSymbols = [];
            for (var i = 0; i < 5; i++)
                nextSymbols.push(sym);
            root.cellSymbols = nextSymbols;
        } else {
            var defaults = Model.gridTimeframes(root.gridMode === "1x1" ? root.previousGridMode : root.gridMode);
            var updated = [];
            for (var i = 0; i < 5; i++) {
                if (root.cellSymbols && root.cellSymbols[i])
                    updated.push(root.cellSymbols[i]);
                else
                    updated.push(root.mainSymbol);
            }
            updated[index] = sym;
            root.cellSymbols = updated;
        }
        refreshQuotes();
        refreshAllCharts();
        saveGridState();
    }

    function setTimeframeForCell(index, newTimeframe) {
        if (root.syncTimeframe) {
            var nextTfs = [];
            for (var i = 0; i < 5; i++)
                nextTfs.push(newTimeframe);
            root.cellTimeframes = nextTfs;
        } else {
            var defaults = Model.gridTimeframes(root.gridMode === "1x1" ? root.previousGridMode : root.gridMode);
            var updated = [];
            for (var i = 0; i < 5; i++) {
                if (root.cellTimeframes && root.cellTimeframes[i])
                    updated.push(root.cellTimeframes[i]);
                else
                    updated.push(defaults[i] || "1D");
            }
            updated[index] = newTimeframe;
            root.cellTimeframes = updated;
        }
        refreshAllCharts();
        saveGridState();
    }

    function resolveTargetCellIndex() {
        if (root.gridMode === "1x1" || root.focusMovedByKeyboard)
            return root.activeCellIndex;
        if (cell0.cellHovered)
            return 0;
        if (cell1.cellHovered)
            return 1;
        if (root.gridMode === "2x2") {
            if (cell2.cellHovered)
                return 2;
            if (cell3.cellHovered)
                return 3;
        } else if (root.gridMode === "2+3") {
            if (cell2_3.cellHovered)
                return 2;
            if (cell3_3.cellHovered)
                return 3;
            if (cell4.cellHovered)
                return 4;
        }
        return root.activeCellIndex;
    }

    function toggleMaximize(index) {
        if (root.gridMode === "1x1") {
            root.gridMode = (root.previousGridMode === "2+3" || root.previousGridMode === "2x2") ? root.previousGridMode : "2+3";
        } else {
            root.previousGridMode = root.gridMode;
            if (index !== undefined && index >= 0)
                root.activeCellIndex = index;
            root.gridMode = "1x1";
        }
    }

    function saveGridState() {
        var splits = {
            "2x2": {
                rowRatio: root.rowSplitRatio,
                colTopRatio: root.topColSplitRatio,
                colBotRatio: root.botColSplitRatio
            },
            "2+3": {
                rowRatio: root.rowSplitRatio,
                colTopRatio: root.topColSplitRatio,
                colBotRatios: [root.botCol1Ratio, root.botCol2Ratio, 1 - root.botCol1Ratio - root.botCol2Ratio]
            }
        };
        var sync = {
            symbol: root.syncSymbol,
            timeframe: root.syncTimeframe,
            crosshair: root.syncCrosshair,
            time: root.syncTime,
            broadening: root.showBroadening
        };
        var persistedMode = (root.gridMode === "1x1") ? ((root.previousGridMode === "2+3" || root.previousGridMode === "2x2") ? root.previousGridMode : "2+3") : root.gridMode;
        root.stateSaveRequested(persistedMode, sync, root.cellSymbols, splits);
    }

    function getActiveCellItem() {
        if (root.gridMode === "1x1")
            return cellFocusSingle;
        if (root.activeCellIndex === 0)
            return cell0;
        if (root.activeCellIndex === 1)
            return cell1;
        if (root.activeCellIndex === 2)
            return root.gridMode === "2+3" ? cell2_3 : cell2;
        if (root.activeCellIndex === 3)
            return root.gridMode === "2+3" ? cell3_3 : cell3;
        if (root.activeCellIndex === 4 && root.gridMode === "2+3")
            return cell4;
        return cell0;
    }

    Component.onCompleted: {
        refreshQuotes();
        refreshAllCharts();
        refreshAttackScan();
        Qt.callLater(function () {
            var item = root.getActiveCellItem();
            if (item)
                item.forceActiveFocus();
        });
    }

    onVisibleChanged: {
        if (visible) {
            refreshQuotes();
            refreshAllCharts();
            refreshAttackScan();
            Qt.callLater(function () {
                var item = root.getActiveCellItem();
                if (item)
                    item.forceActiveFocus();
            });
        }
    }

    onActiveCellIndexChanged: {
        if (root.gridMode === "1x1") {
            refreshQuotes();
            refreshAllCharts(false);
        }
        Qt.callLater(function () {
            var item = root.getActiveCellItem();
            if (item)
                item.forceActiveFocus();
        });
    }

    onMainSymbolChanged: {
        root.replayCutoffTs = 0;
        refreshQuotes();
        refreshAllCharts();
        refreshAttackScan();
    }
    onGridModeChanged: {
        refreshQuotes();
        refreshAllCharts();
        Qt.callLater(function () {
            var item = root.getActiveCellItem();
            if (item)
                item.forceActiveFocus();
        });
    }

    Item {
        id: container
        anchors.fill: parent
        focus: true

        Keys.onPressed: function (event) {
            var activeCell = root.getActiveCellItem();
            var inputActive = activeCell && (activeCell.searching || activeCell.changingInterval || activeCell.editingLevel);

            if (inputActive) {
                if (event.key === Qt.Key_Escape) {
                    if (activeCell.searching)
                        activeCell.dismissSearch();
                    else if (activeCell.changingInterval)
                        activeCell.dismissIntervalInput();
                    else if (activeCell.editingLevel)
                        activeCell.dismissLevelEdit();
                    event.accepted = true;
                }
                return;
            }

            if (event.key === Qt.Key_Escape) {
                if (root.replayIntervalExpanded) {
                    root.replayIntervalExpanded = false;
                    event.accepted = true;
                    return;
                }
                if (root.replayCutoffTs > 0) {
                    root.setReplayCutoff(0);
                    event.accepted = true;
                    return;
                }
                if (root.gridExpanded) {
                    root.gridExpanded = false;
                    event.accepted = true;
                    return;
                }
                if (root.gridMode === "1x1") {
                    root.gridMode = (root.previousGridMode === "2+3" || root.previousGridMode === "2x2") ? root.previousGridMode : "2+3";
                    event.accepted = true;
                } else {
                    root.visible = false;
                    event.accepted = true;
                }
            } else if (event.key === Qt.Key_F && !(event.modifiers & (Qt.ControlModifier | Qt.AltModifier | Qt.MetaModifier))) {
                root.toggleMaximize(root.resolveTargetCellIndex());
                event.accepted = true;
            } else if (event.key === Qt.Key_Left && root.replayCutoffTs > 0) {
                root.stepReplay(-1);
                event.accepted = true;
            } else if (event.key === Qt.Key_Right && root.replayCutoffTs > 0) {
                root.stepReplay(1);
                event.accepted = true;
            } else if (event.key === Qt.Key_R) {
                if (activeCell && activeCell.activeHoverCandle && isFinite(activeCell.activeHoverCandle.timestamp)) {
                    root.setReplayCutoff(activeCell.activeHoverCandle.timestamp);
                } else if (root.replayCutoffTs > 0) {
                    root.setReplayCutoff(0);
                } else {
                    root.stepReplay(-1);
                }
                event.accepted = true;
            } else if (event.key === Qt.Key_Tab || event.key === Qt.Key_Backtab) {
                var baseMode = (root.gridMode === "1x1") ? ((root.previousGridMode === "2+3" || root.previousGridMode === "2x2") ? root.previousGridMode : "2+3") : root.gridMode;
                var totalCells = baseMode === "2+3" ? 5 : 4;
                var step = (event.key === Qt.Key_Backtab || (event.modifiers & Qt.ShiftModifier)) ? -1 : 1;
                root.focusMovedByKeyboard = true;
                root.activeCellIndex = (root.activeCellIndex + step + totalCells) % totalCells;
                var activeItem = root.getActiveCellItem();
                if (activeItem)
                    activeItem.forceActiveFocus();
                event.accepted = true;
            } else if (event.key >= Qt.Key_0 && event.key <= Qt.Key_9) {
                if (activeCell) {
                    var digit = (event.text && event.text.length > 0) ? event.text : String(event.key - Qt.Key_0);
                    activeCell.startIntervalInput(digit);
                    event.accepted = true;
                }
            } else if (event.key === Qt.Key_Slash || event.key === Qt.Key_S) {
                if (activeCell) {
                    activeCell.startSearch();
                    event.accepted = true;
                }
            } else if (event.key === Qt.Key_Comma || event.key === Qt.Key_I) {
                if (activeCell) {
                    activeCell.startIntervalInput("");
                    event.accepted = true;
                }
            }
        }

        Column {
            anchors.fill: parent
            spacing: 0

            // Master Text Control Header (Zero-Chrome, Single-Row TradingView-Style)
            Item {
                id: masterHeader
                width: parent.width
                height: Style.space(36)

                readonly property int syncActiveCount: (root.syncSymbol ? 1 : 0) + (root.syncTimeframe ? 1 : 0) + (root.syncCrosshair ? 1 : 0) + (root.syncTime ? 1 : 0)
                readonly property var syncToggles: [
                    {
                        key: "sym",
                        label: "SYM " + (root.syncSymbol ? "[ON]" : "[OFF]"),
                        fullLabel: "Symbol",
                        checked: root.syncSymbol,
                        tooltip: "Sync symbol across all cells"
                    },
                    {
                        key: "tf",
                        label: "TF " + (root.syncTimeframe ? "[ON]" : "[OFF]"),
                        fullLabel: "Timeframe",
                        checked: root.syncTimeframe,
                        tooltip: "Sync timeframe across all cells"
                    },
                    {
                        key: "cross",
                        label: "CROSS " + (root.syncCrosshair ? "[ON]" : "[OFF]"),
                        fullLabel: "Crosshair",
                        checked: root.syncCrosshair,
                        tooltip: "Sync crosshair across all cells"
                    },
                    {
                        key: "time",
                        label: "TIME " + (root.syncTime ? "[ON]" : "[OFF]"),
                        fullLabel: "Time Scroll",
                        checked: root.syncTime,
                        tooltip: "Sync time scroll across all cells"
                    }
                ]
                readonly property real fullRightWidth: inlineSyncRow.implicitWidth + bfChip.implicitWidth + alertsMuteToggle.implicitWidth + (root.fetching ? Style.space(22) : 0) + Style.space(18)
                readonly property bool compactSync: (leftControlsRow.implicitWidth + fullRightWidth + Style.space(40)) > width

                function toggleSyncOption(key) {
                    if (key === "sym") {
                        root.syncSymbol = !root.syncSymbol;
                        if (root.syncSymbol) {
                            var currentSym = root.symbolForCell(root.activeCellIndex);
                            root.mainSymbol = currentSym;
                            var nextSymbols = [];
                            for (var i = 0; i < 5; i++)
                                nextSymbols.push(currentSym);
                            root.cellSymbols = nextSymbols;
                        }
                        root.refreshQuotes();
                        root.refreshAllCharts();
                    } else if (key === "tf") {
                        root.syncTimeframe = !root.syncTimeframe;
                        if (root.syncTimeframe) {
                            var currentTf = root.timeframeForCell(root.activeCellIndex);
                            var nextTfs = [];
                            for (var j = 0; j < 5; j++)
                                nextTfs.push(currentTf);
                            root.cellTimeframes = nextTfs;
                        } else {
                            root.cellTimeframes = Model.gridTimeframes(root.gridMode === "1x1" ? root.previousGridMode : root.gridMode);
                        }
                        root.refreshAllCharts();
                    } else if (key === "cross") {
                        root.syncCrosshair = !root.syncCrosshair;
                    } else if (key === "time") {
                        root.syncTime = !root.syncTime;
                    }
                    root.saveGridState();
                }

                component SyncChip: FinanceChipButton {
                    foreground: root.foreground
                    dimColor: root.dim
                    fontFamily: root.fontFamily
                }

                // Left-aligned Grid & Replay Controls (clipped cleanly before right controls)
                Row {
                    id: leftControlsRow
                    anchors.left: parent.left
                    anchors.leftMargin: Style.space(12)
                    anchors.right: rightControlsRow.left
                    anchors.rightMargin: Style.space(8)
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: Style.space(20)
                    clip: true

                    // Grid Layout Selector (Left-aligned, collapsible)
                    Row {
                        id: gridLayoutRow
                        anchors.verticalCenter: parent.verticalCenter
                        spacing: Style.space(8)

                        Text {
                            text: "GRID"
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.bodySmall
                            font.bold: true
                            anchors.verticalCenter: parent.verticalCenter
                        }

                        InlineExpandSelector {
                            model: ["2x2", "2+3", "1x1"]
                            currentValue: root.gridMode
                            expanded: root.gridExpanded
                            activeColor: root.foreground
                            dimColor: root.dim
                            fontFamily: root.fontFamily
                            anchors.verticalCenter: parent.verticalCenter
                            onExpandRequested: root.gridExpanded = true
                            onCollapsed: root.gridExpanded = false
                            onSelected: function (value) {
                                if (value === "1x1" && root.gridMode !== "1x1") {
                                    root.previousGridMode = root.gridMode;
                                } else if (value !== "1x1") {
                                    root.previousGridMode = value;
                                }
                                root.gridMode = value;
                                if (!root.syncTimeframe) {
                                    var defaults = Model.gridTimeframes(value);
                                    var nextTfs = [];
                                    for (var ti = 0; ti < 5; ti++) {
                                        nextTfs.push((root.cellTimeframes && root.cellTimeframes[ti]) ? root.cellTimeframes[ti] : (defaults[ti] || "1D"));
                                    }
                                    root.cellTimeframes = nextTfs;
                                }
                                root.gridExpanded = false;
                                root.refreshQuotes();
                                root.refreshAllCharts();
                                root.saveGridState();
                            }
                        }

                        HoverHandler {
                            onHoveredChanged: {
                                if (!hovered)
                                    root.gridExpanded = false;
                            }
                        }
                    }

                    // Replay Control (Center-Left, Zero-Chrome)
                    Row {
                        id: replayControlRow
                        anchors.verticalCenter: parent.verticalCenter
                        spacing: Style.space(6)

                        readonly property color replayAmber: Qt.rgba(0.92, 0.65, 0.15, 1)
                        readonly property string activeSym: root.symbolForCell(root.activeCellIndex)
                        readonly property var replayStepCandles: {
                            var stepTf = Model.mapReplayStepInterval(root.replayStepInterval);
                            if (!stepTf)
                                stepTf = root.timeframeForCell(root.activeCellIndex);
                            return root.chartCache[root.cacheKey(activeSym, stepTf)] || root.chartCache[root.cacheKey(activeSym, "5")] || root.chartCache[root.cacheKey(activeSym, "30")] || [];
                        }
                        readonly property string badgeTime: Model.formatReplayBadgeTime(root.replayCutoffTs, replayStepCandles, root.chartCache[root.cacheKey(activeSym, "30")] || [], root.chartCache[root.cacheKey(activeSym, "60")] || [], root.chartCache[root.cacheKey(activeSym, "1D")] || [])

                        Text {
                            anchors.verticalCenter: parent.verticalCenter
                            textFormat: Text.PlainText
                            text: root.replayCutoffTs > 0 ? ("REPLAY [" + replayControlRow.badgeTime + "]") : "REPLAY [OFF]"
                            color: root.replayCutoffTs > 0 ? replayControlRow.replayAmber : root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.bodySmall
                            font.bold: root.replayCutoffTs > 0

                            MouseArea {
                                anchors.fill: parent
                                anchors.margins: -Style.space(4)
                                cursorShape: Qt.PointingHandCursor
                                onClicked: {
                                    if (root.replayCutoffTs > 0)
                                        root.setReplayCutoff(0);
                                    else
                                        root.stepReplay(-1);
                                }
                            }
                        }

                        Text {
                            visible: root.replayCutoffTs > 0
                            anchors.verticalCenter: parent.verticalCenter
                            textFormat: Text.PlainText
                            text: "◀"
                            color: replayControlRow.replayAmber
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.bodySmall
                            font.bold: true

                            MouseArea {
                                anchors.fill: parent
                                anchors.margins: -Style.space(4)
                                cursorShape: Qt.PointingHandCursor
                                onClicked: root.stepReplay(-1)
                            }
                        }

                        InlineExpandSelector {
                            visible: root.replayCutoffTs > 0
                            model: ["Auto", "1m", "5m", "15m", "30m", "60m", "1D"]
                            currentValue: root.replayStepInterval
                            collapsedText: "[" + root.replayStepInterval + "]"
                            expanded: root.replayIntervalExpanded
                            activeColor: replayControlRow.replayAmber
                            dimColor: root.dim
                            fontFamily: root.fontFamily
                            anchors.verticalCenter: parent.verticalCenter
                            onExpandRequested: root.replayIntervalExpanded = true
                            onCollapsed: root.replayIntervalExpanded = false
                            onSelected: function (value) {
                                root.setReplayStepInterval(value);
                                root.replayIntervalExpanded = false;
                            }
                        }

                        Text {
                            visible: root.replayCutoffTs > 0
                            anchors.verticalCenter: parent.verticalCenter
                            textFormat: Text.PlainText
                            text: "▶"
                            color: replayControlRow.replayAmber
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.bodySmall
                            font.bold: true

                            MouseArea {
                                anchors.fill: parent
                                anchors.margins: -Style.space(4)
                                cursorShape: Qt.PointingHandCursor
                                onClicked: root.stepReplay(1)
                            }
                        }

                        Text {
                            visible: root.replayCutoffTs > 0
                            anchors.verticalCenter: parent.verticalCenter
                            textFormat: Text.PlainText
                            text: "✕"
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.bodySmall
                            font.bold: true

                            MouseArea {
                                anchors.fill: parent
                                anchors.margins: -Style.space(4)
                                cursorShape: Qt.PointingHandCursor
                                onClicked: root.setReplayCutoff(0)
                            }
                        }
                    }
                }

                // Right-aligned Controls (inline when wide, compact SYNC dropdown when narrow)
                Row {
                    id: rightControlsRow
                    anchors.right: parent.right
                    anchors.rightMargin: Style.space(12)
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: Style.space(6)

                    FinanceLoader {
                        active: root.fetching
                        color: root.dim
                        spinnerSize: Style.font.bodySmall
                        anchors.verticalCenter: parent.verticalCenter
                    }

                    Row {
                        id: inlineSyncRow
                        visible: !masterHeader.compactSync
                        anchors.verticalCenter: parent.verticalCenter
                        spacing: Style.space(6)

                        Text {
                            text: "SYNC"
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.bodySmall
                            font.bold: true
                            anchors.verticalCenter: parent.verticalCenter
                        }

                        Repeater {
                            model: masterHeader.syncToggles

                            SyncChip {
                                required property var modelData
                                text: modelData.label
                                checked: modelData.checked
                                tooltipText: modelData.tooltip
                                anchors.verticalCenter: parent.verticalCenter
                                onClicked: masterHeader.toggleSyncOption(modelData.key)
                            }
                        }
                    }

                    SyncChip {
                        id: compactSyncButton
                        visible: masterHeader.compactSync
                        text: "SYNC [" + masterHeader.syncActiveCount + "/4] ▾"
                        checked: masterHeader.syncActiveCount > 0 || syncPopup.visible
                        tooltipText: "Sync options across cells"
                        anchors.verticalCenter: parent.verticalCenter
                        onClicked: {
                            if (syncPopup.visible)
                                syncPopup.close();
                            else
                                syncPopup.open();
                        }

                        QQC.Popup {
                            id: syncPopup
                            parent: compactSyncButton
                            x: Math.min(0, compactSyncButton.width - width)
                            y: compactSyncButton.height + Style.space(4)
                            padding: Style.space(6)
                            closePolicy: QQC.Popup.CloseOnEscape | QQC.Popup.CloseOnPressOutsideParent

                            background: FinanceSurface {
                                elevation: 3
                                radiusToken: "md"
                                foregroundColor: root.foreground
                                surfaceColor: (Color.popups && Color.popups.background) ? Color.popups.background : Color.background
                            }

                            contentItem: Column {
                                spacing: Style.space(4)

                                Repeater {
                                    model: masterHeader.syncToggles

                                    SyncChip {
                                        required property var modelData
                                        width: Style.space(150)
                                        text: modelData.fullLabel + " " + (modelData.checked ? "[ON]" : "[OFF]")
                                        checked: modelData.checked
                                        tooltipText: modelData.tooltip
                                        onClicked: masterHeader.toggleSyncOption(modelData.key)
                                    }
                                }
                            }
                        }
                    }

                    SyncChip {
                        id: bfChip
                        text: "BF " + (root.showBroadening ? "[ON]" : "[OFF]")
                        checked: root.showBroadening
                        tooltipText: "Toggle Broadening Formation lines"
                        anchors.verticalCenter: parent.verticalCenter
                        onClicked: {
                            root.showBroadening = !root.showBroadening;
                            root.saveGridState();
                        }
                    }

                    SyncChip {
                        id: alertsMuteToggle
                        text: "ALERTS " + (root.alertsMuted ? "[MUTED]" : "[ON]")
                        checked: true
                        foreground: root.alertsMuted ? Color.urgent : root.foreground
                        accentColor: root.alertsMuted ? Color.urgent : Color.accent
                        tooltipText: root.alertsMuted ? (root.alertsMuteStatus + " · click to unmute") : "Click to mute alerts until the next market open"
                        anchors.verticalCenter: parent.verticalCenter
                        onClicked: root.alertsMuteToggleRequested()
                    }
                }
            }

            Rectangle {
                width: parent.width
                height: 1
                color: Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.12)
            }

            // Grid Canvas Viewport
            Item {
                id: gridViewport
                width: parent.width
                height: parent.height - masterHeader.height - 1

                readonly property real topRowHeight: root.gridMode === "1x1" ? height : (height * root.rowSplitRatio)
                readonly property real botRowHeight: height - topRowHeight

                // 1x1 Maximize Mode
                Item {
                    id: singleContainer
                    visible: root.gridMode === "1x1"
                    anchors.fill: parent

                    GridCell {
                        id: cellFocusSingle
                        anchors.fill: parent
                        cellIndex: root.activeCellIndex
                        symbol: root.symbolForCell(root.activeCellIndex)
                        timeframe: root.timeframeForCell(root.activeCellIndex)
                        zoomCount: root.zoomForCell(root.activeCellIndex)
                        quote: root.getQuote(symbol, root.cellRev(cellIndex))
                        candles: root.getCandles(symbol, timeframe, root.cellRev(cellIndex))
                        hourlyCandles: root.getCandles(symbol, "60", root.cellRev(cellIndex))
                        dailyCandles: root.getCandles(symbol, "1D", root.cellRev(cellIndex))
                        priceLevels: root.symbolLevels[symbol] || []
                        replayCutoffTs: root.replayCutoffTs
                        activeFocusCell: true
                        showBroadening: root.showBroadening

                        onFocusRequested: function (idx) {
                            root.focusMovedByKeyboard = false;
                            root.activeCellIndex = idx;
                        }
                        onMaximizeRequested: function (idx) {
                            root.toggleMaximize(idx);
                        }
                        onSymbolChangedManually: function (idx, sym) {
                            root.setSymbolForCell(idx, sym);
                        }
                        onTimeframeChangedManually: function (idx, tf) {
                            root.setTimeframeForCell(idx, tf);
                        }
                        onZoomChangedManually: function (idx, z) {
                            root.setZoomForCell(idx, z);
                        }
                        onStratTradeableDetected: function (chk) {
                            root.notifyStratTradeable(chk);
                        }
                        onPriceLevelsModified: function (sym, nextLevels) {
                            root.updateSymbolLevels(sym, nextLevels);
                        }
                        onReplayRequested: function (ts) {
                            root.setReplayCutoff(ts);
                        }
                    }
                }

                // Multi-Grid Container (2x2 and 2+3)
                Item {
                    id: multiContainer
                    visible: root.gridMode !== "1x1"
                    anchors.fill: parent

                    // TOP ROW (2 cells)
                    Item {
                        id: topRowContainer
                        width: parent.width
                        height: gridViewport.topRowHeight
                        anchors.top: parent.top
                        anchors.left: parent.left

                        readonly property real col0Width: width * root.topColSplitRatio
                        readonly property real col1Width: width - col0Width

                        GridCell {
                            id: cell0
                            cellIndex: 0
                            x: 0
                            y: 0
                            width: topRowContainer.col0Width
                            height: parent.height
                            symbol: root.symbolForCell(0)
                            timeframe: root.timeframeForCell(0)
                            zoomCount: root.zoomForCell(0)
                            quote: root.getQuote(symbol, root.cellRev(cellIndex))
                            candles: root.getCandles(symbol, timeframe, root.cellRev(cellIndex))
                            hourlyCandles: root.getCandles(symbol, "60", root.cellRev(cellIndex))
                            dailyCandles: root.getCandles(symbol, "1D", root.cellRev(cellIndex))
                            priceLevels: root.symbolLevels[symbol] || []
                            replayCutoffTs: root.replayCutoffTs
                            activeFocusCell: root.activeCellIndex === 0
                            showBroadening: root.showBroadening

                            onFocusRequested: function (idx) {
                                root.focusMovedByKeyboard = false;
                                root.activeCellIndex = idx;
                            }
                            onMaximizeRequested: function (idx) {
                                root.toggleMaximize(idx);
                            }
                            onSymbolChangedManually: function (idx, sym) {
                                root.setSymbolForCell(idx, sym);
                            }
                            onTimeframeChangedManually: function (idx, tf) {
                                root.setTimeframeForCell(idx, tf);
                            }
                            onZoomChangedManually: function (idx, z) {
                                root.setZoomForCell(idx, z);
                            }
                            onCrosshairMoved: function (ts, pr, c) {
                                root.handleCrosshairMoved(0, ts, pr, c);
                            }
                            onCrosshairCleared: {
                                root.handleCrosshairCleared(0);
                            }
                            onStratTradeableDetected: function (chk) {
                                root.notifyStratTradeable(chk);
                            }
                            onPriceLevelsModified: function (sym, nextLevels) {
                                root.updateSymbolLevels(sym, nextLevels);
                            }
                            onReplayRequested: function (ts) {
                                root.setReplayCutoff(ts);
                            }
                        }

                        // Top Col Splitter
                        GridSplitter {
                            orientation: Qt.Vertical
                            x: topRowContainer.col0Width - width / 2
                            height: parent.height
                            ratio: root.topColSplitRatio
                            totalSpan: topRowContainer.width
                            onRatioChangedManually: function (r) {
                                root.topColSplitRatio = r;
                            }
                            onDragFinished: {
                                root.saveGridState();
                            }
                        }

                        GridCell {
                            id: cell1
                            cellIndex: 1
                            x: topRowContainer.col0Width
                            y: 0
                            width: topRowContainer.col1Width
                            height: parent.height
                            symbol: root.symbolForCell(1)
                            timeframe: root.timeframeForCell(1)
                            zoomCount: root.zoomForCell(1)
                            quote: root.getQuote(symbol, root.cellRev(cellIndex))
                            candles: root.getCandles(symbol, timeframe, root.cellRev(cellIndex))
                            hourlyCandles: root.getCandles(symbol, "60", root.cellRev(cellIndex))
                            dailyCandles: root.getCandles(symbol, "1D", root.cellRev(cellIndex))
                            priceLevels: root.symbolLevels[symbol] || []
                            replayCutoffTs: root.replayCutoffTs
                            activeFocusCell: root.activeCellIndex === 1
                            showBroadening: root.showBroadening

                            onFocusRequested: function (idx) {
                                root.focusMovedByKeyboard = false;
                                root.activeCellIndex = idx;
                            }
                            onMaximizeRequested: function (idx) {
                                root.toggleMaximize(idx);
                            }
                            onSymbolChangedManually: function (idx, sym) {
                                root.setSymbolForCell(idx, sym);
                            }
                            onTimeframeChangedManually: function (idx, tf) {
                                root.setTimeframeForCell(idx, tf);
                            }
                            onZoomChangedManually: function (idx, z) {
                                root.setZoomForCell(idx, z);
                            }
                            onCrosshairMoved: function (ts, pr, c) {
                                root.handleCrosshairMoved(1, ts, pr, c);
                            }
                            onCrosshairCleared: {
                                root.handleCrosshairCleared(1);
                            }
                            onStratTradeableDetected: function (chk) {
                                root.notifyStratTradeable(chk);
                            }
                            onPriceLevelsModified: function (sym, nextLevels) {
                                root.updateSymbolLevels(sym, nextLevels);
                            }
                            onReplayRequested: function (ts) {
                                root.setReplayCutoff(ts);
                            }
                        }
                    }

                    // Horizontal Row Splitter
                    GridSplitter {
                        orientation: Qt.Horizontal
                        y: gridViewport.topRowHeight - height / 2
                        width: parent.width
                        ratio: root.rowSplitRatio
                        totalSpan: gridViewport.height
                        onRatioChangedManually: function (r) {
                            root.rowSplitRatio = r;
                        }
                        onDragFinished: {
                            root.saveGridState();
                        }
                    }

                    // BOTTOM ROW (2 cells for 2x2, 3 cells for 2+3)
                    Item {
                        id: botRowContainer
                        width: parent.width
                        height: gridViewport.botRowHeight
                        anchors.bottom: parent.bottom
                        anchors.left: parent.left

                        // 2x2 Bottom Row
                        Item {
                            id: botRow2x2
                            visible: root.gridMode === "2x2"
                            anchors.fill: parent

                            readonly property real col2Width: width * root.botColSplitRatio
                            readonly property real col3Width: width - col2Width

                            GridCell {
                                id: cell2
                                cellIndex: 2
                                x: 0
                                y: 0
                                width: botRow2x2.col2Width
                                height: parent.height
                                symbol: root.symbolForCell(2)
                                timeframe: root.timeframeForCell(2)
                                zoomCount: root.zoomForCell(2)
                                quote: root.getQuote(symbol, root.cellRev(cellIndex))
                                candles: root.getCandles(symbol, timeframe, root.cellRev(cellIndex))
                                hourlyCandles: root.getCandles(symbol, "60", root.cellRev(cellIndex))
                                dailyCandles: root.getCandles(symbol, "1D", root.cellRev(cellIndex))
                                priceLevels: root.symbolLevels[symbol] || []
                                replayCutoffTs: root.replayCutoffTs
                                activeFocusCell: root.activeCellIndex === 2
                                showBroadening: root.showBroadening

                                onFocusRequested: function (idx) {
                                    root.focusMovedByKeyboard = false;
                                    root.activeCellIndex = idx;
                                }
                                onMaximizeRequested: function (idx) {
                                    root.toggleMaximize(idx);
                                }
                                onSymbolChangedManually: function (idx, sym) {
                                    root.setSymbolForCell(idx, sym);
                                }
                                onTimeframeChangedManually: function (idx, tf) {
                                    root.setTimeframeForCell(idx, tf);
                                }
                                onZoomChangedManually: function (idx, z) {
                                    root.setZoomForCell(idx, z);
                                }
                                onCrosshairMoved: function (ts, pr, c) {
                                    root.handleCrosshairMoved(2, ts, pr, c);
                                }
                                onCrosshairCleared: {
                                    root.handleCrosshairCleared(2);
                                }
                                onStratTradeableDetected: function (chk) {
                                    root.notifyStratTradeable(chk);
                                }
                                onPriceLevelsModified: function (sym, nextLevels) {
                                    root.updateSymbolLevels(sym, nextLevels);
                                }
                                onReplayRequested: function (ts) {
                                    root.setReplayCutoff(ts);
                                }
                            }

                            // Bottom Col Splitter (2x2)
                            GridSplitter {
                                orientation: Qt.Vertical
                                x: botRow2x2.col2Width - width / 2
                                height: parent.height
                                ratio: root.botColSplitRatio
                                totalSpan: botRow2x2.width
                                onRatioChangedManually: function (r) {
                                    root.botColSplitRatio = r;
                                }
                                onDragFinished: {
                                    root.saveGridState();
                                }
                            }

                            GridCell {
                                id: cell3
                                cellIndex: 3
                                x: botRow2x2.col2Width
                                y: 0
                                width: botRow2x2.col3Width
                                height: parent.height
                                symbol: root.symbolForCell(3)
                                timeframe: root.timeframeForCell(3)
                                zoomCount: root.zoomForCell(3)
                                quote: root.getQuote(symbol, root.cellRev(cellIndex))
                                candles: root.getCandles(symbol, timeframe, root.cellRev(cellIndex))
                                hourlyCandles: root.getCandles(symbol, "60", root.cellRev(cellIndex))
                                dailyCandles: root.getCandles(symbol, "1D", root.cellRev(cellIndex))
                                priceLevels: root.symbolLevels[symbol] || []
                                replayCutoffTs: root.replayCutoffTs
                                activeFocusCell: root.activeCellIndex === 3
                                showBroadening: root.showBroadening

                                onFocusRequested: function (idx) {
                                    root.focusMovedByKeyboard = false;
                                    root.activeCellIndex = idx;
                                }
                                onMaximizeRequested: function (idx) {
                                    root.toggleMaximize(idx);
                                }
                                onSymbolChangedManually: function (idx, sym) {
                                    root.setSymbolForCell(idx, sym);
                                }
                                onTimeframeChangedManually: function (idx, tf) {
                                    root.setTimeframeForCell(idx, tf);
                                }
                                onZoomChangedManually: function (idx, z) {
                                    root.setZoomForCell(idx, z);
                                }
                                onCrosshairMoved: function (ts, pr, c) {
                                    root.handleCrosshairMoved(3, ts, pr, c);
                                }
                                onCrosshairCleared: {
                                    root.handleCrosshairCleared(3);
                                }
                                onStratTradeableDetected: function (chk) {
                                    root.notifyStratTradeable(chk);
                                }
                                onPriceLevelsModified: function (sym, nextLevels) {
                                    root.updateSymbolLevels(sym, nextLevels);
                                }
                                onReplayRequested: function (ts) {
                                    root.setReplayCutoff(ts);
                                }
                            }
                        }

                        // 2+3 Bottom Row (3 cells)
                        Item {
                            id: botRow23
                            visible: root.gridMode === "2+3"
                            anchors.fill: parent

                            readonly property real col2Width: width * root.botCol1Ratio
                            readonly property real col3Width: width * root.botCol2Ratio
                            readonly property real col4Width: width - col2Width - col3Width

                            GridCell {
                                id: cell2_3
                                cellIndex: 2
                                x: 0
                                y: 0
                                width: botRow23.col2Width
                                height: parent.height
                                symbol: root.symbolForCell(2)
                                timeframe: root.timeframeForCell(2)
                                zoomCount: root.zoomForCell(2)
                                quote: root.getQuote(symbol, root.cellRev(cellIndex))
                                candles: root.getCandles(symbol, timeframe, root.cellRev(cellIndex))
                                hourlyCandles: root.getCandles(symbol, "60", root.cellRev(cellIndex))
                                dailyCandles: root.getCandles(symbol, "1D", root.cellRev(cellIndex))
                                priceLevels: root.symbolLevels[symbol] || []
                                replayCutoffTs: root.replayCutoffTs
                                activeFocusCell: root.activeCellIndex === 2
                                showBroadening: root.showBroadening

                                onFocusRequested: function (idx) {
                                    root.focusMovedByKeyboard = false;
                                    root.activeCellIndex = idx;
                                }
                                onMaximizeRequested: function (idx) {
                                    root.toggleMaximize(idx);
                                }
                                onSymbolChangedManually: function (idx, sym) {
                                    root.setSymbolForCell(idx, sym);
                                }
                                onTimeframeChangedManually: function (idx, tf) {
                                    root.setTimeframeForCell(idx, tf);
                                }
                                onZoomChangedManually: function (idx, z) {
                                    root.setZoomForCell(idx, z);
                                }
                                onCrosshairMoved: function (ts, pr, c) {
                                    root.handleCrosshairMoved(2, ts, pr, c);
                                }
                                onCrosshairCleared: {
                                    root.handleCrosshairCleared(2);
                                }
                                onStratTradeableDetected: function (chk) {
                                    root.notifyStratTradeable(chk);
                                }
                                onPriceLevelsModified: function (sym, nextLevels) {
                                    root.updateSymbolLevels(sym, nextLevels);
                                }
                                onReplayRequested: function (ts) {
                                    root.setReplayCutoff(ts);
                                }
                            }

                            GridSplitter {
                                orientation: Qt.Vertical
                                x: botRow23.col2Width - width / 2
                                height: parent.height
                                ratio: root.botCol1Ratio
                                defaultRatio: 0.333
                                totalSpan: botRow23.width
                                onRatioChangedManually: function (r) {
                                    root.botCol1Ratio = r;
                                }
                                onDragFinished: {
                                    root.saveGridState();
                                }
                            }

                            GridCell {
                                id: cell3_3
                                cellIndex: 3
                                x: botRow23.col2Width
                                y: 0
                                width: botRow23.col3Width
                                height: parent.height
                                symbol: root.symbolForCell(3)
                                timeframe: root.timeframeForCell(3)
                                zoomCount: root.zoomForCell(3)
                                quote: root.getQuote(symbol, root.cellRev(cellIndex))
                                candles: root.getCandles(symbol, timeframe, root.cellRev(cellIndex))
                                hourlyCandles: root.getCandles(symbol, "60", root.cellRev(cellIndex))
                                dailyCandles: root.getCandles(symbol, "1D", root.cellRev(cellIndex))
                                priceLevels: root.symbolLevels[symbol] || []
                                replayCutoffTs: root.replayCutoffTs
                                activeFocusCell: root.activeCellIndex === 3
                                showBroadening: root.showBroadening

                                onFocusRequested: function (idx) {
                                    root.focusMovedByKeyboard = false;
                                    root.activeCellIndex = idx;
                                }
                                onMaximizeRequested: function (idx) {
                                    root.toggleMaximize(idx);
                                }
                                onSymbolChangedManually: function (idx, sym) {
                                    root.setSymbolForCell(idx, sym);
                                }
                                onTimeframeChangedManually: function (idx, tf) {
                                    root.setTimeframeForCell(idx, tf);
                                }
                                onZoomChangedManually: function (idx, z) {
                                    root.setZoomForCell(idx, z);
                                }
                                onCrosshairMoved: function (ts, pr, c) {
                                    root.handleCrosshairMoved(3, ts, pr, c);
                                }
                                onCrosshairCleared: {
                                    root.handleCrosshairCleared(3);
                                }
                                onStratTradeableDetected: function (chk) {
                                    root.notifyStratTradeable(chk);
                                }
                                onPriceLevelsModified: function (sym, nextLevels) {
                                    root.updateSymbolLevels(sym, nextLevels);
                                }
                                onReplayRequested: function (ts) {
                                    root.setReplayCutoff(ts);
                                }
                            }

                            GridSplitter {
                                orientation: Qt.Vertical
                                x: botRow23.col2Width + botRow23.col3Width - width / 2
                                height: parent.height
                                ratio: root.botCol2Ratio
                                defaultRatio: 0.333
                                totalSpan: botRow23.width
                                onRatioChangedManually: function (r) {
                                    root.botCol2Ratio = r;
                                }
                                onDragFinished: {
                                    root.saveGridState();
                                }
                            }

                            GridCell {
                                id: cell4
                                cellIndex: 4
                                x: botRow23.col2Width + botRow23.col3Width
                                y: 0
                                width: botRow23.col4Width
                                height: parent.height
                                symbol: root.symbolForCell(4)
                                timeframe: root.timeframeForCell(4)
                                zoomCount: root.zoomForCell(4)
                                quote: root.getQuote(symbol, root.cellRev(cellIndex))
                                candles: root.getCandles(symbol, timeframe, root.cellRev(cellIndex))
                                hourlyCandles: root.getCandles(symbol, "60", root.cellRev(cellIndex))
                                dailyCandles: root.getCandles(symbol, "1D", root.cellRev(cellIndex))
                                priceLevels: root.symbolLevels[symbol] || []
                                replayCutoffTs: root.replayCutoffTs
                                activeFocusCell: root.activeCellIndex === 4
                                showBroadening: root.showBroadening

                                onFocusRequested: function (idx) {
                                    root.focusMovedByKeyboard = false;
                                    root.activeCellIndex = idx;
                                }
                                onMaximizeRequested: function (idx) {
                                    root.toggleMaximize(idx);
                                }
                                onSymbolChangedManually: function (idx, sym) {
                                    root.setSymbolForCell(idx, sym);
                                }
                                onTimeframeChangedManually: function (idx, tf) {
                                    root.setTimeframeForCell(idx, tf);
                                }
                                onZoomChangedManually: function (idx, z) {
                                    root.setZoomForCell(idx, z);
                                }
                                onCrosshairMoved: function (ts, pr, c) {
                                    root.handleCrosshairMoved(4, ts, pr, c);
                                }
                                onCrosshairCleared: {
                                    root.handleCrosshairCleared(4);
                                }
                                onStratTradeableDetected: function (chk) {
                                    root.notifyStratTradeable(chk);
                                }
                                onPriceLevelsModified: function (sym, nextLevels) {
                                    root.updateSymbolLevels(sym, nextLevels);
                                }
                                onReplayRequested: function (ts) {
                                    root.setReplayCutoff(ts);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
