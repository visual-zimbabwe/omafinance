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
    readonly property var sectorInfo: Model.getSectorInfo(root.sectorSymbol)
    readonly property string sectorFullName: sectorInfo ? sectorInfo.name : ""
    property string timeframe: "1W"
    property string scenarioFilter: ""
    property string sortField: "weight" // "weight", "mcap", "price", "change", "atr"
    property bool sortAscending: false
    property bool showBroadening: true
    property bool syncCrosshair: true

    property int activeTileIndex: 0
    property bool inDrillDown: false
    property string drillDownSymbol: ""

    property var holdings: []
    property var quotes: ({})
    property var chartCache: ({})
    property var symbolLevels: ({})
    property var pendingFetches: []
    property bool fetching: false

    property string discordWebhook: ""
    property bool alertsMuted: false
    property string alertsMuteStatus: ""

    signal alertDispatchRequested(var alert)
    signal alertsMuteToggleRequested
    signal symbolLevelsChangedExternally(string sym, var nextLevels)

    title: "Omafinance Sector Analysis - " + root.sectorSymbol + " (" + root.timeframe + ")"
    color: Color.background
    implicitWidth: Style.space(1360)
    implicitHeight: Style.space(880)
    minimumSize: Qt.size(Style.space(800), Style.space(550))

    readonly property color foreground: Color.foreground
    readonly property color dim: Qt.darker(foreground, 1.45)
    readonly property color upColor: Qt.rgba(0.22, 0.50, 0.30, 1)
    readonly property color downColor: Qt.rgba(0.62, 0.22, 0.22, 1)
    readonly property string fontFamily: Style.font.family

    Component.onCompleted: {
        loadHoldingsForSector(root.sectorSymbol);
    }

    onSectorSymbolChanged: {
        loadHoldingsForSector(root.sectorSymbol);
    }

    onTimeframeChanged: {
        refreshVisibleCharts(true);
    }

    function toggleSector() {
        root.sectorSymbol = (root.sectorSymbol === "SMH") ? "XLC" : "SMH";
    }

    function setSector(sym) {
        var norm = Model.normalizeSymbol(sym);
        if (norm && norm !== root.sectorSymbol) {
            root.sectorSymbol = norm;
        }
    }

    function setTimeframe(tf) {
        if (tf && tf !== root.timeframe) {
            root.timeframe = tf;
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
        var home = Quickshell.env("HOME") || "/home/juwimana";
        var fpath = home + "/.cache/omafinance/holdings/" + sym + ".json";
        holdingsProc.command = ["cat", fpath];
        holdingsProc.running = true;
    }

    Process {
        id: holdingsProc
        onExited: function (exitCode) {
            var raw = String(holdingsStdout.text || "").trim();
            if (exitCode === 0 && raw) {
                try {
                    var parsed = JSON.parse(raw);
                    if (parsed && Array.isArray(parsed.holdings)) {
                        root.holdings = parsed.holdings;
                        refreshBatchQuotes();
                        refreshVisibleCharts(false);
                    }
                } catch (e) {
                    console.log("[SectorAnalysis] Error parsing holdings:", e);
                }
            }
        }
        stdout: StdioCollector {
            id: holdingsStdout
            waitForEnd: true
        }
    }

    // Breadth Attack Metrics Calculation (Equal-Weighted, exactly matching Model.computeBasketAttackMetrics)
    readonly property var breadthMetrics: {
        var dailyCandlesMap = {};
        for (var i = 0; i < root.holdings.length; i++) {
            var h = root.holdings[i];
            if (h && h.symbol) {
                var sym = h.symbol;
                dailyCandlesMap[sym] = root.getCandles(sym, root.timeframe);
            }
        }
        return Model.computeBasketAttackMetrics(root.sectorSymbol, root.sectorFullName, "Sector", root.holdings, dailyCandlesMap, root.quotes, root.timeframe);
    }

    // Filter and Sort Engine
    readonly property var filteredTiles: {
        var list = [];
        var filterQuery = (root.scenarioFilter || "").trim();

        // 1. Sector ETF Benchmark Tile Candidate
        var etfSymbol = root.sectorSymbol;
        var etfCandles = root.getCandles(etfSymbol, root.timeframe);
        var etfQuote = root.quotes[etfSymbol] || null;
        var etfMatches = true;
        if (filterQuery.length > 0) {
            etfMatches = Model.matchesScenarioQuery(etfCandles, etfQuote, filterQuery);
        }
        if (etfMatches) {
            list.push({
                symbol: etfSymbol,
                name: root.sectorFullName + " (Sector ETF)",
                isEtf: true,
                pctVal: 100,
                valUSD: 0
            });
        }

        // 2. Component Holdings
        var matchedHoldings = [];
        for (var i = 0; i < root.holdings.length; i++) {
            var h = root.holdings[i];
            if (!h || !h.symbol || h.delisted)
                continue;
            var cSym = h.symbol;
            var cCandles = root.getCandles(cSym, root.timeframe);
            var cQuote = root.quotes[cSym] || null;

            var matches = true;
            if (filterQuery.length > 0) {
                matches = Model.matchesScenarioQuery(cCandles, cQuote, filterQuery);
            }
            if (matches) {
                matchedHoldings.push(h);
            }
        }

        // 3. Sort Component Holdings
        var sorted = Model.sortSectorHoldings(matchedHoldings, root.sortField, root.sortAscending ? "asc" : "desc", root.quotes);
        for (var j = 0; j < sorted.length; j++) {
            list.push(sorted[j]);
        }

        return list;
    }

    readonly property int totalHoldingsCount: root.holdings.length
    readonly property int matchingHoldingsCount: {
        var count = 0;
        for (var i = 0; i < filteredTiles.length; i++) {
            if (!filteredTiles[i].isEtf)
                count++;
        }
        return count;
    }

    // Live Batch Quotes (2-second interval)
    function getAllSymbols() {
        var syms = [root.sectorSymbol];
        for (var i = 0; i < root.holdings.length; i++) {
            var h = root.holdings[i];
            if (h && h.symbol && syms.indexOf(h.symbol) === -1)
                syms.push(h.symbol);
        }
        return syms;
    }

    function refreshBatchQuotes() {
        var syms = getAllSymbols();
        if (syms.length === 0 || quoteProc.running)
            return;
        quoteProc.command = ["curl", "-fsS", "--max-time", "8", "-A", "Mozilla/5.0", Model.sparkUrl(syms)];
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
                        root.quotes = Object.assign({}, root.quotes, parsed);
                    }
                } catch (e) {
                    console.log("[SectorAnalysis] Error parsing spark quotes:", e);
                }
            }
        }
        stdout: StdioCollector {
            id: quoteStdout
            waitForEnd: true
        }
    }

    Timer {
        id: quoteRefreshTimer
        interval: 2000
        running: root.visible
        repeat: true
        onTriggered: root.refreshBatchQuotes()
    }

    // Chart Fetch Engine
    function cacheKey(sym, tf) {
        return sym + ":" + tf;
    }

    function getCandles(sym, tf) {
        var key = cacheKey(sym, tf);
        return root.chartCache[key] || [];
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

    function processNextFetch() {
        if (root.pendingFetches.length === 0)
            return;
        var next = root.pendingFetches.shift();
        currentFetchSymbol = next.symbol;
        currentFetchRange = next.rangeKey;

        var rangeSpec = Model.chartSpec(currentFetchRange);
        if (!rangeSpec) {
            processNextFetch();
            return;
        }
        var cmd = Model.chartCommand(currentFetchSymbol, currentFetchRange, rangeSpec);
        chartFetchProc.command = cmd;
        chartFetchProc.running = true;
    }

    Process {
        id: chartFetchProc
        onExited: function (exitCode) {
            var raw = String(chartFetchStdout.text || "").trim();
            if (exitCode === 0 && raw) {
                try {
                    var candles = Model.parseChart(raw, currentFetchRange);
                    if (candles && candles.length > 0) {
                        var k = cacheKey(currentFetchSymbol, currentFetchRange);
                        var nextCache = Object.assign({}, root.chartCache);
                        nextCache[k] = candles;
                        root.chartCache = nextCache;
                    }
                } catch (e) {
                    console.log("[SectorAnalysis] Chart parse error:", currentFetchSymbol, currentFetchRange, e);
                }
            }
            if (root.pendingFetches.length > 0)
                processNextFetch();
        }
        stdout: StdioCollector {
            id: chartFetchStdout
            waitForEnd: true
        }
    }

    function refreshVisibleCharts(force) {
        var syms = getAllSymbols();
        for (var i = 0; i < syms.length; i++) {
            requestChartFetch(syms[i], root.timeframe, force);
            requestChartFetch(syms[i], "60", force);
            requestChartFetch(syms[i], "1D", force);
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
            if (event.key === Qt.Key_Slash) {
                scenarioField.forceActiveFocus();
                scenarioField.selectAll();
                event.accepted = true;
                return;
            }
            if (event.key === Qt.Key_Escape) {
                if (root.inDrillDown) {
                    root.inDrillDown = false;
                    event.accepted = true;
                    return;
                }
                if (scenarioField.activeFocus) {
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
            height: Style.space(64)
            color: Color.background
            z: 10

            Column {
                anchors.fill: parent
                anchors.leftMargin: Style.space(12)
                anchors.rightMargin: Style.space(12)
                anchors.topMargin: Style.space(6)
                spacing: Style.space(4)

                // Top Controls Row
                Row {
                    width: parent.width
                    height: Style.space(28)
                    spacing: Style.space(16)

                    // GROUP 1: Target & Context
                    Row {
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
                        Rectangle {
                            width: Style.space(60)
                            height: Style.space(24)
                            radius: Style.space(4)
                            color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.08)
                            border.color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.20)
                            border.width: 1
                            anchors.verticalCenter: parent.verticalCenter

                            TextInput {
                                id: sectorInput
                                anchors.centerIn: parent
                                text: root.sectorSymbol
                                color: root.foreground
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.bodySmall
                                font.bold: true
                                selectByMouse: true
                                onAccepted: {
                                    root.setSector(text);
                                    keyboardListener.forceActiveFocus();
                                }
                            }

                            MouseArea {
                                anchors.fill: parent
                                cursorShape: Qt.PointingHandCursor
                                acceptedButtons: Qt.RightButton
                                onClicked: root.toggleSector()
                            }
                        }

                        // Sector Full Name
                        Text {
                            textFormat: Text.PlainText
                            text: root.sectorFullName
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            elide: Text.ElideRight
                            width: Math.min(implicitWidth, Style.space(260))
                            anchors.verticalCenter: parent.verticalCenter
                        }

                        Text {
                            textFormat: Text.PlainText
                            text: "·"
                            color: root.dim
                            anchors.verticalCenter: parent.verticalCenter
                        }

                        // Timeframe Selector
                        Text {
                            textFormat: Text.PlainText
                            text: "TIMEFRAME:"
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.bodySmall
                            font.bold: true
                            anchors.verticalCenter: parent.verticalCenter
                        }

                        Row {
                            spacing: Style.space(4)
                            anchors.verticalCenter: parent.verticalCenter

                            Repeater {
                                model: ["30", "60", "1D", "1W", "1M"]

                                Rectangle {
                                    required property string modelData
                                    width: Style.space(32)
                                    height: Style.space(22)
                                    radius: Style.space(3)
                                    color: modelData === root.timeframe ? Color.accent : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.08)

                                    Text {
                                        anchors.centerIn: parent
                                        textFormat: Text.PlainText
                                        text: modelData
                                        color: modelData === root.timeframe ? Color.background : root.foreground
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
                    }

                    // GROUP 2: Strat Filtering & Controls
                    Row {
                        anchors.verticalCenter: parent.verticalCenter
                        spacing: Style.space(8)

                        Text {
                            textFormat: Text.PlainText
                            text: "SCENARIO:"
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.bodySmall
                            font.bold: true
                            anchors.verticalCenter: parent.verticalCenter
                        }

                        // Scenario Filter Input (/ shortcut)
                        Rectangle {
                            width: Style.space(200)
                            height: Style.space(24)
                            radius: Style.space(4)
                            color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.08)
                            border.color: scenarioField.activeFocus ? Color.accent : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.20)
                            border.width: 1
                            anchors.verticalCenter: parent.verticalCenter

                            TextInput {
                                id: scenarioField
                                anchors.fill: parent
                                anchors.leftMargin: Style.space(6)
                                anchors.rightMargin: Style.space(20)
                                verticalAlignment: TextInput.AlignVCenter
                                text: root.scenarioFilter
                                color: root.foreground
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.caption
                                selectByMouse: true

                                onTextChanged: {
                                    filterDebounceTimer.restart();
                                }
                                Keys.onPressed: function (ev) {
                                    if (ev.key === Qt.Key_Down || ev.key === Qt.Key_Tab) {
                                        keyboardListener.forceActiveFocus();
                                        ev.accepted = true;
                                    }
                                }
                            }

                            Text {
                                visible: root.scenarioFilter.length === 0 && !scenarioField.activeFocus
                                text: "1, hammer, 2dg... (/)"
                                color: Qt.rgba(root.dim.r, root.dim.g, root.dim.b, 0.5)
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.caption
                                anchors.left: parent.left
                                anchors.leftMargin: Style.space(6)
                                anchors.verticalCenter: parent.verticalCenter
                            }

                            Text {
                                visible: root.scenarioFilter.length > 0
                                text: "✕"
                                color: root.dim
                                font.pixelSize: Style.font.caption
                                anchors.right: parent.right
                                anchors.rightMargin: Style.space(6)
                                anchors.verticalCenter: parent.verticalCenter

                                MouseArea {
                                    anchors.fill: parent
                                    anchors.margins: -Style.space(4)
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: {
                                        scenarioField.text = "";
                                        root.scenarioFilter = "";
                                    }
                                }
                            }
                        }

                        // Sort Selector Button
                        Rectangle {
                            height: Style.space(24)
                            implicitWidth: sortText.implicitWidth + Style.space(16)
                            radius: Style.space(4)
                            color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.08)
                            border.color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.20)
                            border.width: 1
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

                        // Global Broadening Formations Toggle
                        Rectangle {
                            height: Style.space(24)
                            implicitWidth: bfText.implicitWidth + Style.space(14)
                            radius: Style.space(4)
                            color: root.showBroadening ? Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.18) : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.08)
                            border.color: root.showBroadening ? Color.accent : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.20)
                            border.width: 1
                            anchors.verticalCenter: parent.verticalCenter

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
                }

                // GROUP 3: Breadth HUD & Showing Counter
                Row {
                    width: parent.width
                    height: Style.space(20)

                    Row {
                        spacing: Style.space(8)
                        anchors.verticalCenter: parent.verticalCenter

                        Text {
                            textFormat: Text.PlainText
                            text: "BREADTH:"
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                            anchors.verticalCenter: parent.verticalCenter
                        }

                        // 2u Metric
                        Row {
                            spacing: Style.space(3)
                            anchors.verticalCenter: parent.verticalCenter

                            Text {
                                textFormat: Text.PlainText
                                text: "2u: " + Math.round(root.breadthMetrics.pct2u) + "%"
                                color: root.breadthMetrics.pct2u >= 60 ? root.upColor : root.foreground
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.caption
                                font.bold: true
                            }

                            Text {
                                textFormat: Text.PlainText
                                text: root.breadthMetrics.count2u + "/" + root.breadthMetrics.totalHoldings
                                color: root.dim
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.caption
                            }
                        }

                        Text {
                            textFormat: Text.PlainText
                            text: "|"
                            color: Qt.rgba(root.dim.r, root.dim.g, root.dim.b, 0.3)
                            anchors.verticalCenter: parent.verticalCenter
                        }

                        // 2d Metric
                        Row {
                            spacing: Style.space(3)
                            anchors.verticalCenter: parent.verticalCenter

                            Text {
                                textFormat: Text.PlainText
                                text: "2d: " + Math.round(root.breadthMetrics.pct2d) + "%"
                                color: root.breadthMetrics.pct2d >= 60 ? root.downColor : root.foreground
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.caption
                                font.bold: true
                            }

                            Text {
                                textFormat: Text.PlainText
                                text: root.breadthMetrics.count2d + "/" + root.breadthMetrics.totalHoldings
                                color: root.dim
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.caption
                            }
                        }
                    }

                    Item {
                        width: masterHeader.width - parent.children[0].implicitWidth - showingTextItem.implicitWidth - Style.space(24)
                        height: 1
                    }

                    // Showing Count
                    Item {
                        id: showingTextItem
                        implicitWidth: showingText.implicitWidth
                        implicitHeight: showingText.implicitHeight
                        anchors.verticalCenter: parent.verticalCenter

                        Text {
                            id: showingText
                            textFormat: Text.PlainText
                            text: "Showing: " + root.matchingHoldingsCount + "/" + root.totalHoldingsCount
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                        }
                    }
                }
            }
        }

        // 1px Hairline Divider
        Rectangle {
            width: parent.width
            height: 1
            color: Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.12)
        }

        // VIEWPORT CONTAINER (Swaps between 1x1 Dynamic Flex Grid and Drill-Down)
        Item {
            id: mainContainer
            width: parent.width
            height: parent.height - masterHeader.height - 1

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
                    rows: gridViewport.rows
                    spacing: 0

                    Repeater {
                        model: root.filteredTiles

                        Item {
                            id: tileWrapper
                            required property var modelData
                            required property int index

                            width: gridViewport.cellWidth
                            height: gridViewport.cellHeight

                            // Hairline Border
                            Rectangle {
                                anchors.fill: parent
                                color: "transparent"
                                border.width: 1
                                border.color: root.activeTileIndex === tileWrapper.index ? Color.accent : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.12)
                                z: 5
                            }

                            // 100% Native Omafinance GridCell
                            GridCell {
                                id: cellInstance
                                anchors.fill: parent
                                cellIndex: tileWrapper.index
                                symbol: tileWrapper.modelData.symbol
                                companyName: tileWrapper.modelData.name || ""
                                timeframe: root.timeframe
                                showBroadening: root.showBroadening
                                hideStratBadge: true
                                activeFocusCell: root.activeTileIndex === tileWrapper.index

                                quote: root.quotes[tileWrapper.modelData.symbol] || null
                                candles: root.getCandles(tileWrapper.modelData.symbol, root.timeframe)
                                hourlyCandles: root.getCandles(tileWrapper.modelData.symbol, "60")
                                dailyCandles: root.getCandles(tileWrapper.modelData.symbol, "1D")
                                priceLevels: root.symbolLevels[tileWrapper.modelData.symbol] || []

                                onFocusRequested: function (idx) {
                                    root.activeTileIndex = idx;
                                    keyboardListener.forceActiveFocus();
                                }
                                onMaximizeRequested: function (idx) {
                                    root.drillDownSymbol = tileWrapper.modelData.symbol;
                                    root.inDrillDown = true;
                                }
                                onCrosshairMoved: function (ts, pr, c) {
                                    if (root.syncCrosshair) {
                                        root.broadcastCrosshair(tileWrapper.modelData.symbol, ts, pr, c);
                                    }
                                }
                                onCrosshairCleared: {
                                    if (root.syncCrosshair) {
                                        root.clearCrosshair();
                                    }
                                }
                            }
                        }
                    }
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

                            Rectangle {
                                width: backText.implicitWidth + Style.space(16)
                                height: Style.space(22)
                                radius: Style.space(3)
                                color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.12)
                                border.color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.25)
                                border.width: 1

                                Text {
                                    id: backText
                                    anchors.centerIn: parent
                                    textFormat: Text.PlainText
                                    text: "← BACK TO SECTOR GRID (Esc)"
                                    color: root.foreground
                                    font.family: root.fontFamily
                                    font.pixelSize: Style.font.caption
                                    font.bold: true
                                }

                                MouseArea {
                                    anchors.fill: parent
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: root.inDrillDown = false
                                }
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
                                quote: root.quotes[root.drillDownSymbol] || null
                                candles: root.getCandles(root.drillDownSymbol, "30")
                                hourlyCandles: root.getCandles(root.drillDownSymbol, "60")
                                dailyCandles: root.getCandles(root.drillDownSymbol, "1D")
                            }

                            GridCell {
                                width: parent.width * 0.5
                                height: parent.height
                                x: parent.width * 0.5
                                symbol: root.drillDownSymbol
                                timeframe: "60"
                                showBroadening: root.showBroadening
                                quote: root.quotes[root.drillDownSymbol] || null
                                candles: root.getCandles(root.drillDownSymbol, "60")
                                hourlyCandles: root.getCandles(root.drillDownSymbol, "60")
                                dailyCandles: root.getCandles(root.drillDownSymbol, "1D")
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
                                quote: root.quotes[root.drillDownSymbol] || null
                                candles: root.getCandles(root.drillDownSymbol, "1D")
                                hourlyCandles: root.getCandles(root.drillDownSymbol, "60")
                                dailyCandles: root.getCandles(root.drillDownSymbol, "1D")
                            }

                            GridCell {
                                width: parent.width * 0.333
                                height: parent.height
                                x: parent.width * 0.333
                                symbol: root.drillDownSymbol
                                timeframe: "1W"
                                showBroadening: root.showBroadening
                                quote: root.quotes[root.drillDownSymbol] || null
                                candles: root.getCandles(root.drillDownSymbol, "1W")
                                hourlyCandles: root.getCandles(root.drillDownSymbol, "60")
                                dailyCandles: root.getCandles(root.drillDownSymbol, "1D")
                            }

                            GridCell {
                                width: parent.width * 0.334
                                height: parent.height
                                x: parent.width * 0.666
                                symbol: root.drillDownSymbol
                                timeframe: "1M"
                                showBroadening: root.showBroadening
                                quote: root.quotes[root.drillDownSymbol] || null
                                candles: root.getCandles(root.drillDownSymbol, "1M")
                                hourlyCandles: root.getCandles(root.drillDownSymbol, "60")
                                dailyCandles: root.getCandles(root.drillDownSymbol, "1D")
                            }
                        }
                    }
                }
            }
        }
    }

    Timer {
        id: filterDebounceTimer
        interval: 100
        repeat: false
        onTriggered: {
            root.scenarioFilter = scenarioField.text;
            root.activeTileIndex = 0;
        }
    }
}
