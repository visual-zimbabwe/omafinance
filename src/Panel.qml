import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model
import "HubRegistry.js" as HubRegistry

Panel {
    id: root
    moduleName: "mohamedmansour.finance"
    ipcTarget: "mohamedmansour.finance"
    manageIpc: false
    LayoutMirroring.enabled: Qt.application.layoutDirection === Qt.RightToLeft
    LayoutMirroring.childrenInherit: true

    property var anchorItem: null
    property bool openedFromHotkey: false
    property var hostWidget: null
    readonly property var barIdentity: hostWidget || root

    property var watchlist: Model.defaultWatchlist()
    property var pinned: Model.defaultPinned()
    property int pinIndex: 0
    property var quotes: ({})
    property var chartCache: ({})
    property var chartCacheAccess: ({})
    property bool candleCacheDirty: false
    signal candleCacheUpdated(string key)
    signal quotesUpdated(var changedSymbols)
    signal sessionBoundaryCrossed(string sessionState)
    property bool _lastKnownUsRthOpen: Model.isUsMarketOpen(new Date(), false)
    property int selectedIndex: 0
    property bool cursorActive: false
    property string view: "list"
    property string detailSymbol: ""
    property string detailRange: "1D"
    property var detailQuote: null
    property string gridMode: "2x2"
    property var gridSync: ({
            symbol: true,
            timeframe: false,
            crosshair: true,
            time: true
        })
    property var gridSymbols: []
    property var gridTimeframes: ["60", "1D", "1W", "1M", "1Y"]
    property var gridZooms: [-1, -1, -1, -1, -1]
    property var gridSplits: ({})
    property var activeGridWindows: []
    property var activeSectorWindows: []
    property var layouts: ({})
    property string activeLayoutName: ""
    property string layoutActionStatus: ""
    property string discordWebhook: ""
    property var symbolLevels: ({})
    property var signalStates: ({})
    property var symbolPriceMemory: ({})
    property var alertLog: []
    // 0 = live, -1 = muted until unmuted, >0 = muted until epoch ms (see Model.isAlertsMuted)
    property double alertsMutedUntil: 0
    property double muteClockMs: Date.now()
    readonly property bool alertsMuted: Model.isAlertsMuted(alertsMutedUntil, new Date(muteClockMs))
    readonly property string alertsMuteStatus: Model.alertsMuteStatusText(alertsMutedUntil, new Date(muteClockMs))
    readonly property string alertSoundPath: "/usr/share/sounds/freedesktop/stereo/message-new-instant.oga"
    property var armedWatchlistSetups: []
    property var bgCandleCache: ({})
    property var bgScanQueue: []
    property string bgFetchSymbol: ""
    property string bgFetchRange: ""
    property bool gridOpened: false
    property string chartFetchSymbol: ""
    property string chartFetchRange: ""
    property string insightsFetchSymbol: ""
    property string quotePageFetchSymbol: ""
    property bool quoteRefreshPending: false
    property int quoteFailureCount: 0
    property string quoteError: ""
    property double quotesUpdatedAt: 0
    property int chartFailureCount: 0
    property string chartError: ""
    property double chartUpdatedAt: 0
    property int insightsFailureCount: 0
    property string insightsError: ""
    property bool insightsLoaded: false
    property int quotePageFailureCount: 0
    property string quotePageError: ""
    property bool quotePageLoaded: false
    property var detailPage: ({})
    property var detailInsights: ({})
    property var detailHoldings: null
    property var detailHoldingsStratMap: ({})
    property bool detailHoldingsStratLoading: false
    property string holdingsFetchSymbol: ""
    property string holdingsStratFetchSymbol: ""
    property int holdingsFailureCount: 0
    property string holdingsError: ""
    property bool holdingsLoaded: false
    property var hoveredStratInfo: null
    property real hoveredStratGlobalX: 0
    property real hoveredStratGlobalY: 0
    property var detailHistory: []
    property var detailCache: ({})
    property var detailCacheOrder: []
    readonly property int detailCacheTtlMs: 300000
    readonly property int detailCacheLimit: 16
    property string searchQuery: ""
    property var suggestions: []
    property int suggestionIndex: 0
    property string searchPendingQuery: ""
    property string searchActiveQuery: ""
    property string searchError: ""
    property bool searching: false
    property var searchCache: ({})
    property var searchCacheOrder: []
    readonly property int searchCacheTtlMs: 300000
    readonly property int searchCacheLimit: 32
    property string listChrome: "rows"
    property int settingsCursor: 0
    property int detailSection: 0
    property int detailActionIndex: 0

    readonly property color contentForeground: bar ? bar.foreground : Color.foreground
    readonly property color contentBackground: (bar && bar.background) ? bar.background : Color.background
    readonly property color contentUrgent: bar ? bar.urgent : Color.urgent
    readonly property string contentFontFamily: bar ? bar.fontFamily : Style.font.family
    readonly property color dim: Model.accessibleDimColor(contentForeground, contentBackground)
    readonly property color upColor: Model.accessibleSemanticColor("up", contentBackground)
    readonly property color downColor: Model.accessibleSemanticColor("down", contentBackground)
    readonly property color upFill: Qt.rgba(upColor.r, upColor.g, upColor.b, 0.24)
    readonly property color downFill: Qt.rgba(downColor.r, downColor.g, downColor.b, 0.24)
    readonly property int refreshSeconds: Math.max(15, parseInt(setting("refreshSeconds", 60), 10) || 60)
    readonly property string changeStyle: {
        var style = String(setting("changeStyle", "percent") || "percent");
        return style === "dollars" ? style : "percent";
    }
    readonly property bool legacyShowOnBar: setting("showOnBar", true) !== false
    readonly property bool showTicker: setting("showTicker", legacyShowOnBar) !== false
    readonly property bool showPrice: setting("showPrice", legacyShowOnBar) !== false
    readonly property bool showChange: setting("showChange", legacyShowOnBar) !== false
    readonly property bool showLastUpdated: setting("showLastUpdated", false) === true
    readonly property bool liveStreaming: setting("liveStreaming", true) !== false
    readonly property bool showBarData: showTicker || showPrice || showChange
    readonly property bool showBarQuote: showPrice || showChange
    readonly property int changeStyleSettingsIndex: 3
    readonly property int refreshSettingsIndex: showChange ? 4 : 3
    readonly property int lastUpdatedSettingsIndex: showChange ? 5 : 4
    readonly property int barSectionSettingsIndex: showChange ? 6 : 5
    readonly property int liveStreamingSettingsIndex: barSectionSettingsIndex + 1
    readonly property int settingsLastIndex: liveStreamingSettingsIndex
    property bool isStreamLeader: false
    property bool streamReady: false
    property bool streamConnected: false
    property bool streamYahooConnected: false
    property bool streamCoinbaseConnected: false
    property bool streamHyperliquidConnected: false
    property int streamFailureCount: 0
    property string lastStreamSubKey: ""
    property int streamReqSeq: 0
    property var streamInFlightCharts: ({})
    property var streamFetchedAt: ({})
    property bool streamSparkInFlight: false
    readonly property bool hasArmedPriceAlerts: Model.armedAlertSymbols(root.symbolLevels).length > 0
    readonly property bool hasActiveWindows: (root.activeGridWindows && root.activeGridWindows.length > 0) || (root.activeSectorWindows && root.activeSectorWindows.length > 0)
    readonly property bool shouldStreamLive: root.liveStreaming && (root.opened || root.hasActiveWindows || root.hasArmedPriceAlerts)
    readonly property int backgroundRefreshMs: Model.backoffDelay(refreshSeconds * 1000, quoteFailureCount, 3600000)
    readonly property int liveRefreshMs: Model.backoffDelay(2000, quoteFailureCount, 60000)
    readonly property int chartRefreshMs: Model.backoffDelay(15000, chartFailureCount, 120000)
    readonly property int insightsRetryMs: Model.backoffDelay(5000, insightsFailureCount, 120000)
    readonly property int quotePageRetryMs: Model.backoffDelay(5000, quotePageFailureCount, 120000)
    readonly property bool searchRunning: searchProc.running
    readonly property string barSection: {
        var s = String(setting("barSection", "right") || "right");
        if (s === "left" || s === "center" || s === "right")
            return s;
        return "right";
    }
    readonly property string barSymbol: Model.barSymbol(pinned, watchlist, pinIndex)
    readonly property var quoteSymbols: Model.quoteSymbolsForView(watchlist, detailSymbol, view)
    readonly property var pinnedQuote: quotes[barSymbol] || null
    readonly property string label: Model.barLabel(barSymbol, pinnedQuote, false, showTicker, showPrice, showChange, changeStyle)
    readonly property string verticalLabel: Model.barLabel(barSymbol, pinnedQuote, true, showTicker, showPrice, showChange, changeStyle)
    readonly property string labelTone: Model.barLabelTone(pinnedQuote, showTicker, showPrice, showChange, changeStyle)
    readonly property string quoteStatusText: {
        var hasQuotes = Object.keys(quotes || {}).length > 0;
        if (quoteProc.running)
            return hasQuotes ? "" : "Loading quotes…";
        if (quoteError) {
            var suffix = showLastUpdated && quotesUpdatedAt > 0 ? " · Last updated " + timeLabel(quotesUpdatedAt) : "";
            return quoteError + suffix;
        }
        return showLastUpdated && quotesUpdatedAt > 0 ? "Updated " + timeLabel(quotesUpdatedAt) : "";
    }
    readonly property string chartStatusText: {
        var currentFetch = chartFetchSymbol === detailSymbol && chartFetchRange === detailRange;
        if (chartProc.running && currentFetch)
            return rangeChart ? "" : "Loading chart…";
        if (chartError)
            return chartError;
        return showLastUpdated && chartUpdatedAt > 0 && detailQuote ? "Last updated " + timeLabel(chartUpdatedAt) : "";
    }
    readonly property bool detailDataLoading: {
        var loadingInsights = insightsProc.running && insightsFetchSymbol === detailSymbol && !insightsLoaded;
        var loadingPage = quotePageProc.running && quotePageFetchSymbol === detailSymbol && !quotePageLoaded;
        return loadingInsights || loadingPage;
    }
    readonly property bool detailDataHasError: insightsError !== "" || quotePageError !== ""
    readonly property string detailDataStatusText: {
        var errors = [];
        if (insightsError)
            errors.push(insightsError);
        if (quotePageError)
            errors.push(quotePageError);
        return errors.join(" · ");
    }
    readonly property var detailRanges: Model.chartRanges()
    readonly property var activeQuote: quotes[detailSymbol] || detailQuote
    readonly property var rangeChart: {
        if (detailQuote && detailQuote.chartRange === detailRange)
            return detailQuote;
        return detailQuote || null;
    }
    readonly property var detailStats: Model.buildDetailStats(activeQuote, detailPage, detailInsights)
    readonly property var detailRangeChange: Model.rangeChangePercent(rangeChart, detailRange)
    readonly property var detailRangeChangeAmount: Model.rangeChangeAmount(rangeChart, detailRange)
    readonly property var sessionQuote: quotes[detailSymbol] || rangeChart || activeQuote
    readonly property var detailMainPrice: {
        if (detailRange === "1D" && sessionQuote && sessionQuote.regularPrice != null)
            return sessionQuote.regularPrice;
        return activeQuote ? activeQuote.price : null;
    }
    readonly property var detailMainChange: {
        if (detailRange === "1D" && sessionQuote && sessionQuote.regularChangePercent != null)
            return sessionQuote.regularChangePercent;
        return detailRangeChange;
    }
    readonly property var detailMainChangeAmount: {
        if (detailRange === "1D" && sessionQuote && sessionQuote.regularPrice != null && sessionQuote.previousClose != null)
            return sessionQuote.regularPrice - sessionQuote.previousClose;
        return detailRangeChangeAmount;
    }
    property var heldMainChange: null
    property var heldMainChangeAmount: null
    readonly property bool awaitingRangeChart: {
        if (view !== "detail" || !detailSymbol)
            return false;
        if (detailQuote && detailQuote.chartRange === detailRange)
            return false;
        return true;
    }
    readonly property var shownMainChange: {
        if (awaitingRangeChart)
            return heldMainChange;
        var n = Number(detailMainChange);
        if (detailMainChange != null && isFinite(n))
            return detailMainChange;
        return heldMainChange;
    }
    readonly property var shownMainChangeAmount: {
        if (awaitingRangeChart)
            return heldMainChangeAmount;
        var n = Number(detailMainChangeAmount);
        if (detailMainChangeAmount != null && isFinite(n))
            return detailMainChangeAmount;
        return heldMainChangeAmount;
    }
    readonly property bool showExtended: detailRange === "1D" && sessionQuote && sessionQuote.hasExtended === true
    readonly property var extendedChangeAmount: {
        if (!sessionQuote || sessionQuote.extendedPrice == null || sessionQuote.regularPrice == null)
            return null;
        return sessionQuote.extendedPrice - sessionQuote.regularPrice;
    }
    readonly property string priceCaption: Model.rangeCaption(detailRange, sessionQuote)
    readonly property bool detailIsFavorite: Model.isFavorite(watchlist, detailSymbol)
    readonly property var detailActionIds: {
        var actions = ["favorite", "pin", "grid"];
        if (detailIsFavorite)
            actions.push("remove");
        return actions;
    }
    readonly property int rowHeight: Style.space(56)

    onDetailMainChangeChanged: {
        if (awaitingRangeChart)
            return;
        var n = Number(detailMainChange);
        if (detailMainChange != null && isFinite(n))
            heldMainChange = detailMainChange;
    }

    onDetailMainChangeAmountChanged: {
        if (awaitingRangeChart)
            return;
        var n = Number(detailMainChangeAmount);
        if (detailMainChangeAmount != null && isFinite(n))
            heldMainChangeAmount = detailMainChangeAmount;
    }

    function open() {
        openedFromHotkey = false;
        setCenterHoverRevealSuppressed(false);
        root.view = "list";
        root.clearSearch();
        root.detailHistory = [];
        root.cursorActive = root.watchlist.length > 0;
        root.selectedIndex = 0;
        root.controller.show();
        scheduleOpenRefresh();
    }

    function openFromHotkey() {
        openedFromHotkey = true;
        root.view = "list";
        root.clearSearch();
        root.detailHistory = [];
        root.cursorActive = false;
        root.controller.show();
        root.startSearch("");
        scheduleOpenRefresh();
        Qt.callLater(function () {
            if (root.opened)
                setCenterHoverRevealSuppressed(true);
        });
    }

    function close() {
        setCenterHoverRevealSuppressed(false);
        openRefreshTimer.stop();
        root.clearSearch();
        root.detailHistory = [];
        root.view = "list";
        root.controller.hide();
    }

    function toggle() {
        if (root.opened)
            root.close();
        else
            root.open();
    }

    function switchPanel(direction) {
        if (root.bar && typeof root.bar.switchPanelFrom === "function")
            return root.bar.switchPanelFrom(root.barIdentity, direction);
        return false;
    }

    function setCenterHoverRevealSuppressed(value) {
        if (root.bar && typeof root.bar.setCenterHoverRevealSuppressed === "function")
            root.bar.setCenterHoverRevealSuppressed(value);
        else if (root.bar && "centerHoverRevealSuppressed" in root.bar) {
            try {
                root.bar.centerHoverRevealSuppressed = value;
            } catch (e) {}
        }
    }

    function toneColor(pct) {
        var tone = Model.changeTone(pct);
        if (tone === "up")
            return upColor;
        if (tone === "down")
            return downColor;
        return dim;
    }

    function timeframeColor(quote, tf) {
        var sym = (quote && quote.symbol) || detailSymbol;
        var q = (sym && quotes[sym] && quotes[sym].ftfc) ? quotes[sym] : (quote || (detailSymbol ? quotes[detailSymbol] : null));
        if (!q || !q.ftfc)
            return dim;
        var state = q.ftfc[tf];
        if (state === "up")
            return upColor;
        if (state === "down")
            return downColor;
        return dim;
    }

    function pillFill(pct) {
        var tone = Model.changeTone(pct);
        if (tone === "up")
            return upFill;
        if (tone === "down")
            return downFill;
        return Qt.rgba(contentForeground.r, contentForeground.g, contentForeground.b, 0.18);
    }

    function timeLabel(timestamp) {
        var date = new Date(Number(timestamp) || 0);
        var hours = date.getHours();
        var minutes = date.getMinutes();
        var seconds = date.getSeconds();
        function pad(value) {
            return value < 10 ? "0" + value : String(value);
        }
        return pad(hours) + ":" + pad(minutes) + ":" + pad(seconds);
    }

    function clampSelected() {
        if (watchlist.length === 0) {
            selectedIndex = 0;
            return;
        }
        if (selectedIndex < 0)
            selectedIndex = 0;
        if (selectedIndex >= watchlist.length)
            selectedIndex = watchlist.length - 1;
    }

    function persist() {
        stateFile.setText(Model.serializeState(watchlist, pinned, detailRange, gridMode, gridSync, gridSymbols, gridSplits, layouts, discordWebhook, gridTimeframes, gridZooms, {
            symbolLevels: root.symbolLevels,
            signalStates: root.signalStates,
            alertLog: root.alertLog,
            alertsMutedUntil: root.alertsMutedUntil
        }));
    }

    function persistSettings(values) {
        var entry = {
            id: root.moduleName
        };
        var existing;
        for (existing in root.settings)
            if (existing !== "id")
                entry[existing] = root.settings[existing];
        for (existing in values)
            entry[existing] = values[existing];
        root.settings = entry;
        if (root.hostWidget && "settings" in root.hostWidget)
            root.hostWidget.settings = entry;
        if (root.bar && root.bar.shell && typeof root.bar.shell.updateEntryInline === "function")
            root.bar.shell.updateEntryInline(root.moduleName, entry);
    }

    function setShowTicker(enabled) {
        persistSettings({
            showTicker: !!enabled
        });
    }

    function setShowPrice(enabled) {
        persistSettings({
            showPrice: !!enabled
        });
        if (enabled)
            scheduleBarRefresh();
    }

    function setShowChange(enabled) {
        persistSettings({
            showChange: !!enabled
        });
        if (enabled)
            scheduleBarRefresh();
    }

    function setShowLastUpdated(enabled) {
        persistSettings({
            showLastUpdated: !!enabled
        });
    }

    function setLiveStreaming(enabled) {
        persistSettings({
            liveStreaming: !!enabled
        });
        scheduleStreamSubSync();
    }

    function setRefreshSeconds(value) {
        var n = Math.max(15, Math.min(3600, parseInt(value, 10) || 60));
        persistSettings({
            refreshSeconds: n
        });
    }

    function setChangeStyle(style) {
        var next = String(style || "percent");
        if (next !== "percent" && next !== "dollars")
            return;
        persistSettings({
            changeStyle: next
        });
    }

    function setBarSection(section) {
        var next = String(section || "right");
        if (next !== "left" && next !== "center" && next !== "right")
            return;
        if (next === root.barSection)
            return;
        persistSettings({
            barSection: next
        });
        if (root.bar && root.bar.shell && typeof root.bar.shell.movePluginEntry === "function") {
            root.bar.shell.movePluginEntry(root.moduleName, next);
            return;
        }
        barMoveProc.command = ["omarchy", "bar", "move", root.moduleName, "--section", next];
        barMoveProc.running = true;
    }

    function openSettings() {
        root.clearSearch();
        root.settingsCursor = 0;
        root.view = "settings";
    }

    function openLayouts() {
        root.clearSearch();
        root.layoutActionStatus = "";
        root.view = "layouts";
    }

    function openAlerts() {
        root.clearSearch();
        root.view = "alerts";
        root.triggerWatchlistStratScan();
    }

    function quoteFor(sym) {
        return root.quotes[sym] || null;
    }

    function recordAlertEvent(entry) {
        if (!entry)
            return;
        root.alertLog = Model.appendAlertLog(root.alertLog, entry, 50);
        root.persist();
    }

    function clearAlertLog() {
        root.alertLog = [];
        root.persist();
    }

    // mode: "open" (until next market open), "1h", "indefinite"; anything else unmutes.
    function setAlertsMute(mode) {
        root.alertsMutedUntil = Model.alertsMuteUntilForMode(mode, new Date());
        root.muteClockMs = Date.now();
        root.persist();
    }

    function toggleAlertsMute() {
        root.setAlertsMute(Model.isAlertsMuted(root.alertsMutedUntil, new Date()) ? "" : "open");
    }

    // Single delivery gate for every alert (watchlist background engine and grid windows).
    // alert: { title, body, discordPayload, logEntry }
    // While muted, the event is still logged (tagged muted) but nothing is delivered.
    function dispatchAlert(alert) {
        if (!alert)
            return;
        var muted = Model.isAlertsMuted(root.alertsMutedUntil, new Date());
        if (alert.logEntry) {
            var entry = Object.assign({}, alert.logEntry);
            if (muted)
                entry.muted = true;
            root.recordAlertEvent(entry);
        }
        if (muted)
            return;
        Quickshell.execDetached(["notify-send", "-a", "Omafinance", "-u", "normal", String(alert.title || ""), String(alert.body || "")]);
        Quickshell.execDetached(["pw-play", root.alertSoundPath]);
        var webhook = root.discordWebhook;
        if (alert.discordPayload && webhook && webhook.indexOf("https://discord.com/api/webhooks/") === 0)
            Quickshell.execDetached(["curl", "-fsS", "-H", "Content-Type: application/json", "-X", "POST", "-d", alert.discordPayload, webhook]);
    }

    function syncActiveGridsAlertState() {
        if (!root.activeGridWindows)
            return;
        for (var i = 0; i < root.activeGridWindows.length; i++) {
            var w = root.activeGridWindows[i];
            if (w && w.visible) {
                w.symbolLevels = root.symbolLevels;
                w.signalStates = root.signalStates;
            }
        }
    }

    function createPriceAlert(sym, priceVal, condition, note) {
        var normSym = Model.normalizeSymbol(sym);
        if (!normSym || !isFinite(Number(priceVal)) || Number(priceVal) <= 0)
            return;
        var nextMap = Object.assign({}, root.symbolLevels || ({}));
        var curList = Array.isArray(nextMap[normSym]) ? nextMap[normSym].slice() : [];
        curList.push({
            price: Number(priceVal),
            sourceTf: "60",
            anchorTs: Math.floor(Date.now() / 1000) - 86400 * 5,
            ohlcField: "scale",
            text: String(note || "").trim(),
            tone: "fg",
            offsets: ({}),
            alertEnabled: true,
            alertCondition: condition || "CROSSES_ABOVE",
            alertTriggered: false
        });
        nextMap[normSym] = curList;
        root.symbolLevels = nextMap;
        root.syncActiveGridsAlertState();
        root.persist();
    }

    function rearmPriceAlert(sym, levelIndex) {
        if (!sym || !root.symbolLevels || !Array.isArray(root.symbolLevels[sym]))
            return;
        var list = root.symbolLevels[sym].slice();
        if (levelIndex < 0 || levelIndex >= list.length)
            return;
        var item = Object.assign({}, list[levelIndex]);
        item.alertEnabled = true;
        item.alertTriggered = false;
        list[levelIndex] = item;
        var nextMap = Object.assign({}, root.symbolLevels);
        nextMap[sym] = list;
        root.symbolLevels = nextMap;
        root.syncActiveGridsAlertState();
        root.persist();
    }

    function removePriceAlert(sym, levelIndex) {
        if (!sym || !root.symbolLevels || !Array.isArray(root.symbolLevels[sym]))
            return;
        var list = root.symbolLevels[sym].slice();
        if (levelIndex < 0 || levelIndex >= list.length)
            return;
        list.splice(levelIndex, 1);
        var nextMap = Object.assign({}, root.symbolLevels);
        nextMap[sym] = list;
        root.symbolLevels = nextMap;
        root.syncActiveGridsAlertState();
        root.persist();
    }

    function evaluateWatchlistPriceAlerts(incomingQuotes) {
        if (!incomingQuotes)
            return;
        var nextMem = Object.assign({}, root.symbolPriceMemory || ({}));
        var nextLevelsMap = Object.assign({}, root.symbolLevels || ({}));
        var memChanged = false;
        var levelsChanged = false;
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
                levelsChanged = true;
                for (var t = 0; t < res.triggered.length; t++) {
                    var ev = res.triggered[t];
                    root.dispatchAlert({
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
        if (levelsChanged) {
            root.symbolLevels = nextLevelsMap;
            root.syncActiveGridsAlertState();
            root.persist();
        }
    }

    function triggerWatchlistStratScan() {
        var list = root.watchlist || [];
        if (list.length === 0)
            return;
        var queue = [];
        for (var i = 0; i < list.length; i++) {
            var sym = list[i];
            if (!sym)
                continue;
            queue.push({
                symbol: sym,
                rangeKey: "60"
            });
            queue.push({
                symbol: sym,
                rangeKey: "1D"
            });
        }
        root.bgScanQueue = queue;
        if (!bgChartProc.running)
            root.processNextBgStratFetch();
    }

    function processNextBgStratFetch() {
        if (!root.bgScanQueue || root.bgScanQueue.length === 0)
            return;
        if (streamProc.running && root.streamReady) {
            var nowMs = Date.now();
            while (root.bgScanQueue.length > 0) {
                var item = root.bgScanQueue.shift();
                var k = Model.cacheKey(item.symbol, item.rangeKey);
                var lastTs = root.streamFetchedAt[k] || 0;
                if (lastTs > 0 && (nowMs - lastTs) < 55000 && root.chartCache && root.chartCache[k] && root.chartCache[k].length > 0) {
                    if (item.rangeKey === "1D")
                        root.evaluateBgSymbolStrat(item.symbol);
                    continue;
                }
                root.requestSharedChartFetch(item.symbol, item.rangeKey, true);
            }
            return;
        }
        var next = root.bgScanQueue.shift();
        root.bgFetchSymbol = next.symbol;
        root.bgFetchRange = next.rangeKey;
        bgChartProc.command = Model.chartCommand(next.symbol, next.rangeKey);
        bgChartProc.running = true;
    }

    function evaluateBgSymbolStrat(sym) {
        if (!sym)
            return;
        var hCandles = (root.chartCache && root.chartCache[Model.cacheKey(sym, "60")]) || root.bgCandleCache[sym + "_60"] || [];
        var dCandles = (root.chartCache && root.chartCache[Model.cacheKey(sym, "1D")]) || root.bgCandleCache[sym + "_1D"] || [];
        if (hCandles.length < 3 || dCandles.length < 3)
            return;
        var q = root.quotes[sym] || null;
        var chk = Model.evaluateStratChecklist(sym, hCandles, dCandles, q, new Date());
        if (!chk)
            return;

        // Update Watchlist Strat Radar list
        var currentRadar = (root.armedWatchlistSetups || []).filter(function (item) {
            return item && item.symbol !== sym;
        });
        if (chk.status === "TRADEABLE" || chk.status === "ARMED") {
            currentRadar.unshift({
                symbol: chk.symbol,
                direction: chk.direction,
                setupTimeframe: chk.setupTimeframe,
                status: chk.status,
                passedCount: chk.passedCount,
                totalCount: chk.totalCount,
                triggerPrice: chk.triggerPrice,
                stopPrice: chk.stopPrice,
                targetPrice: chk.targetPrice
            });
        }
        root.armedWatchlistSetups = currentRadar;

        var transition = Model.evaluateStratAlertTransition(chk, q, root.signalStates, root.symbolPriceMemory, {
            replayActive: false,
            nowDate: new Date(),
            enableArmedAlerts: true
        });
        root.symbolPriceMemory = transition.nextPriceMemory;
        if (transition.stateUpdated) {
            root.signalStates = transition.nextStates;
            root.syncActiveGridsAlertState();
            root.persist();
        }
        if (transition.shouldNotify && transition.eventType) {
            root.dispatchAlert({
                title: transition.title,
                body: transition.body,
                discordPayload: Model.discordAlertPayload(chk, transition.eventType),
                logEntry: transition.logEntry
            });
        }
    }

    function applyState(raw) {
        var state = Model.parseState(raw);
        var before = (watchlist || []).join("\n");
        var after = (state.watchlist || []).join("\n");
        watchlist = state.watchlist;
        pinned = state.pinned;
        if (state.detailRange)
            detailRange = state.detailRange;
        if (state.gridMode)
            gridMode = state.gridMode;
        if (state.gridSync)
            gridSync = state.gridSync;
        if (state.gridSymbols)
            gridSymbols = state.gridSymbols;
        if (state.gridTimeframes && state.gridTimeframes.length > 0)
            gridTimeframes = state.gridTimeframes;
        if (state.gridZooms && state.gridZooms.length > 0)
            gridZooms = state.gridZooms;
        if (state.gridSplits)
            gridSplits = state.gridSplits;
        if (state.layouts)
            layouts = state.layouts;
        else
            layouts = ({});
        if (state.discordWebhook !== undefined)
            discordWebhook = state.discordWebhook;
        if (state.symbolLevels)
            symbolLevels = state.symbolLevels;
        if (state.signalStates)
            signalStates = state.signalStates;
        if (state.alertLog)
            alertLog = state.alertLog;
        alertsMutedUntil = state.alertsMutedUntil !== undefined ? state.alertsMutedUntil : 0;
        muteClockMs = Date.now();
        root.syncActiveGridsAlertState();
        clampSelected();
        if (before !== after && (opened || showBarQuote))
            Qt.callLater(refresh);
    }

    function symbolsForQuoteRefresh() {
        var base = Array.isArray(quoteSymbols) ? quoteSymbols.slice() : [];
        var alerts = Model.armedAlertSymbols(root.symbolLevels);
        for (var i = 0; i < alerts.length; i++) {
            if (base.indexOf(alerts[i]) === -1)
                base.push(alerts[i]);
        }
        return base;
    }

    function refresh() {
        if (!root.isStreamLeader && HubRegistry.leader() && HubRegistry.leader() !== root) {
            HubRegistry.leader().refresh();
            return;
        }
        var targets = symbolsForQuoteRefresh();
        if (targets.length === 0) {
            quoteRefreshPending = false;
            return;
        }
        if (quoteProc.running) {
            quoteRefreshPending = true;
            return;
        }
        quoteRefreshPending = false;
        var needsFullSpark = false;
        var curHour = Math.floor(Date.now() / 3600000);
        for (var i = 0; i < targets.length; i++) {
            var q = root.quotes[targets[i]];
            if (!q || !q.ftfcAnchors || q.ftfcAnchors.hourBucket !== curHour) {
                needsFullSpark = true;
                break;
            }
        }
        var sameAsView = targets.length === quoteSymbols.length;
        if (streamProc.running && root.streamReady) {
            root.requestSharedSparkFetch(targets, !needsFullSpark);
            return;
        }
        var url = needsFullSpark ? (sameAsView ? Model.sparkUrl(quoteSymbols) : Model.sparkUrl(targets)) : Model.sparkQuoteUrl(targets);
        quoteProc.command = ["curl", "-fsS", "--compressed", "--max-time", "8", "-A", "Mozilla/5.0", url];
        quoteProc.running = true;
    }

    function scheduleOpenRefresh() {
        openRefreshTimer.restart();
    }

    function scheduleBarRefresh() {
        Qt.callLater(function () {
            if (root.showBarQuote && !quoteProc.running)
                root.refresh();
        });
    }

    function addSymbol(symbol) {
        var next = Model.addSymbol(watchlist, symbol);
        if (next.length === watchlist.length) {
            var already = Model.normalizeSymbol(symbol);
            if (already) {
                selectedIndex = next.indexOf(already);
                cursorActive = true;
            }
            return;
        }
        watchlist = next;
        selectedIndex = next.length - 1;
        cursorActive = true;
        persist();
        refresh();
    }

    function removeSymbol(symbol) {
        var next = Model.removeSymbol(watchlist, symbol);
        watchlist = next;
        pinned = Model.parsePinned(pinned, next);
        clampSelected();
        persist();
    }

    function pinSymbol(symbol) {
        var next = Model.normalizeSymbol(symbol);
        if (!next)
            return;
        var list = Model.addSymbol(watchlist, next);
        watchlist = list;
        pinned = Model.togglePinned(pinned, list, next);
        persist();
        refresh();
    }

    function toggleFavorite(symbol) {
        var next = Model.normalizeSymbol(symbol);
        if (!next)
            return;
        if (Model.isFavorite(watchlist, next))
            removeSymbol(next);
        else
            addSymbol(next);
    }

    function prepareDetail(symbol) {
        var next = Model.normalizeSymbol(symbol);
        if (!next)
            return false;
        if (detailSymbol === next)
            return true;
        detailSymbol = next;
        heldMainChange = null;
        detailQuote = null;
        chartFailureCount = 0;
        chartError = "";
        chartUpdatedAt = 0;
        insightsFailureCount = 0;
        insightsError = "";
        insightsLoaded = false;
        quotePageFailureCount = 0;
        quotePageError = "";
        quotePageLoaded = false;
        holdingsFailureCount = 0;
        holdingsError = "";
        holdingsLoaded = false;
        detailPage = ({});
        detailInsights = ({});
        detailHoldings = null;
        detailHoldingsStratMap = ({});
        restoreDetailCache(next);
        fetchDetail();
        return true;
    }

    function detailCacheKey(symbol) {
        return Model.normalizeSymbol(symbol);
    }

    function cacheDetailData(symbol, field, value) {
        var key = detailCacheKey(symbol);
        if (!key)
            return;
        var existing = detailCache[key] || {};
        var entry = {
            page: existing.page || ({}),
            pageStoredAt: existing.pageStoredAt || 0,
            insights: existing.insights || ({}),
            insightsStoredAt: existing.insightsStoredAt || 0,
            holdings: existing.holdings || null,
            holdingsStoredAt: existing.holdingsStoredAt || 0,
            holdingsStrat: existing.holdingsStrat || ({}),
            holdingsStratStoredAt: existing.holdingsStratStoredAt || 0
        };
        entry[field] = value;
        entry[field + "StoredAt"] = Date.now();

        var nextCache = {};
        var nextOrder = [];
        for (var i = 0; i < detailCacheOrder.length; i++) {
            var existingKey = detailCacheOrder[i];
            if (existingKey !== key && detailCache[existingKey]) {
                nextCache[existingKey] = detailCache[existingKey];
                nextOrder.push(existingKey);
            }
        }
        nextCache[key] = entry;
        nextOrder.push(key);
        while (nextOrder.length > detailCacheLimit)
            delete nextCache[nextOrder.shift()];
        detailCache = nextCache;
        detailCacheOrder = nextOrder;
    }

    function restoreDetailCache(symbol) {
        var entry = detailCache[detailCacheKey(symbol)];
        if (!entry)
            return;
        var now = Date.now();
        if (entry.insightsStoredAt > 0 && now - entry.insightsStoredAt <= detailCacheTtlMs) {
            detailInsights = entry.insights;
            insightsLoaded = true;
        }
        if (entry.pageStoredAt > 0 && now - entry.pageStoredAt <= detailCacheTtlMs) {
            detailPage = entry.page;
            quotePageLoaded = true;
        }
        if (entry.holdingsStoredAt > 0 && now - entry.holdingsStoredAt <= detailCacheTtlMs && entry.holdings) {
            detailHoldings = entry.holdings;
            holdingsLoaded = true;
        }
        if (entry.holdingsStratStoredAt > 0 && now - entry.holdingsStratStoredAt <= detailCacheTtlMs && entry.holdingsStrat) {
            detailHoldingsStratMap = entry.holdingsStrat;
        }
    }

    function prefetchDetail(symbol) {
        if (!prepareDetail(symbol))
            return;
        detailEnrichmentTimer.stop();
        fetchInsights();
        fetchQuotePage();
        fetchHoldings();
    }

    function openDetail(symbol) {
        if (!prepareDetail(symbol))
            return;
        view = "detail";
        searching = false;
        detailSection = 0;
        detailActionIndex = 0;
    }

    function openDetailWithHistory(symbol) {
        var prev = (view === "detail" && detailSymbol) ? detailSymbol : "";
        var next = Model.normalizeSymbol(symbol);
        if (prev && next && prev !== next) {
            var nextHistory = root.detailHistory.slice();
            nextHistory.push(prev);
            root.detailHistory = nextHistory;
        }
        openDetail(symbol);
    }

    function closeDetail() {
        if (root.detailHistory && root.detailHistory.length > 0) {
            var nextHistory = root.detailHistory.slice();
            var prevSymbol = nextHistory.pop();
            root.detailHistory = nextHistory;
            openDetail(prevSymbol, false);
            return;
        }
        root.detailHistory = [];
        view = "list";
        detailSymbol = "";
        detailQuote = null;
        detailHoldings = null;
        Qt.callLater(function () {
            if (keyCatcher)
                keyCatcher.forceActiveFocus();
        });
    }

    function fetchHoldings() {
        if (!detailSymbol || Model.isCryptoSymbol(detailSymbol)) {
            detailHoldings = null;
            detailHoldingsStratMap = ({});
            holdingsLoaded = false;
            return;
        }
        var entry = detailCache[detailCacheKey(detailSymbol)];
        var now = Date.now();
        if (entry && entry.holdingsStoredAt > 0 && now - entry.holdingsStoredAt <= detailCacheTtlMs && entry.holdings) {
            detailHoldings = entry.holdings;
            holdingsLoaded = true;
            fetchHoldingsStrat(detailSymbol);
            return;
        }
        if (holdingsProc.running)
            return;
        holdingsFetchSymbol = detailSymbol;
        holdingsError = "";
        var home = Quickshell.env("HOME");
        var scriptPath = home + "/.config/omarchy/plugins/mohamedmansour.finance/scripts/fetch-etf-holdings.js";
        holdingsProc.command = Model.nodeCommand(scriptPath, [detailSymbol]);
        holdingsProc.running = true;
    }

    function fetchHoldingsStrat(symbol) {
        var target = symbol || detailSymbol;
        if (!target || Model.isCryptoSymbol(target)) {
            detailHoldingsStratMap = ({});
            detailHoldingsStratLoading = false;
            return;
        }
        if (!root.detailHoldings || !root.detailHoldings.holdings || root.detailHoldings.holdings.length === 0) {
            detailHoldingsStratMap = ({});
            detailHoldingsStratLoading = false;
            return;
        }
        var entry = detailCache[detailCacheKey(target)];
        var now = Date.now();
        if (entry && entry.holdingsStratStoredAt > 0 && now - entry.holdingsStratStoredAt <= detailCacheTtlMs && entry.holdingsStrat && Object.keys(entry.holdingsStrat).length > 0) {
            detailHoldingsStratMap = entry.holdingsStrat;
            detailHoldingsStratLoading = false;
            return;
        }
        if (holdingsStratProc.running)
            return;
        root.holdingsStratFetchSymbol = target;
        root.detailHoldingsStratLoading = true;
        var home = Quickshell.env("HOME");
        var scriptPath = home + "/.config/omarchy/plugins/mohamedmansour.finance/scripts/fetch-holdings-strat.js";
        holdingsStratProc.command = Model.nodeCommand(scriptPath, [target]);
        holdingsStratProc.running = true;
    }

    function setDetailRange(range) {
        var next = Model.normalizeRange(range);
        if (detailRange === next)
            return;
        detailRange = next;
        persist();
        if (!detailSymbol)
            return;
        chartFailureCount = 0;
        chartError = "";
        chartUpdatedAt = 0;
        startChartFetch();
    }

    property bool chartRetryingYahoo: false

    function startChartFetch() {
        if (!detailSymbol)
            return;
        var cachedKey = Model.cacheKey(detailSymbol, detailRange);
        if (!detailQuote && root.chartCache && root.chartCache[cachedKey] && root.chartCache[cachedKey].length > 0) {
            var cachedCandles = Model.toArray(root.chartCache[cachedKey]);
            var existingQ = root.quotes[detailSymbol] || null;
            var seedQuote = existingQ ? Object.assign({}, existingQ) : { symbol: detailSymbol };
            seedQuote.chartRange = detailRange;
            seedQuote.candles = cachedCandles;
            var seedCloses = [];
            for (var ci = 0; ci < cachedCandles.length; ci++)
                seedCloses.push(cachedCandles[ci].close);
            seedQuote.closes = seedCloses;
            root.detailQuote = seedQuote;
        }
        if (chartProc.running)
            return;
        chartFetchSymbol = detailSymbol;
        chartFetchRange = detailRange;
        chartRetryingYahoo = false;
        chartError = "";
        if (root.streamReady && root.requestSharedChartFetch(chartFetchSymbol, chartFetchRange, true))
            return;
        chartProc.command = Model.chartCommand(chartFetchSymbol, chartFetchRange);
        chartProc.running = true;
    }

    function fetchDetail() {
        if (!detailSymbol)
            return;
        startChartFetch();
        detailEnrichmentTimer.restart();
    }

    function fetchInsights() {
        if (!detailSymbol)
            return;
        if (insightsLoaded)
            return;
        if (insightsProc.running)
            return;
        insightsFetchSymbol = detailSymbol;
        insightsError = "";
        insightsProc.command = ["curl", "-fsS", "--compressed", "--max-time", "8", "-A", "Mozilla/5.0", Model.insightsUrl(insightsFetchSymbol)];
        insightsProc.running = true;
    }

    function fetchQuotePage() {
        if (!detailSymbol)
            return;
        if (quotePageLoaded)
            return;
        if (quotePageProc.running)
            return;
        quotePageFetchSymbol = detailSymbol;
        quotePageError = "";
        quotePageProc.command = ["curl", "-fsS", "--compressed", "--max-time", "12", "-A", "Mozilla/5.0", Model.quotePageUrl(quotePageFetchSymbol)];
        quotePageProc.running = true;
    }

    function clearSearch() {
        listChrome = "rows";
        searching = false;
        searchQuery = "";
        suggestions = [];
        suggestionIndex = 0;
        searchDebounce.stop();
        if (listView.field.text !== "")
            listView.field.text = "";
        Qt.callLater(function () {
            if (root.opened && keyCatcher)
                keyCatcher.forceActiveFocus();
        });
    }

    function startSearch(prefix) {
        listChrome = "search";
        searching = true;
        if (prefix) {
            listView.field.text = prefix;
            listView.field.cursorPosition = listView.field.text.length;
        }
        Qt.callLater(function () {
            listView.field.forceActiveFocus();
            if (!prefix)
                listView.field.selectAll();
        });
    }

    function focusSearchChrome() {
        listChrome = "search";
        searching = true;
        Qt.callLater(function () {
            listView.field.forceActiveFocus();
            listView.field.cursorPosition = String(listView.field.text).length;
        });
    }

    function focusGearChrome() {
        listChrome = "gear";
        Qt.callLater(function () {
            if (keyCatcher)
                keyCatcher.forceActiveFocus();
        });
    }

    function focusRowsChrome() {
        listChrome = "rows";
        cursorActive = (searching && suggestions.length > 0) || watchlist.length > 0;
        Qt.callLater(function () {
            if (keyCatcher)
                keyCatcher.forceActiveFocus();
        });
    }

    function requestSearch() {
        var query = listView.field.text.replace(/^\s+|\s+$/g, "");
        searchQuery = query;
        if (query.length < 1) {
            suggestions = [];
            searchPendingQuery = "";
            searchError = "";
            return;
        }
        var cached = cachedSearchResults(query);
        if (cached !== null) {
            suggestions = cached;
            suggestionIndex = 0;
            searchPendingQuery = "";
            searchError = "";
            return;
        }
        searchError = "";
        searchPendingQuery = query;
        if (!searchProc.running)
            startSearchFetch();
    }

    function searchCacheKey(query) {
        return String(query || "").replace(/^\s+|\s+$/g, "").toUpperCase();
    }

    function cachedSearchResults(query) {
        var key = searchCacheKey(query);
        var entry = searchCache[key];
        if (!entry || Date.now() - entry.storedAt > searchCacheTtlMs)
            return null;
        return entry.results;
    }

    function cacheSearchResults(query, results) {
        var key = searchCacheKey(query);
        if (!key)
            return;
        var nextCache = {};
        var nextOrder = [];
        for (var i = 0; i < searchCacheOrder.length; i++) {
            var existingKey = searchCacheOrder[i];
            if (existingKey !== key && searchCache[existingKey]) {
                nextCache[existingKey] = searchCache[existingKey];
                nextOrder.push(existingKey);
            }
        }
        nextCache[key] = {
            storedAt: Date.now(),
            results: results
        };
        nextOrder.push(key);
        while (nextOrder.length > searchCacheLimit)
            delete nextCache[nextOrder.shift()];
        searchCache = nextCache;
        searchCacheOrder = nextOrder;
    }

    function startSearchFetch() {
        if (!searching || !searchPendingQuery)
            return;
        searchActiveQuery = searchPendingQuery;
        searchProc.command = ["curl", "-fsS", "--compressed", "--max-time", "5", "-A", "Mozilla/5.0", Model.searchUrl(searchActiveQuery)];
        searchProc.running = true;
    }

    function commitSearch() {
        if (suggestions.length > 0) {
            var pick = suggestions[Math.max(0, Math.min(suggestionIndex, suggestions.length - 1))];
            if (pick)
                openDetail(pick.symbol);
            return;
        }
        var typed = Model.normalizeSymbol(searchQuery || listView.field.text);
        if (typed)
            openDetail(typed);
    }

    function scheduleSearch() {
        searchDebounce.restart();
    }

    function moveCursor(dy) {
        cursorActive = true;
        if (searching && suggestions.length > 0) {
            var next = suggestionIndex + dy;
            if (next < 0) {
                focusSearchChrome();
                return;
            }
            if (next >= suggestions.length)
                next = suggestions.length - 1;
            suggestionIndex = next;
            return;
        }
        if (watchlist.length === 0) {
            if (dy < 0)
                focusSearchChrome();
            return;
        }
        var nextRow = selectedIndex + dy;
        if (nextRow < 0) {
            focusSearchChrome();
            return;
        }
        if (nextRow >= watchlist.length)
            nextRow = watchlist.length - 1;
        selectedIndex = nextRow;
    }

    function activateCursor() {
        if (view === "settings") {
            if (settingsCursor === 0)
                setShowTicker(!showTicker);
            else if (settingsCursor === 1)
                setShowPrice(!showPrice);
            else if (settingsCursor === 2)
                setShowChange(!showChange);
            else if (settingsCursor === lastUpdatedSettingsIndex)
                setShowLastUpdated(!showLastUpdated);
            else if (settingsCursor === liveStreamingSettingsIndex)
                setLiveStreaming(!liveStreaming);
            return;
        }
        if (view === "detail") {
            if (detailSection !== 0)
                return;
            var action = detailActionIds[detailActionIndex];
            if (action === "favorite")
                toggleFavorite(detailSymbol);
            else if (action === "pin")
                pinSymbol(detailSymbol);
            else if (action === "grid")
                openGrid(detailSymbol);
            else if (action === "remove") {
                removeSymbol(detailSymbol);
                closeDetail();
            }
            return;
        }
        if (listChrome === "gear") {
            openSettings();
            return;
        }
        if (listChrome === "search") {
            commitSearch();
            return;
        }
        if (searching && searchQuery.length > 0 && suggestions.length > 0) {
            var pick = suggestions[Math.max(0, Math.min(suggestionIndex, suggestions.length - 1))];
            if (pick)
                openDetail(pick.symbol);
            return;
        }
        if (watchlist.length === 0)
            return;
        openDetail(watchlist[selectedIndex]);
    }

    function moveFocus(dx, dy) {
        if (view === "settings") {
            if (dy !== 0)
                settingsCursor = Math.max(0, Math.min(settingsLastIndex, settingsCursor + dy));
            if (dx !== 0) {
                if (settingsCursor === 0)
                    setShowTicker(dx > 0);
                else if (settingsCursor === 1)
                    setShowPrice(dx > 0);
                else if (settingsCursor === 2)
                    setShowChange(dx > 0);
                else if (showChange && settingsCursor === changeStyleSettingsIndex)
                    setChangeStyle(dx > 0 ? "dollars" : "percent");
                else if (settingsCursor === refreshSettingsIndex)
                    setRefreshSeconds(refreshSeconds + dx * 15);
                else if (settingsCursor === lastUpdatedSettingsIndex)
                    setShowLastUpdated(dx > 0);
                else if (settingsCursor === barSectionSettingsIndex) {
                    var sections = ["left", "center", "right"];
                    var i = sections.indexOf(barSection);
                    if (i < 0)
                        i = 2;
                    i = Math.max(0, Math.min(2, i + dx));
                    setBarSection(sections[i]);
                } else if (settingsCursor === liveStreamingSettingsIndex) {
                    setLiveStreaming(dx > 0);
                }
            }
            return;
        }
        if (view === "detail") {
            if (dy !== 0) {
                detailSection = Math.max(0, Math.min(1, detailSection + dy));
                return;
            }
            if (dx === 0)
                return;
            if (detailSection === 0) {
                var n = detailActionIds.length;
                if (n > 0)
                    detailActionIndex = (detailActionIndex + dx + n) % n;
                return;
            }
            var ranges = detailRanges;
            var idx = ranges.indexOf(detailRange);
            if (idx < 0)
                idx = 0;
            idx = (idx + dx + ranges.length) % ranges.length;
            setDetailRange(ranges[idx]);
            return;
        }
        if (listChrome === "gear") {
            if (dx < 0)
                focusSearchChrome();
            else if (dy > 0)
                focusRowsChrome();
            return;
        }
        if (dx !== 0)
            return;
        if (dy !== 0)
            moveCursor(dy);
    }

    FileView {
        id: stateFile
        path: Quickshell.env("HOME") + "/.local/state/omarchy/settings/finance.json"
        watchChanges: true
        atomicWrites: true
        printErrors: false
        onLoaded: root.applyState(text())
        onLoadFailed: {
            root.applyState("");
            if (mkdirProc.running)
                root.seedOnReady = true;
            else
                root.persist();
        }
        onFileChanged: reload()
    }

    property bool seedOnReady: false

    Process {
        id: mkdirProc
        command: ["mkdir", "-p", Quickshell.env("HOME") + "/.local/state/omarchy/settings"]
        onExited: {
            if (root.seedOnReady) {
                root.seedOnReady = false;
                root.persist();
            }
        }
    }

    property bool useFallbackDiskCache: false

    FileView {
        id: candleCacheFile
        path: root.useFallbackDiskCache ? (Quickshell.env("HOME") + "/.cache/omafinance/candles.json") : ""
        watchChanges: false
        atomicWrites: true
        printErrors: false
        onLoaded: {
            try {
                var raw = text();
                if (raw && raw.length > 2) {
                    var parsed = JSON.parse(raw);
                    if (parsed && typeof parsed === "object") {
                        var src = (parsed.version === 2 && parsed.entries && typeof parsed.entries === "object") ? parsed.entries : parsed;
                        var unpackedMap = ({});
                        var keys = Object.keys(src);
                        for (var i = 0; i < keys.length; i++) {
                            var k = keys[i];
                            var arr = Model.unpackCandles(src[k]);
                            if (arr && arr.length > 0)
                                unpackedMap[k] = arr;
                        }
                        root.chartCache = Object.assign({}, unpackedMap, root.chartCache);
                        root.candleCacheUpdated("");
                    }
                }
            } catch (e) {}
        }
    }

    function collectProtectedCacheKeys() {
        var prot = ({});
        var tfs = ["30", "60", "1D", "1W", "1M"];
        var panels = HubRegistry.allPanels();
        if (panels.length === 0)
            panels = [root];
        for (var pi = 0; pi < panels.length; pi++) {
            var p = panels[pi];
            if (!p)
                continue;
            var wl = p.watchlist || [];
            for (var i = 0; i < wl.length; i++) {
                for (var ti = 0; ti < tfs.length; ti++) {
                    prot[Model.cacheKey(wl[i], tfs[ti])] = true;
                }
            }
            var gWins = p.activeGridWindows || [];
            for (var gi = 0; gi < gWins.length; gi++) {
                var gw = gWins[gi];
                if (!gw || !gw.visible)
                    continue;
                var syms = gw.cellSymbols || [];
                var gtfs = gw.cellTimeframes || [];
                for (var ci = 0; ci < syms.length; ci++) {
                    var cs = syms[ci];
                    if (!cs)
                        continue;
                    if (gtfs[ci])
                        prot[Model.cacheKey(cs, gtfs[ci])] = true;
                    prot[Model.cacheKey(cs, "60")] = true;
                    prot[Model.cacheKey(cs, "1D")] = true;
                }
            }
            var sWins = p.activeSectorWindows || [];
            for (var si = 0; si < sWins.length; si++) {
                var sw = sWins[si];
                if (!sw || !sw.visible || typeof sw.getAllSymbols !== "function")
                    continue;
                var sSyms = sw.getAllSymbols() || [];
                for (var sj = 0; sj < sSyms.length; sj++) {
                    var ss = sSyms[sj];
                    if (!ss)
                        continue;
                    prot[Model.cacheKey(ss, sw.timeframe)] = true;
                    prot[Model.cacheKey(ss, "1D")] = true;
                    prot[Model.cacheKey(ss, "60")] = true;
                }
            }
        }
        return prot;
    }

    function pruneInMemoryChartCache(maxKeys) {
        var cap = (isFinite(maxKeys) && maxKeys > 0) ? maxKeys : 300;
        if (!root.chartCache || Object.keys(root.chartCache).length <= cap)
            return;
        var prot = root.collectProtectedCacheKeys();
        var pruned = Model.pruneChartCache(root.chartCache, cap, root.chartCacheAccess, prot);
        root.chartCache = pruned;
        var nextAccess = ({});
        var keptKeys = Object.keys(pruned);
        for (var i = 0; i < keptKeys.length; i++) {
            var k = keptKeys[i];
            if (root.chartCacheAccess && root.chartCacheAccess[k])
                nextAccess[k] = root.chartCacheAccess[k];
        }
        root.chartCacheAccess = nextAccess;
        root.candleCacheUpdated("");
        HubRegistry.broadcastCandleKey(root, root.chartCache, "");
    }

    function flushCandleCache() {
        if (!root.isStreamLeader && HubRegistry.leader() && HubRegistry.leader() !== root) {
            HubRegistry.leader().flushCandleCache();
            return;
        }
        var prot = root.collectProtectedCacheKeys();
        root.pruneInMemoryChartCache(300);
        if (!root.candleCacheDirty)
            return;
        root.candleCacheDirty = false;
        if (streamProc.running && root.streamReady) {
            root.sendStreamCommand({
                op: "cacheFlush",
                protectedKeys: prot
            });
            return;
        }
        try {
            root.useFallbackDiskCache = true;
            var diskCache = Model.pruneChartCache(root.chartCache, 600, root.chartCacheAccess, prot);
            var packed = ({});
            var keys = Object.keys(diskCache);
            for (var i = 0; i < keys.length; i++)
                packed[keys[i]] = Model.packCandles(diskCache[keys[i]]);
            candleCacheFile.setText(JSON.stringify({
                version: 2,
                entries: packed
            }));
        } catch (e) {}
    }

    Timer {
        id: candleCacheSaveTimer
        interval: 30000
        repeat: false
        onTriggered: root.flushCandleCache()
    }

    function applyLiveQuotesToDetailAndCache(changedSymbols) {
        if (!Array.isArray(changedSymbols) || changedSymbols.length === 0)
            return;
        var nowDate = new Date();
        var tfs = ["1", "5", "15", "30", "60", "1D", "1W", "1M", "1Y"];
        for (var i = 0; i < changedSymbols.length; i++) {
            var sym = changedSymbols[i];
            var q = sym ? root.quotes[sym] : null;
            if (!q)
                continue;
            if (root.chartCache) {
                var changedKeys = Model.updateCachedDevelopingCandles(root.chartCache, sym, q, tfs, nowDate);
                if (changedKeys.length > 0) {
                    for (var ci = 0; ci < changedKeys.length; ci++)
                        root.chartCacheAccess[changedKeys[ci]] = nowDate.getTime();
                }
            }
            if (root.view === "detail" && root.detailSymbol === sym && root.detailQuote && root.detailQuote.candles && root.detailQuote.candles.length > 0) {
                var updatedDetailCandles = Model.updateDevelopingCandle(root.detailQuote.candles, q, root.detailRange, nowDate);
                if (updatedDetailCandles !== root.detailQuote.candles) {
                    var nextDetail = Object.assign({}, root.detailQuote, {
                        candles: updatedDetailCandles,
                        price: q.price !== undefined ? q.price : root.detailQuote.price,
                        regularPrice: q.regularPrice !== undefined ? q.regularPrice : root.detailQuote.regularPrice,
                        extendedPrice: q.extendedPrice !== undefined ? q.extendedPrice : root.detailQuote.extendedPrice,
                        hasExtended: q.hasExtended !== undefined ? q.hasExtended : root.detailQuote.hasExtended,
                        session: q.session || root.detailQuote.session,
                        ftfc: q.ftfc || root.detailQuote.ftfc
                    });
                    root.detailQuote = nextDetail;
                }
            }
        }
    }

    function updateSharedCandles(key, candles, quoteEnriched, skipDaemonPut) {
        if (!key || !candles)
            return;
        if (!root.chartCache)
            root.chartCache = ({});
        root.chartCache[key] = Model.toArray(candles);
        root.chartCacheAccess[key] = Date.now();
        if (!skipDaemonPut)
            root.streamFetchedAt[key] = Date.now();
        root.candleCacheUpdated(key);
        HubRegistry.broadcastCandleKey(root, root.chartCache, key);
        if (quoteEnriched && quoteEnriched.symbol) {
            var existing = root.quotes[quoteEnriched.symbol] || null;
            var enriched = Model.mergeChartQuote(existing, quoteEnriched);
            if (root.opened || root.showBarQuote) {
                var nextQuotes = Object.assign({}, root.quotes);
                nextQuotes[quoteEnriched.symbol] = enriched;
                root.quotes = nextQuotes;
            } else {
                root.quotes[quoteEnriched.symbol] = enriched;
            }
            root.quotesUpdated([quoteEnriched.symbol]);
        }
        if (!skipDaemonPut && root.streamReady) {
            root.sendStreamCommand({
                op: "cachePut",
                key: key,
                candles: root.chartCache[key]
            });
        }
        root.candleCacheDirty = true;
        if (Object.keys(root.chartCache).length > 360)
            root.pruneInMemoryChartCache(300);
        if (!candleCacheSaveTimer.running)
            candleCacheSaveTimer.start();
    }

    function sendStreamCommand(cmd) {
        if (!cmd)
            return false;
        if (!root.isStreamLeader && HubRegistry.leader() && HubRegistry.leader() !== root)
            return HubRegistry.leader().sendStreamCommand(cmd);
        if (!streamProc.running)
            return false;
        try {
            streamProc.write(JSON.stringify(cmd) + "\n");
            return true;
        } catch (e) {
            return false;
        }
    }

    function collectStreamSymbols() {
        var panels = HubRegistry.allPanels();
        if (panels.length === 0)
            panels = [root];
        var anyWantsStream = false;
        for (var pi = 0; pi < panels.length; pi++) {
            if (panels[pi] && panels[pi].shouldStreamLive) {
                anyWantsStream = true;
                break;
            }
        }
        if (!anyWantsStream)
            return [];
        var out = [];
        var seen = ({});
        function addSym(s) {
            var norm = Model.normalizeSymbol(s);
            if (norm && !seen[norm]) {
                seen[norm] = true;
                out.push(norm);
            }
        }
        for (var pIdx = 0; pIdx < panels.length; pIdx++) {
            var p = panels[pIdx];
            if (!p)
                continue;
            var i;
            if (p.showBarQuote) {
                var pins = p.pinned || [];
                for (i = 0; i < pins.length; i++)
                    addSym(pins[i]);
            }
            if (p.opened) {
                var wl = p.watchlist || [];
                for (i = 0; i < wl.length; i++)
                    addSym(wl[i]);
                if (p.detailSymbol)
                    addSym(p.detailSymbol);
            }
            var alerts = Model.armedAlertSymbols(p.symbolLevels);
            for (i = 0; i < alerts.length; i++)
                addSym(alerts[i]);

            var gWins = p.activeGridWindows || [];
            for (i = 0; i < gWins.length; i++) {
                var gw = gWins[i];
                if (!gw || !gw.visible || typeof gw.activeSymbols !== "function")
                    continue;
                var gSyms = gw.activeSymbols() || [];
                for (var gi = 0; gi < gSyms.length; gi++)
                    addSym(gSyms[gi]);
            }

            var sWins = p.activeSectorWindows || [];
            for (i = 0; i < sWins.length; i++) {
                var sw = sWins[i];
                if (!sw || !sw.visible)
                    continue;
                var sSyms = (typeof sw.getSubscribedSymbols === "function") ? sw.getSubscribedSymbols() : (typeof sw.getAllSymbols === "function" ? sw.getAllSymbols() : []);
                var cap = Math.min((sSyms || []).length, 60);
                for (var si = 0; si < cap; si++)
                    addSym(sSyms[si]);
            }
        }
        return out;
    }

    function hydrateMissingQuoteMetadata(symbols, force) {
        if (!streamProc.running || !root.streamReady)
            return;
        var list = Array.isArray(symbols) && symbols.length > 0 ? symbols : root.collectStreamSymbols();
        if (list.length === 0)
            return;
        var needFull = [];
        var needLight = [];
        var curHour = Math.floor(Date.now() / 3600000);
        var forceRefresh = force === true;
        for (var i = 0; i < list.length; i++) {
            var s = list[i];
            var q = root.quotes[s];
            if (forceRefresh || !q || q.previousClose === undefined || q.previousClose === null) {
                needFull.push(s);
            } else if (!q.ftfcAnchors || q.ftfcAnchors.hourBucket !== curHour) {
                needFull.push(s);
            }
        }
        var chunks = Model.chunkSymbols(needFull, 20);
        for (var c = 0; c < chunks.length; c++)
            root.requestSharedSparkFetch(chunks[c], false);
        if (needLight.length > 0) {
            var lChunks = Model.chunkSymbols(needLight, 20);
            for (var lc = 0; lc < lChunks.length; lc++)
                root.requestSharedSparkFetch(lChunks[lc], true);
        }
    }

    function handleSessionBoundary(sessionState) {
        root.sessionBoundaryCrossed(sessionState);
        if (root.opened && root.view === "detail" && root.detailSymbol) {
            root.startChartFetch();
        }
    }

    function syncStreamSubscriptions() {
        if (!streamProc.running || !root.streamReady)
            return;
        var syms = root.collectStreamSymbols();
        var subKey = syms.slice().sort().join(",");
        if (subKey === root.lastStreamSubKey)
            return;
        root.lastStreamSubKey = subKey;
        root.sendStreamCommand({
            op: "subscribe",
            symbols: syms
        });
        if (syms.length > 0)
            root.hydrateMissingQuoteMetadata(syms);
    }

    function scheduleStreamSubSync() {
        if (!root.isStreamLeader && HubRegistry.leader() && HubRegistry.leader() !== root) {
            HubRegistry.leader().scheduleStreamSubSync();
            return;
        }
        streamSubSyncTimer.restart();
    }

    function requestSharedSparkFetch(symbols, lightweight) {
        if (!root.isStreamLeader && HubRegistry.leader() && HubRegistry.leader() !== root)
            return HubRegistry.leader().requestSharedSparkFetch(symbols, lightweight);
        if (!Array.isArray(symbols) || symbols.length === 0)
            return false;
        if (!streamProc.running || !root.streamReady)
            return false;
        root.streamReqSeq = root.streamReqSeq + 1;
        return root.sendStreamCommand({
            op: "fetchSpark",
            id: "sp_" + root.streamReqSeq,
            symbols: symbols,
            lightweight: Boolean(lightweight)
        });
    }

    function requestCachedKeys(keys) {
        if (!root.isStreamLeader && HubRegistry.leader() && HubRegistry.leader() !== root) {
            HubRegistry.leader().requestCachedKeys(keys);
            return;
        }
        if (!streamProc.running || !root.streamReady || !Array.isArray(keys) || keys.length === 0)
            return;
        var missing = [];
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            if (k && (!root.chartCache || !root.chartCache[k] || root.chartCache[k].length === 0))
                missing.push(k);
        }
        if (missing.length === 0)
            return;
        root.streamReqSeq = root.streamReqSeq + 1;
        root.sendStreamCommand({
            op: "cacheGet",
            id: "cg_" + root.streamReqSeq,
            keys: missing
        });
    }

    function requestSharedChartFetch(sym, rangeKey, force) {
        if (!root.isStreamLeader && HubRegistry.leader() && HubRegistry.leader() !== root)
            return HubRegistry.leader().requestSharedChartFetch(sym, rangeKey, force);
        var normSym = Model.normalizeSymbol(sym);
        var rk = String(rangeKey || "1D");
        if (!normSym)
            return false;
        var key = Model.cacheKey(normSym, rk);
        if (!force && root.chartCache && root.chartCache[key] && root.chartCache[key].length > 0)
            return true;
        var inFlightTs = root.streamInFlightCharts[key] || 0;
        if (inFlightTs > 0 && (Date.now() - inFlightTs) < 20000)
            return true;
        if (!streamProc.running || !root.streamReady)
            return false;
        root.streamInFlightCharts[key] = Date.now();
        root.streamReqSeq = root.streamReqSeq + 1;
        return root.sendStreamCommand({
            op: "fetchChart",
            id: "ch_" + root.streamReqSeq,
            symbol: normSym,
            rangeKey: rk,
            force: Boolean(force)
        });
    }

    function handleStreamLine(line) {
        var trimmed = String(line || "").trim();
        if (!trimmed)
            return;
        var msg;
        try {
            msg = JSON.parse(trimmed);
        } catch (e) {
            return;
        }
        if (!msg || typeof msg !== "object")
            return;

        if (msg.type === "ready") {
            root.streamReady = true;
            root.streamFailureCount = 0;
            root.lastStreamSubKey = "";
            HubRegistry.broadcastStreamStatus(root, true, root.streamConnected, root.streamYahooConnected, root.streamCoinbaseConnected, root.streamHyperliquidConnected);
            root.scheduleStreamSubSync();
            // Pre-warm only watchlist + active window keys off-thread (never load all 600 keys into Qt RAM)
            root.requestCachedKeys(Object.keys(root.collectProtectedCacheKeys()));
            return;
        }

        if (msg.type === "cacheEntries" && msg.entries && typeof msg.entries === "object") {
            var entryKeys = Object.keys(msg.entries);
            if (entryKeys.length === 0)
                return;
            if (!root.chartCache)
                root.chartCache = ({});
            var nowTs = Date.now();
            var loadedAny = false;
            for (var ei = 0; ei < entryKeys.length; ei++) {
                var ek = entryKeys[ei];
                if (!root.chartCache[ek] || root.chartCache[ek].length === 0) {
                    root.chartCache[ek] = Model.toArray(msg.entries[ek]);
                    root.chartCacheAccess[ek] = nowTs;
                    loadedAny = true;
                }
            }
            if (loadedAny) {
                root.candleCacheUpdated("");
                HubRegistry.broadcastCandleKey(root, root.chartCache, "");
            }
            return;
        }

        if (msg.type === "streamStatus") {
            root.streamYahooConnected = msg.yahoo === true;
            root.streamCoinbaseConnected = msg.coinbase === true;
            root.streamHyperliquidConnected = msg.hyperliquid === true;
            root.streamConnected = msg.active === true;
            HubRegistry.broadcastStreamStatus(root, root.streamReady, root.streamConnected, root.streamYahooConnected, root.streamCoinbaseConnected, root.streamHyperliquidConnected);
            return;
        }

        if (msg.type === "ticks" && msg.quotes && typeof msg.quotes === "object") {
            var tickSyms = Object.keys(msg.quotes);
            if (tickSyms.length === 0)
                return;
            root.quotes = Model.mergeQuotes(root.quotes, msg.quotes);
            root.applyLiveQuotesToDetailAndCache(tickSyms);
            root.quotesUpdated(tickSyms);
            root.quoteFailureCount = 0;
            root.quoteError = "";
            root.quotesUpdatedAt = Date.now();
            HubRegistry.broadcastQuotes(root, root.quotes, tickSyms, root.quotesUpdatedAt);
            root.evaluateWatchlistPriceAlerts(msg.quotes);
            return;
        }

        if (msg.type === "sparkResult") {
            var spQuotes = (msg.ok && msg.quotes && typeof msg.quotes === "object") ? msg.quotes : ({});
            var spKeys = Object.keys(spQuotes);
            if (spKeys.length > 0) {
                root.quotes = Model.mergeQuotes(root.quotes, spQuotes);
                root.applyLiveQuotesToDetailAndCache(spKeys);
                root.quotesUpdated(spKeys);
                root.quoteFailureCount = 0;
                root.quoteError = "";
                root.quotesUpdatedAt = Date.now();
                HubRegistry.broadcastQuotes(root, root.quotes, spKeys, root.quotesUpdatedAt);
                root.evaluateWatchlistPriceAlerts(spQuotes);
            } else if (!msg.ok) {
                root.quoteFailureCount = Math.min(10, root.quoteFailureCount + 1);
                if (!root.streamConnected)
                    root.quoteError = "Quotes unavailable";
            }
            return;
        }

        if (msg.type === "chartResult") {
            var cKey = msg.key || Model.cacheKey(msg.symbol, msg.rangeKey);
            if (cKey && root.streamInFlightCharts[cKey])
                delete root.streamInFlightCharts[cKey];
            if (msg.ok && Array.isArray(msg.candles) && msg.candles.length > 0) {
                if (!msg.fromCache)
                    root.streamFetchedAt[cKey] = Date.now();
                root.updateSharedCandles(cKey, msg.candles, msg.quote || null, true);
                if (msg.fromCache && Model.isCandleSeriesStale(msg.candles, msg.symbol, msg.rangeKey, new Date(), root.streamFetchedAt[cKey] || 0)) {
                    root.requestSharedChartFetch(msg.symbol, msg.rangeKey, true);
                }
                var allP = HubRegistry.allPanels();
                if (allP.length === 0)
                    allP = [root];
                for (var dpi = 0; dpi < allP.length; dpi++) {
                    var dp = allP[dpi];
                    if (dp && msg.symbol === dp.detailSymbol && msg.rangeKey === dp.detailRange) {
                        var det = msg.quote ? Object.assign({}, msg.quote) : { symbol: msg.symbol };
                        det.candles = Model.toArray(msg.candles);
                        det.chartRange = dp.detailRange;
                        if (dp.quotes[dp.detailSymbol] && dp.quotes[dp.detailSymbol].ftfc)
                            det.ftfc = dp.quotes[dp.detailSymbol].ftfc;
                        dp.detailQuote = det;
                        dp.chartFailureCount = 0;
                        dp.chartError = "";
                        dp.chartUpdatedAt = Date.now();
                    }
                }
                if (msg.rangeKey === "1D" && (root.watchlist || []).indexOf(msg.symbol) !== -1)
                    root.evaluateBgSymbolStrat(msg.symbol);
            } else {
                if (cKey) {
                    var allPanelsErr = HubRegistry.allPanels();
                    if (allPanelsErr.length === 0)
                        allPanelsErr = [root];
                    for (var epi = 0; epi < allPanelsErr.length; epi++) {
                        var ep = allPanelsErr[epi];
                        var eWins = (ep && ep.activeSectorWindows) ? ep.activeSectorWindows : [];
                        for (var ewi = 0; ewi < eWins.length; ewi++) {
                            if (eWins[ewi] && typeof eWins[ewi].clearHubPendingKey === "function")
                                eWins[ewi].clearHubPendingKey(cKey);
                        }
                    }
                }
                if (msg.symbol === root.detailSymbol && msg.rangeKey === root.detailRange) {
                    root.chartFailureCount = Math.min(10, root.chartFailureCount + 1);
                    root.chartError = "Chart unavailable";
                }
            }
            return;
        }
    }

    onOpenedChanged: scheduleStreamSubSync()
    onWatchlistChanged: scheduleStreamSubSync()
    onPinnedChanged: scheduleStreamSubSync()
    onDetailSymbolChanged: scheduleStreamSubSync()
    onActiveGridWindowsChanged: scheduleStreamSubSync()
    onActiveSectorWindowsChanged: scheduleStreamSubSync()
    onSymbolLevelsChanged: scheduleStreamSubSync()
    onShouldStreamLiveChanged: scheduleStreamSubSync()

    Timer {
        id: streamSubSyncTimer
        interval: 60
        repeat: false
        onTriggered: root.syncStreamSubscriptions()
    }

    function promoteToStreamLeader() {
        root.isStreamLeader = true;
        if (!streamProc.running)
            streamProc.running = true;
        root.scheduleStreamSubSync();
    }

    Timer {
        id: streamRestartTimer
        interval: Model.backoffDelay(1500, root.streamFailureCount, 30000)
        repeat: false
        onTriggered: {
            if (root.isStreamLeader && !streamProc.running)
                streamProc.running = true;
        }
    }

    Process {
        id: streamProc
        stdinEnabled: true
        command: Model.nodeCommand(Quickshell.env("HOME") + "/.config/omarchy/plugins/mohamedmansour.finance/scripts/market-stream.js")
        stdout: SplitParser {
            onRead: function (line) {
                root.handleStreamLine(line);
            }
        }
        onExited: function (exitCode) {
            root.streamReady = false;
            root.streamConnected = false;
            root.streamYahooConnected = false;
            root.streamCoinbaseConnected = false;
            root.streamHyperliquidConnected = false;
            root.lastStreamSubKey = "";
            root.streamInFlightCharts = ({});
            HubRegistry.broadcastStreamStatus(root, false, false, false, false, false);
            root.streamFailureCount = Math.min(10, root.streamFailureCount + 1);
            if (root.streamFailureCount >= 2 && !root.useFallbackDiskCache)
                root.useFallbackDiskCache = true;
            if (root.isStreamLeader)
                streamRestartTimer.restart();
        }
    }

    Component.onCompleted: {
        root.isStreamLeader = HubRegistry.register(root);
        mkdirProc.running = true;
        if (root.isStreamLeader)
            streamProc.running = true;
    }
    Component.onDestruction: {
        if (root.isStreamLeader)
            root.flushCandleCache();
        if (streamProc.running)
            streamProc.running = false;
        HubRegistry.unregister(root);
    }

    Process {
        id: barMoveProc
    }

    Process {
        id: bgChartProc
        onExited: function (exitCode) {
            var raw = String(bgChartStdout.text || "");
            var sym = root.bgFetchSymbol;
            var rk = root.bgFetchRange;
            var parsed = (exitCode === 0 && raw && sym && rk) ? Model.parseChart(raw, rk, sym) : null;
            if (parsed && parsed.candles) {
                var sharedKey = Model.cacheKey(sym, rk);
                root.updateSharedCandles(sharedKey, parsed.candles, parsed.symbol ? parsed : null);
                if (rk === "1D")
                    root.evaluateBgSymbolStrat(sym);
            }
            if (root.bgScanQueue && root.bgScanQueue.length > 0)
                Qt.callLater(root.processNextBgStratFetch);
        }
        stdout: StdioCollector {
            id: bgChartStdout
            waitForEnd: true
        }
    }

    Process {
        id: quoteProc
        onExited: function (exitCode) {
            var raw = String(quoteStdout.text || "").trim();
            var parsed = exitCode === 0 && raw ? Model.parseSpark(raw) : ({});
            if (Object.keys(parsed).length > 0) {
                var changedSyms = Object.keys(parsed);
                root.quotes = Model.mergeQuotes(root.quotes, parsed);
                root.applyLiveQuotesToDetailAndCache(changedSyms);
                root.quotesUpdated(changedSyms);
                root.quoteFailureCount = 0;
                root.quoteError = "";
                root.quotesUpdatedAt = Date.now();
                HubRegistry.broadcastQuotes(root, root.quotes, changedSyms, root.quotesUpdatedAt);
                root.evaluateWatchlistPriceAlerts(parsed);
            } else {
                root.quoteFailureCount = Math.min(10, root.quoteFailureCount + 1);
                root.quoteError = "Quotes unavailable";
            }
            if (root.quoteRefreshPending)
                Qt.callLater(root.refresh);
        }
        stdout: StdioCollector {
            id: quoteStdout
            waitForEnd: true
        }
    }

    Process {
        id: searchProc
        onExited: function (exitCode) {
            var results = [];
            if (exitCode === 0) {
                results = Model.parseSearch(searchStdout.text);
                root.cacheSearchResults(root.searchActiveQuery, results);
            }
            if (root.searching && root.searchActiveQuery === root.searchQuery) {
                if (exitCode === 0) {
                    root.suggestions = results;
                    root.searchError = "";
                } else {
                    root.suggestions = [];
                    root.searchError = "Search unavailable";
                }
                root.suggestionIndex = 0;
            }
            if (root.searching && root.searchPendingQuery && root.searchPendingQuery !== root.searchActiveQuery)
                Qt.callLater(root.startSearchFetch);
        }
        stdout: StdioCollector {
            id: searchStdout
            waitForEnd: true
        }
    }

    Process {
        id: chartProc
        onExited: function (exitCode) {
            var currentFetch = root.chartFetchSymbol === root.detailSymbol && root.chartFetchRange === root.detailRange;
            if (currentFetch) {
                var parsed = exitCode === 0 ? Model.parseChart(chartStdout.text, root.chartFetchRange, root.chartFetchSymbol || root.detailSymbol) : null;
                if (!parsed && !root.chartRetryingYahoo && Model.isCryptoSymbol(root.chartFetchSymbol)) {
                    root.chartRetryingYahoo = true;
                    chartProc.command = ["curl", "-fsS", "--compressed", "--max-time", "8", "-A", "Mozilla/5.0", Model.yahooChartUrl(root.chartFetchSymbol, root.chartFetchRange)];
                    chartProc.running = true;
                    return;
                }
                root.chartRetryingYahoo = false;
                var expected = Model.chartSpec(root.detailRange).range;
                var valid = parsed && parsed.symbol === root.detailSymbol && (!parsed.yahooRange || !expected || parsed.yahooRange === expected);
                if (valid) {
                    parsed.chartRange = root.detailRange;
                    if (root.quotes[root.detailSymbol] && root.quotes[root.detailSymbol].ftfc)
                        parsed.ftfc = root.quotes[root.detailSymbol].ftfc;
                    root.detailQuote = parsed;
                    if (parsed.candles && parsed.candles.length > 0)
                        root.updateSharedCandles(Model.cacheKey(root.detailSymbol, root.detailRange), parsed.candles, parsed);
                    root.chartFailureCount = 0;
                    root.chartError = "";
                    root.chartUpdatedAt = Date.now();
                } else {
                    root.chartFailureCount = Math.min(10, root.chartFailureCount + 1);
                    root.chartError = "Chart unavailable";
                }
            }
            if (root.detailSymbol && (root.chartFetchSymbol !== root.detailSymbol || root.chartFetchRange !== root.detailRange))
                Qt.callLater(root.startChartFetch);
        }
        stdout: StdioCollector {
            id: chartStdout
            waitForEnd: true
        }
    }

    Process {
        id: insightsProc
        onExited: function (exitCode) {
            var currentFetch = root.insightsFetchSymbol === root.detailSymbol;
            if (currentFetch) {
                var raw = String(insightsStdout.text || "").trim();
                if (exitCode === 0 && Model.isInsightsResponse(raw)) {
                    root.detailInsights = Model.parseInsights(raw);
                    root.cacheDetailData(root.insightsFetchSymbol, "insights", root.detailInsights);
                    root.insightsFailureCount = 0;
                    root.insightsError = "";
                    root.insightsLoaded = true;
                } else {
                    root.insightsFailureCount = Math.min(10, root.insightsFailureCount + 1);
                    root.insightsError = "Insights unavailable";
                }
            }
            if (root.detailSymbol && root.insightsFetchSymbol !== root.detailSymbol)
                Qt.callLater(root.fetchInsights);
        }
        stdout: StdioCollector {
            id: insightsStdout
            waitForEnd: true
        }
    }

    Process {
        id: quotePageProc
        onExited: function (exitCode) {
            var currentFetch = root.quotePageFetchSymbol === root.detailSymbol;
            if (currentFetch) {
                var raw = String(quotePageStdout.text || "").trim();
                if (exitCode === 0 && raw) {
                    root.detailPage = Model.parseQuotePage(raw);
                    root.cacheDetailData(root.quotePageFetchSymbol, "page", root.detailPage);
                    root.quotePageFailureCount = 0;
                    root.quotePageError = "";
                    root.quotePageLoaded = true;
                } else {
                    root.quotePageFailureCount = Math.min(10, root.quotePageFailureCount + 1);
                    root.quotePageError = "Fundamentals unavailable";
                }
            }
            if (root.detailSymbol && root.quotePageFetchSymbol !== root.detailSymbol)
                Qt.callLater(root.fetchQuotePage);
        }
        stdout: StdioCollector {
            id: quotePageStdout
            waitForEnd: true
        }
    }

    Process {
        id: holdingsProc
        onExited: function (exitCode) {
            var currentFetch = root.holdingsFetchSymbol === root.detailSymbol;
            if (currentFetch) {
                var raw = String(holdingsStdout.text || "").trim();
                if (exitCode === 0 && raw) {
                    var parsed = null;
                    try {
                        if (raw.charAt(0) === "{") {
                            parsed = JSON.parse(raw);
                        } else {
                            parsed = Model.parseNportXml(raw, root.holdingsFetchSymbol);
                        }
                    } catch (e) {
                        console.log("[Holdings] parse error:", e);
                    }
                    if (parsed && parsed.holdings && parsed.holdings.length > 0) {
                        root.detailHoldings = parsed;
                        root.cacheDetailData(root.holdingsFetchSymbol, "holdings", parsed);
                        root.holdingsFailureCount = 0;
                        root.holdingsError = "";
                        root.holdingsLoaded = true;
                        root.fetchHoldingsStrat(root.holdingsFetchSymbol);
                    } else {
                        root.detailHoldings = null;
                        root.holdingsLoaded = false;
                    }
                } else {
                    root.detailHoldings = null;
                    root.holdingsLoaded = false;
                }
            }
            if (root.detailSymbol && !Model.isCryptoSymbol(root.detailSymbol) && root.holdingsFetchSymbol !== root.detailSymbol)
                Qt.callLater(root.fetchHoldings);
        }
        stdout: StdioCollector {
            id: holdingsStdout
            waitForEnd: true
        }
    }

    Process {
        id: holdingsStratProc
        onExited: function (exitCode) {
            var currentFetch = root.holdingsStratFetchSymbol === root.detailSymbol;
            if (currentFetch) {
                var raw = String(holdingsStratStdout.text || "").trim();
                if (exitCode === 0 && raw) {
                    try {
                        var parsed = JSON.parse(raw);
                        if (parsed && parsed.stratMap) {
                            root.detailHoldingsStratMap = parsed.stratMap;
                            root.cacheDetailData(root.holdingsStratFetchSymbol, "holdingsStrat", parsed.stratMap);
                        }
                    } catch (e) {
                        console.log("[HoldingsStrat] parse error:", e);
                    }
                }
                root.detailHoldingsStratLoading = false;
            }
            if (root.detailSymbol && !Model.isCryptoSymbol(root.detailSymbol) && root.holdingsStratFetchSymbol !== root.detailSymbol)
                Qt.callLater(function () {
                    root.fetchHoldingsStrat(root.detailSymbol);
                });
        }
        stdout: StdioCollector {
            id: holdingsStratStdout
            waitForEnd: true
        }
    }

    Timer {
        id: searchDebounce
        interval: 100
        onTriggered: root.requestSearch()
    }

    Timer {
        id: detailEnrichmentTimer
        interval: 16
        repeat: false
        onTriggered: {
            root.fetchInsights();
            root.fetchQuotePage();
            root.fetchHoldings();
        }
    }

    Timer {
        id: openRefreshTimer
        interval: 250
        repeat: false
        onTriggered: {
            var searchStarted = root.searching && root.searchQuery.length > 0;
            if (root.opened && !searchStarted && !quoteProc.running)
                root.refresh();
        }
    }

    Timer {
        id: refreshTimer
        interval: root.backgroundRefreshMs
        running: root.showBarQuote && !root.opened
        repeat: true
        onTriggered: {
            if (!root.isStreamLeader)
                return;
            if (root.shouldStreamLive && root.streamConnected) {
                root.hydrateMissingQuoteMetadata();
                return;
            }
            if (!quoteProc.running)
                root.refresh();
        }
    }

    Timer {
        id: liveTimer
        interval: root.liveRefreshMs
        running: root.opened
        repeat: true
        onTriggered: {
            if (root.shouldStreamLive && root.streamConnected) {
                root.hydrateMissingQuoteMetadata();
                return;
            }
            if (!quoteProc.running)
                root.refresh();
        }
    }

    Timer {
        id: chartLiveTimer
        interval: root.chartRefreshMs
        running: root.opened && root.view === "detail" && root.detailSymbol !== ""
        repeat: true
        onTriggered: {
            if (!root.detailSymbol)
                return;
            if (!Model.isCryptoSymbol(root.detailSymbol) && !Model.isUsMarketOpen(new Date(), false)) {
                var dk = Model.cacheKey(root.detailSymbol, root.detailRange);
                var lastLive = (root.streamFetchedAt && root.streamFetchedAt[dk]) ? root.streamFetchedAt[dk] : 0;
                if (lastLive > 0 && (Date.now() - lastLive) < 120000)
                    return;
            }
            root.startChartFetch();
        }
    }

    Timer {
        id: sessionBoundaryTimer
        interval: 10000
        running: root.isStreamLeader && (root.opened || root.hasActiveWindows)
        repeat: true
        onTriggered: {
            var nowOpen = Model.isUsMarketOpen(new Date(), false);
            if (nowOpen !== root._lastKnownUsRthOpen) {
                root._lastKnownUsRthOpen = nowOpen;
                var nextState = nowOpen ? "regular" : "post";
                root.hydrateMissingQuoteMetadata(null, true);
                root.handleSessionBoundary(nextState);
                HubRegistry.broadcastSessionBoundary(root, nextState);
            }
        }
    }

    Timer {
        interval: root.insightsRetryMs
        running: root.opened && root.view === "detail" && root.insightsError !== ""
        repeat: false
        onTriggered: root.fetchInsights()
    }

    Timer {
        interval: root.quotePageRetryMs
        running: root.opened && root.view === "detail" && root.quotePageError !== ""
        repeat: false
        onTriggered: root.fetchQuotePage()
    }

    Timer {
        id: pinRotateTimer
        interval: 5000
        running: root.showBarData && (root.pinned || []).length > 1
        repeat: true
        onTriggered: root.pinIndex = root.pinIndex + 1
    }

    Timer {
        id: bgStratScanTimer
        interval: 60000
        running: root.isStreamLeader && root.showBarQuote && (root.watchlist || []).length > 0
        repeat: true
        onTriggered: {
            if (Model.isUsMarketOpen(new Date(), false))
                root.triggerWatchlistStratScan();
        }
    }

    Timer {
        id: alertsMuteClock
        interval: 30000
        running: root.alertsMutedUntil > 0
        repeat: true
        onTriggered: {
            root.muteClockMs = Date.now();
            if (!Model.isAlertsMuted(root.alertsMutedUntil, new Date())) {
                root.alertsMutedUntil = 0;
                root.persist();
            }
        }
    }

    IpcHandler {
        target: root.ipcTarget

        function muteAlerts(): void {
            root.setAlertsMute("open");
        }
        function muteAlertsFor(mode: string): void {
            root.setAlertsMute(mode);
        }
        function unmuteAlerts(): void {
            root.setAlertsMute("");
        }
        function toggleAlertsMute(): void {
            root.toggleAlertsMute();
        }
        function alertsMuteStatus(): string {
            return root.alertsMuteStatus || "Alerts live";
        }
        function open(): void {
            root.openFromHotkey();
        }
        function openBreadth(): void {
            root.openSectorBreadth();
        }
        function openAlerts(): void {
            root.open();
            root.openAlerts();
        }
        function openLayout(name: string): void {
            root.loadLayout(name);
        }
        function close(): void {
            root.close();
        }
        function show(): void {
            root.openFromHotkey();
        }
        function hide(): void {
            root.close();
        }
        function toggle(): void {
            root.toggle();
        }
        function refresh(): void {
            root.refresh();
        }
    }

    KeyboardPanel {
        id: panel
        anchorItem: root.anchorItem
        owner: root.barIdentity
        bar: root.bar
        open: root.opened
        centerOnBar: false
        focusTarget: keyCatcher
        contentWidth: panel.fittedContentWidth(Style.space(520))
        contentHeight: panel.fittedContentHeight(bodyColumn.implicitHeight, Style.space(620))

        PanelKeyCatcher {
            id: keyCatcher
            anchors.fill: parent
            blocked: listView.field.activeFocus
            onMoveRequested: function (dx, dy) {
                root.moveFocus(dx, dy);
            }
            onActivateRequested: root.activateCursor()
            onCloseRequested: {
                if (root.view === "detail")
                    root.closeDetail();
                else if (root.view === "settings" || root.view === "alerts" || root.view === "layouts")
                    root.view = "list";
                else if (root.listChrome === "gear")
                    root.focusSearchChrome();
                else if (root.searching)
                    root.clearSearch();
                else
                    root.close();
            }
            onDeleteRequested: {
                if (root.view !== "list" || root.searching || root.watchlist.length === 0)
                    return;
                root.removeSymbol(root.watchlist[root.selectedIndex]);
            }
            Keys.onPressed: function (event) {
                if (event.key === Qt.Key_R && (event.modifiers & Qt.AltModifier)) {
                    if (root.view === "detail" && detailView && detailView.resetChart) {
                        detailView.resetChart();
                        event.accepted = true;
                    }
                }
            }
            onTabRequested: function (direction) {
                root.switchPanel(direction);
            }
            onTextKey: function (t) {
                if (root.view === "settings")
                    return;
                if (root.view === "detail") {
                    if (t === "r" || t === "R") {
                        if (detailView && detailView.resetChart)
                            detailView.resetChart();
                        return;
                    }
                    if (t === "f" || t === "F")
                        root.toggleFavorite(root.detailSymbol);
                    else if (t === "p" || t === "P")
                        root.pinSymbol(root.detailSymbol);
                    else if ((t === "x" || t === "X") && root.detailIsFavorite) {
                        root.removeSymbol(root.detailSymbol);
                        root.closeDetail();
                    }
                    return;
                }
                if (t === "/" || t === "?") {
                    root.startSearch("");
                    return;
                }
                if (t === "s" || t === "S") {
                    root.openSettings();
                    return;
                }
                if (t === "p" || t === "P") {
                    if (root.searching && root.suggestions.length > 0)
                        root.toggleFavorite(root.suggestions[root.suggestionIndex].symbol);
                    else if (root.watchlist.length > 0)
                        root.pinSymbol(root.watchlist[root.selectedIndex]);
                    return;
                }
                if (t === "f" || t === "F") {
                    if (root.searching && root.suggestions.length > 0)
                        root.toggleFavorite(root.suggestions[root.suggestionIndex].symbol);
                    else if (root.watchlist.length > 0)
                        root.toggleFavorite(root.watchlist[root.selectedIndex]);
                    return;
                }
                if (t === "x" || t === "X")
                    return;
                if (root.listChrome === "gear")
                    return;
                if (t && t.length === 1 && t !== " ")
                    root.startSearch(t);
            }

            Flickable {
                id: bodyScroll
                anchors.fill: parent
                contentWidth: width
                contentHeight: bodyColumn.implicitHeight
                clip: true
                boundsBehavior: Flickable.StopAtBounds
                interactive: contentHeight > height

                Column {
                    id: bodyColumn
                    width: bodyScroll.width
                    spacing: Style.space(10)

                    FinanceListView {
                        id: listView
                        width: parent.width
                        controller: root
                        visible: root.view === "list"
                    }

                    FinanceSettingsView {
                        width: parent.width
                        controller: root
                        visible: root.view === "settings"
                    }

                    FinanceLayoutsView {
                        width: parent.width
                        controller: root
                        visible: root.view === "layouts"
                    }

                    FinanceAlertsView {
                        width: parent.width
                        controller: root
                        visible: root.view === "alerts"
                    }

                    FinanceDetailView {
                        id: detailView
                        width: parent.width
                        controller: root
                        visible: root.view === "detail"
                    }
                }
            }

            Item {
                id: stratTooltipOverlay
                anchors.fill: parent
                z: Model.Z_LAYER.MODAL
                visible: root.hoveredStratInfo !== null

                FinanceSurface {
                    id: stratTooltipBox
                    elevation: 3
                    radiusToken: "md"
                    foregroundColor: root.contentForeground
                    visible: root.hoveredStratInfo !== null
                    width: tooltipCol.implicitWidth + Style.space(20)
                    height: tooltipCol.implicitHeight + Style.space(16)

                    x: Math.max(Style.space(8), Math.min(parent.width - width - Style.space(8), root.hoveredStratGlobalX - width / 2))
                    y: root.hoveredStratGlobalY - height - Style.space(10) > Style.space(8) ? (root.hoveredStratGlobalY - height - Style.space(10)) : (root.hoveredStratGlobalY + Style.space(24))

                    Column {
                        id: tooltipCol
                        anchors.centerIn: parent
                        spacing: Style.space(3)

                        Row {
                            spacing: Style.space(6)
                            Text {
                                text: root.hoveredStratInfo ? (root.hoveredStratInfo.symbol + " · " + (root.hoveredStratInfo.timeframe === "60" ? "60 Min" : root.hoveredStratInfo.timeframe === "D" ? "Daily" : root.hoveredStratInfo.timeframe === "W" ? "Weekly" : root.hoveredStratInfo.timeframe === "M" ? "Monthly" : "Yearly")) : ""
                                color: root.contentForeground
                                font.family: root.contentFontFamily
                                font.pixelSize: Style.font.bodySmall
                                font.bold: true
                            }
                            Text {
                                text: root.hoveredStratInfo && root.hoveredStratInfo.data && root.hoveredStratInfo.data.bar ? root.hoveredStratInfo.data.bar : ""
                                color: root.hoveredStratInfo && root.hoveredStratInfo.data && root.hoveredStratInfo.data.polarity === "green" ? root.upColor : (root.hoveredStratInfo && root.hoveredStratInfo.data && root.hoveredStratInfo.data.polarity === "red" ? root.downColor : root.dim)
                                font.family: root.contentFontFamily
                                font.pixelSize: Style.font.bodySmall
                                font.bold: true
                            }
                        }

                        Text {
                            visible: root.hoveredStratInfo && root.hoveredStratInfo.data && root.hoveredStratInfo.data.sequence && root.hoveredStratInfo.data.sequence !== "-"
                            text: visible ? ("3-Bar Sequence: " + root.hoveredStratInfo.data.sequence) : ""
                            color: root.contentForeground
                            font.family: root.contentFontFamily
                            font.pixelSize: Style.font.bodySmall - 1
                        }

                        Text {
                            visible: root.hoveredStratInfo && root.hoveredStratInfo.data && root.hoveredStratInfo.data.inForce && root.hoveredStratInfo.data.inForce !== "-"
                            text: visible ? ("Status: " + root.hoveredStratInfo.data.inForce) : ""
                            color: visible && root.hoveredStratInfo.data.inForce.indexOf("In-Force") !== -1 ? root.upColor : root.dim
                            font.family: root.contentFontFamily
                            font.pixelSize: Style.font.bodySmall - 1
                        }

                        Row {
                            visible: root.hoveredStratInfo && root.hoveredStratInfo.data && (root.hoveredStratInfo.data.triggerHigh !== null || root.hoveredStratInfo.data.triggerLow !== null)
                            spacing: Style.space(8)
                            Text {
                                text: (root.hoveredStratInfo && root.hoveredStratInfo.data && root.hoveredStratInfo.data.triggerHigh !== null) ? ("Trig H: " + Model.formatPrice(root.hoveredStratInfo.data.triggerHigh, "USD", 2)) : ""
                                color: root.dim
                                font.family: root.contentFontFamily
                                font.pixelSize: Style.font.bodySmall - 1
                            }
                            Text {
                                text: (root.hoveredStratInfo && root.hoveredStratInfo.data && root.hoveredStratInfo.data.triggerLow !== null) ? ("Trig L: " + Model.formatPrice(root.hoveredStratInfo.data.triggerLow, "USD", 2)) : ""
                                color: root.dim
                                font.family: root.contentFontFamily
                                font.pixelSize: Style.font.bodySmall - 1
                            }
                        }

                        Text {
                            visible: root.hoveredStratInfo && root.hoveredStratInfo.data && root.hoveredStratInfo.data.open !== null
                            text: visible ? ("O: " + Model.formatPrice(root.hoveredStratInfo.data.open, "USD", 2) + "  H: " + Model.formatPrice(root.hoveredStratInfo.data.high, "USD", 2) + "  L: " + Model.formatPrice(root.hoveredStratInfo.data.low, "USD", 2) + "  C: " + Model.formatPrice(root.hoveredStratInfo.data.close, "USD", 2)) : ""
                            color: root.dim
                            font.family: root.contentFontFamily
                            font.pixelSize: Style.font.bodySmall - 2
                        }
                    }
                }
            }
        }
    }

    function closeAllGrids() {
        var list = root.activeGridWindows ? root.activeGridWindows.slice() : [];
        root.activeGridWindows = [];
        for (var i = 0; i < list.length; i++) {
            if (list[i]) {
                list[i].visible = false;
                if (typeof list[i].destroy === "function")
                    list[i].destroy();
            }
        }
    }

    Timer {
        id: layoutSpawnTimer
        interval: 150
        repeat: true
        property var pendingSymbols: []
        property int currentIndex: 0
        onTriggered: {
            if (currentIndex < pendingSymbols.length) {
                root.openGrid(pendingSymbols[currentIndex]);
                currentIndex++;
            } else {
                running = false;
                pendingSymbols = [];
                currentIndex = 0;
            }
        }
    }

    Process {
        id: hyprctlWorkspaceProc
    }

    Process {
        id: hyprctlClientsProc
        command: ["hyprctl", "clients", "-j"]
        property string pendingSaveName: ""
        onExited: function (exitCode) {
            var raw = String(hyprctlClientsStdout.text || "").trim();
            var parsed = [];
            try {
                if (exitCode === 0 && raw) {
                    var clients = JSON.parse(raw);
                    if (Array.isArray(clients)) {
                        for (var i = 0; i < clients.length; i++) {
                            var c = clients[i];
                            var title = String(c.title || c.initialTitle || "");
                            if (title.indexOf("Omafinance Grid - ") === 0) {
                                var sym = title.substring("Omafinance Grid - ".length).trim();
                                if (sym) {
                                    var ws = (c.workspace && c.workspace.id !== undefined) ? c.workspace.id : 2;
                                    var at = (Array.isArray(c.at) && c.at.length === 2) ? c.at : [0, 0];
                                    parsed.push({
                                        symbol: sym,
                                        workspace: ws,
                                        x: at[0],
                                        y: at[1]
                                    });
                                }
                            }
                        }
                    }
                }
            } catch (e) {}

            parsed.sort(function (a, b) {
                if (Math.abs(a.y - b.y) > 50)
                    return a.y - b.y;
                return a.x - b.x;
            });

            var windowsList = [];
            var targetWs = 2;
            function findActiveGridWindow(symName) {
                if (!root.activeGridWindows)
                    return null;
                for (var wi = 0; wi < root.activeGridWindows.length; wi++) {
                    var winItem = root.activeGridWindows[wi];
                    if (winItem && winItem.visible && winItem.mainSymbol === symName)
                        return winItem;
                }
                return null;
            }
            if (parsed.length > 0) {
                targetWs = parsed[0].workspace;
                for (var j = 0; j < parsed.length; j++) {
                    var matchedWin = findActiveGridWindow(parsed[j].symbol);
                    windowsList.push({
                        symbol: parsed[j].symbol,
                        workspace: parsed[j].workspace,
                        timeframes: (matchedWin && matchedWin.cellTimeframes) ? matchedWin.cellTimeframes.slice() : (root.gridTimeframes ? root.gridTimeframes.slice() : ["60", "1D", "1W", "1M", "1Y"]),
                        zooms: (matchedWin && matchedWin.cellZooms) ? matchedWin.cellZooms.slice() : (root.gridZooms ? root.gridZooms.slice() : [-1, -1, -1, -1, -1]),
                        gridMode: (matchedWin && matchedWin.gridMode) ? (matchedWin.gridMode === "1x1" ? (matchedWin.previousGridMode || "2+3") : matchedWin.gridMode) : root.gridMode
                    });
                }
            } else if (root.activeGridWindows && root.activeGridWindows.length > 0) {
                for (var k = 0; k < root.activeGridWindows.length; k++) {
                    var w = root.activeGridWindows[k];
                    if (w && w.visible && w.mainSymbol) {
                        windowsList.push({
                            symbol: w.mainSymbol,
                            workspace: targetWs,
                            timeframes: w.cellTimeframes ? w.cellTimeframes.slice() : (root.gridTimeframes ? root.gridTimeframes.slice() : ["60", "1D", "1W", "1M", "1Y"]),
                            zooms: w.cellZooms ? w.cellZooms.slice() : (root.gridZooms ? root.gridZooms.slice() : [-1, -1, -1, -1, -1]),
                            gridMode: w.gridMode === "1x1" ? (w.previousGridMode || "2+3") : (w.gridMode || root.gridMode)
                        });
                    }
                }
            }

            if (windowsList.length > 0 && pendingSaveName) {
                root.layouts = Model.saveLayout(root.layouts, pendingSaveName, windowsList, targetWs);
                root.activeLayoutName = pendingSaveName;
                root.persist();
                root.updateActiveGridsLayouts();
                root.layoutActionStatus = "Layout '" + pendingSaveName + "' saved (" + windowsList.length + " charts).";
            } else {
                root.layoutActionStatus = "No active chart grids found to save.";
            }
            pendingSaveName = "";
        }
        stdout: StdioCollector {
            id: hyprctlClientsStdout
            waitForEnd: true
        }
    }

    function snapshotCurrentLayout(name) {
        var trimmed = String(name || "").trim();
        if (!trimmed)
            return;
        hyprctlClientsProc.pendingSaveName = trimmed;
        if (!hyprctlClientsProc.running)
            hyprctlClientsProc.running = true;
    }

    function loadLayout(name) {
        if (!root.layouts || !root.layouts[name])
            return;
        var layout = root.layouts[name];
        var windows = layout.windows || [];
        if (windows.length === 0)
            return;

        root.activeLayoutName = name;
        root.closeAllGrids();

        var ws = layout.workspace || 2;
        hyprctlWorkspaceProc.command = ["hyprctl", "dispatch", 'hl.dsp.focus({ workspace = "' + String(ws) + '" })'];
        hyprctlWorkspaceProc.running = true;

        var syms = [];
        for (var i = 0; i < windows.length; i++) {
            var winSpec = windows[i];
            var sym = typeof winSpec === "string" ? winSpec : (winSpec ? winSpec.symbol : "");
            if (sym) {
                syms.push({
                    symbol: sym,
                    timeframes: (winSpec && typeof winSpec === "object" && Array.isArray(winSpec.timeframes)) ? winSpec.timeframes.slice() : null,
                    zooms: (winSpec && typeof winSpec === "object" && Array.isArray(winSpec.zooms)) ? winSpec.zooms.slice() : null,
                    gridMode: (winSpec && typeof winSpec === "object" && winSpec.gridMode) ? winSpec.gridMode : null
                });
            }
        }

        layoutSpawnTimer.stop();
        layoutSpawnTimer.pendingSymbols = syms;
        layoutSpawnTimer.currentIndex = 0;
        layoutSpawnTimer.restart();
    }

    function deleteLayout(name) {
        root.layouts = Model.deleteLayout(root.layouts, name);
        if (root.activeLayoutName === name)
            root.activeLayoutName = "";
        root.persist();
        root.updateActiveGridsLayouts();
    }

    function updateActiveGridsLayouts() {
        if (root.activeGridWindows) {
            for (var i = 0; i < root.activeGridWindows.length; i++) {
                var w = root.activeGridWindows[i];
                if (w && w.visible) {
                    w.layouts = root.layouts;
                    w.activeLayoutName = root.activeLayoutName;
                }
            }
        }
    }

    function openGrid(symbol) {
        var cfg = (typeof symbol === "object" && symbol !== null) ? symbol : null;
        var sym = (typeof symbol === "object" && symbol !== null) ? symbol.symbol : symbol;
        sym = sym || detailSymbol || (watchlist.length > 0 ? watchlist[0] : "AAPL");
        for (var i = 0; i < root.activeGridWindows.length; i++) {
            var existing = root.activeGridWindows[i];
            if (existing && existing.visible && existing.mainSymbol === sym) {
                if (cfg && cfg.gridMode) {
                    existing.gridMode = cfg.gridMode;
                    if (cfg.gridMode !== "1x1")
                        existing.previousGridMode = cfg.gridMode;
                }
                if (cfg && cfg.timeframes && cfg.timeframes.length > 0)
                    existing.cellTimeframes = cfg.timeframes.slice();
                if (cfg && cfg.zooms && cfg.zooms.length > 0)
                    existing.cellZooms = cfg.zooms.slice();
                if (typeof existing.raise === "function")
                    existing.raise();
                if (typeof existing.requestActivate === "function")
                    existing.requestActivate();
                return;
            }
        }

        var nextWindows = [];
        for (var j = 0; j < root.activeGridWindows.length; j++) {
            if (root.activeGridWindows[j] && root.activeGridWindows[j].visible)
                nextWindows.push(root.activeGridWindows[j]);
        }

        var currentSplits = root.gridSplits || ({});
        var currentMode = (cfg && cfg.gridMode) ? cfg.gridMode : (root.gridMode || "2x2");
        var baseMode = (currentMode === "2+3" || currentMode === "2x2") ? currentMode : ((root.gridMode === "2+3" || root.gridMode === "2x2") ? root.gridMode : "2+3");
        var initialTfs = (cfg && cfg.timeframes && cfg.timeframes.length > 0) ? cfg.timeframes.slice() : ((root.gridTimeframes && root.gridTimeframes.length > 0) ? root.gridTimeframes.slice() : Model.gridTimeframes(baseMode));
        var initialZooms = (cfg && cfg.zooms && cfg.zooms.length > 0) ? cfg.zooms.slice() : ((root.gridZooms && root.gridZooms.length > 0) ? root.gridZooms.slice() : [-1, -1, -1, -1, -1]);
        var botRatios = (currentSplits["2+3"] && Array.isArray(currentSplits["2+3"].colBotRatios)) ? currentSplits["2+3"].colBotRatios : [0.333, 0.333, 0.334];
        var win = gridWindowComponent.createObject(root, {
            mainSymbol: sym,
            watchlist: root.watchlist,
            pinned: root.pinned,
            gridMode: currentMode,
            previousGridMode: baseMode,
            syncSymbol: root.gridSync ? root.gridSync.symbol !== false : true,
            syncTimeframe: root.gridSync ? root.gridSync.timeframe === true : false,
            syncCrosshair: root.gridSync ? root.gridSync.crosshair !== false : true,
            syncTime: root.gridSync ? root.gridSync.time !== false : true,
            showBroadening: root.gridSync ? root.gridSync.broadening === true : false,
            showSetupLines: root.gridSync ? root.gridSync.setupLines !== false : true,
            cellSymbols: [sym, sym, sym, sym, sym],
            cellTimeframes: initialTfs,
            cellZooms: initialZooms,
            symbolLevels: root.symbolLevels || ({}),
            signalStates: root.signalStates || ({}),
            symbolPriceMemory: root.symbolPriceMemory || ({}),
            rowSplitRatio: currentSplits[currentMode] && currentSplits[currentMode].rowRatio ? currentSplits[currentMode].rowRatio : 0.5,
            topColSplitRatio: currentSplits[currentMode] && currentSplits[currentMode].colTopRatio ? currentSplits[currentMode].colTopRatio : 0.5,
            botColSplitRatio: currentSplits[currentMode] && currentSplits[currentMode].colBotRatio ? currentSplits[currentMode].colBotRatio : 0.5,
            botCol1Ratio: botRatios[0] || 0.333,
            botCol2Ratio: botRatios[1] || 0.333
        });

        if (win) {
            win.quotes = root.quotes;
            win.chartCache = root.chartCache;
            win.chartFetchedAt = Object.assign({}, root.streamFetchedAt || ({}));
            if (typeof win.notifyCacheKeyUpdated === "function")
                win.notifyCacheKeyUpdated("");
            if (typeof win.refreshAllCharts === "function")
                win.refreshAllCharts(false);
            nextWindows.push(win);
            root.activeGridWindows = nextWindows;
        }
    }

    Component {
        id: gridWindowComponent
        GridWindow {
            id: gridWin
            visible: true
            discordWebhook: root.discordWebhook
            alertsMuted: root.alertsMuted
            alertsMuteStatus: root.alertsMuteStatus
            hubReady: root.streamReady
            hubStreamingActive: root.shouldStreamLive && root.streamConnected

            onHubChartFetchRequested: function (sym, tf, force) {
                root.requestSharedChartFetch(sym, tf, force);
            }

            onActiveSymbolsChanged: root.scheduleStreamSubSync()

            Connections {
                target: root
                function onCandleCacheUpdated(key) {
                    if (gridWin.chartCache !== root.chartCache)
                        gridWin.chartCache = root.chartCache;
                    if (key && root.streamFetchedAt && root.streamFetchedAt[key])
                        gridWin.chartFetchedAt[key] = root.streamFetchedAt[key];
                    if (typeof gridWin.notifyCacheKeyUpdated === "function")
                        gridWin.notifyCacheKeyUpdated(key);
                }
                function onQuotesUpdated(changedSymbols) {
                    if (gridWin.chartCache !== root.chartCache)
                        gridWin.chartCache = root.chartCache;
                    if (gridWin.quotes !== root.quotes)
                        gridWin.quotes = root.quotes;
                    if (typeof gridWin.notifyQuotesUpdated === "function")
                        gridWin.notifyQuotesUpdated(changedSymbols);
                }
                function onSessionBoundaryCrossed(sessionState) {
                    if (typeof gridWin.handleSessionBoundary === "function")
                        gridWin.handleSessionBoundary(sessionState);
                }
            }

            onQuotesReceived: function (incoming) {
                root.quotes = Model.mergeQuotes(root.quotes, incoming);
                root.quotesUpdated(Object.keys(incoming || ({})));
                root.evaluateWatchlistPriceAlerts(incoming);
            }

            onChartDataReceived: function (key, candles, quoteEnriched) {
                root.updateSharedCandles(key, candles, quoteEnriched);
            }

            onSymbolLevelsChangedExternally: function (sym, nextLevels) {
                if (!sym)
                    return;
                var nextMap = Object.assign({}, root.symbolLevels || ({}));
                nextMap[sym] = nextLevels || [];
                root.symbolLevels = nextMap;
                root.syncActiveGridsAlertState();
                root.persist();
            }

            onSignalStatesUpdated: function (nextStates) {
                root.signalStates = Object.assign({}, root.signalStates || ({}), nextStates || ({}));
                root.syncActiveGridsAlertState();
                root.persist();
            }

            onAlertDispatchRequested: function (alert) {
                root.dispatchAlert(alert);
            }

            onAlertsMuteToggleRequested: root.toggleAlertsMute()

            onStateSaveRequested: function (mode, sync, symbols, splits) {
                root.gridMode = mode;
                root.gridSync = sync;
                root.gridSymbols = symbols;
                if (gridWin.cellTimeframes && gridWin.cellTimeframes.length > 0)
                    root.gridTimeframes = gridWin.cellTimeframes.slice();
                if (gridWin.cellZooms && gridWin.cellZooms.length > 0)
                    root.gridZooms = gridWin.cellZooms.slice();
                if (root.activeLayoutName && root.layouts && root.layouts[root.activeLayoutName]) {
                    var curLayout = root.layouts[root.activeLayoutName];
                    if (curLayout && Array.isArray(curLayout.windows)) {
                        var nextWins = [];
                        for (var li = 0; li < curLayout.windows.length; li++) {
                            var lw = curLayout.windows[li];
                            if (lw && lw.symbol === gridWin.mainSymbol) {
                                nextWins.push({
                                    symbol: lw.symbol,
                                    workspace: lw.workspace || curLayout.workspace || 2,
                                    timeframes: (gridWin.cellTimeframes && gridWin.cellTimeframes.length > 0) ? gridWin.cellTimeframes.slice() : lw.timeframes,
                                    zooms: (gridWin.cellZooms && gridWin.cellZooms.length > 0) ? gridWin.cellZooms.slice() : lw.zooms,
                                    gridMode: mode || lw.gridMode
                                });
                            } else {
                                nextWins.push(lw);
                            }
                        }
                        var nextLayouts = Object.assign({}, root.layouts);
                        nextLayouts[root.activeLayoutName] = {
                            name: curLayout.name || root.activeLayoutName,
                            workspace: curLayout.workspace || 2,
                            windows: nextWins
                        };
                        root.layouts = nextLayouts;
                    }
                }
                var nextSplits = Object.assign({}, root.gridSplits || ({}));
                nextSplits[mode] = splits[mode];
                root.gridSplits = nextSplits;
                root.persist();
            }

            onVisibleChanged: {
                if (!visible) {
                    var remaining = [];
                    for (var i = 0; i < root.activeGridWindows.length; i++) {
                        var w = root.activeGridWindows[i];
                        if (w && w !== gridWin && w.visible)
                            remaining.push(w);
                    }
                    root.activeGridWindows = remaining;
                    gridWin.destroy();
                }
            }
        }
    }

    function openSectorAnalysis(sectorSym) {
        root.openSectorAnalysisWindow(sectorSym);
    }

    function openSectorBreadth() {
        root.openSectorAnalysisWindow("SMH");
    }

    function openSectorAnalysisWindow(sectorSym) {
        var sym = (sectorSym && typeof sectorSym === "string" && sectorSym.trim() !== "") ? sectorSym.trim().toUpperCase() : "SMH";
        root.close();

        if (root.activeSectorWindows && root.activeSectorWindows.length > 0) {
            for (var i = 0; i < root.activeSectorWindows.length; i++) {
                var existing = root.activeSectorWindows[i];
                if (existing && existing.visible) {
                    existing.sectorSymbol = sym;
                    existing.forceActiveFocus();
                    return;
                }
            }
        }

        var nextWindows = [];
        for (var j = 0; j < (root.activeSectorWindows || []).length; j++) {
            if (root.activeSectorWindows[j] && root.activeSectorWindows[j].visible)
                nextWindows.push(root.activeSectorWindows[j]);
        }

        var win = sectorAnalysisComponent.createObject(root, {
            sectorSymbol: sym,
            discordWebhook: root.discordWebhook,
            alertsMuted: root.alertsMuted,
            alertsMuteStatus: root.alertsMuteStatus,
            symbolLevels: root.symbolLevels || ({})
        });

        if (win) {
            win.quotes = root.quotes;
            win.chartCache = root.chartCache;
            win.chartFetchedAt = Object.assign({}, root.streamFetchedAt || ({}));
            if (typeof win.refreshViewportCharts === "function")
                win.refreshViewportCharts(false);
            nextWindows.push(win);
            root.activeSectorWindows = nextWindows;
        }
    }

    Component {
        id: sectorAnalysisComponent
        SectorAnalysisWindow {
            id: secWin
            visible: true
            discordWebhook: root.discordWebhook
            alertsMuted: root.alertsMuted
            alertsMuteStatus: root.alertsMuteStatus
            hubReady: root.streamReady
            hubStreamingActive: root.shouldStreamLive && root.streamConnected

            onHubChartFetchRequested: function (sym, tf, force) {
                var normSym = Model.normalizeSymbol(sym);
                var rk = String(tf || "1D");
                var k = normSym ? Model.cacheKey(normSym, rk) : "";
                var alreadyCached = (!force && k && root.chartCache && root.chartCache[k] && root.chartCache[k].length > 0);
                var dispatched = root.requestSharedChartFetch(sym, tf, force);
                if (k && (!dispatched || alreadyCached) && typeof secWin.clearHubPendingKey === "function")
                    secWin.clearHubPendingKey(k);
            }

            onHubSparkFetchRequested: function (symbols, lightweight) {
                root.requestSharedSparkFetch(symbols, lightweight);
            }

            onSubscribedSymbolsChanged: root.scheduleStreamSubSync()

            Connections {
                target: root
                function onCandleCacheUpdated(key) {
                    if (secWin.chartCache !== root.chartCache)
                        secWin.chartCache = root.chartCache;
                    if (key && root.streamFetchedAt && root.streamFetchedAt[key])
                        secWin.chartFetchedAt[key] = root.streamFetchedAt[key];
                    if (typeof secWin.notifyCacheKeyUpdated === "function")
                        secWin.notifyCacheKeyUpdated(key);
                }
                function onQuotesUpdated(changedSymbols) {
                    if (secWin.chartCache !== root.chartCache)
                        secWin.chartCache = root.chartCache;
                    if (secWin.quotes !== root.quotes)
                        secWin.quotes = root.quotes;
                    if (typeof secWin.notifyQuotesUpdated === "function")
                        secWin.notifyQuotesUpdated(changedSymbols);
                }
                function onSessionBoundaryCrossed(sessionState) {
                    if (typeof secWin.handleSessionBoundary === "function")
                        secWin.handleSessionBoundary(sessionState);
                }
            }

            onQuotesReceived: function (incoming) {
                root.quotes = Model.mergeQuotes(root.quotes, incoming);
                root.quotesUpdated(Object.keys(incoming || ({})));
                root.evaluateWatchlistPriceAlerts(incoming);
            }

            onChartDataReceived: function (key, candles, quoteEnriched) {
                root.updateSharedCandles(key, candles, quoteEnriched);
            }

            onSymbolLevelsChangedExternally: function (sym, nextLevels) {
                if (!sym)
                    return;
                var nextMap = Object.assign({}, root.symbolLevels || ({}));
                nextMap[sym] = nextLevels || [];
                root.symbolLevels = nextMap;
                root.syncActiveGridsAlertState();
                root.persist();
            }

            onAlertDispatchRequested: function (alert) {
                root.dispatchAlert(alert);
            }

            onAlertsMuteToggleRequested: root.toggleAlertsMute()

            onVisibleChanged: {
                if (!visible) {
                    var remaining = [];
                    for (var i = 0; i < (root.activeSectorWindows || []).length; i++) {
                        var w = root.activeSectorWindows[i];
                        if (w && w !== secWin && w.visible)
                            remaining.push(w);
                    }
                    root.activeSectorWindows = remaining;
                    secWin.destroy();
                }
            }
        }
    }
}
