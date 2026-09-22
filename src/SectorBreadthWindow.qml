import QtQuick
import QtQuick.Controls as QQC
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

FloatingWindow {
    id: root

    property var controller: null
    property string weightMode: "equal" // "equal" or "cap"
    property string sortTimeframe: "1Y" // "60", "1D", "1W", "1M", "1Y"
    property bool sortAsc: false

    property var equalMetrics: []
    property var capMetrics: []
    property var sectorsHoldings: ({})
    property var dailyCandlesMap: ({})
    property var hourlyCandlesMap: ({})
    property double lastFetchedAt: 0
    property var sectorsData: []

    property var hoveredCellInfo: null
    property real hoveredCellGlobalX: 0
    property real hoveredCellGlobalY: 0

    property bool loading: false
    property string statusText: ""

    // Fallback batch queue state
    property var pendingHoldingsFetches: []
    property var pendingDailyBatches: []
    property var pendingHourlyBatches: []
    property int totalDailyBatches: 0
    property int totalHourlyBatches: 0
    property string currentHoldingsSymbol: ""

    signal stateSaveRequested(string weightMode, string sortTimeframe, bool sortAsc)

    title: "Omafinance - Sector Strat Breadth"
    color: Color.background
    implicitWidth: Style.space(980)
    implicitHeight: Style.space(660)
    minimumSize: Qt.size(Style.space(780), Style.space(500))

    readonly property color foreground: Color.foreground
    readonly property color dim: Qt.darker(foreground, 1.45)
    readonly property color upColor: Qt.rgba(0.22, 0.50, 0.30, 1)
    readonly property color downColor: Qt.rgba(0.62, 0.22, 0.22, 1)
    readonly property string fontFamily: Style.font.family

    readonly property var timeframes: ["60", "1D", "1W", "1M", "1Y"]

    function chunkArray(arr, size) {
        var res = [];
        for (var i = 0; i < arr.length; i += size) {
            res.push(arr.slice(i, i + size));
        }
        return res;
    }

    function recalculateMetrics() {
        var rawList = root.weightMode === "cap" ? root.capMetrics : root.equalMetrics;
        if (!rawList || rawList.length === 0) {
            rawList = Model.computeAllSectorsBreadth(root.sectorsHoldings, root.hourlyCandlesMap, root.dailyCandlesMap, root.weightMode);
        }
        root.sectorsData = Model.sortSectorBreadth(rawList, root.sortTimeframe, root.sortAsc);
    }

    function startFullRefresh() {
        if (root.loading)
            return;
        root.loading = true;
        root.statusText = "Refreshing...";

        // High-speed parallel runner script via node (non-blocking background process)
        var home = Quickshell.env("HOME");
        var scriptPath = home + "/.config/omarchy/plugins/mohamedmansour.finance/scripts/fetch-breadth.js";
        runnerProc.command = ["node", scriptPath];
        runnerProc.running = true;
    }

    // Auto-refresh every 60 seconds while open
    Timer {
        id: autoRefreshTimer
        interval: 60000
        running: root.visible
        repeat: true
        onTriggered: {
            if (!root.loading)
                root.startFullRefresh();
        }
    }

    Process {
        id: runnerProc
        onExited: function (exitCode) {
            var raw = String(runnerStdout.text || "").trim();
            if (exitCode === 0 && raw) {
                try {
                    var data = JSON.parse(raw);
                    if (data && data.equalMetrics && data.capMetrics) {
                        root.equalMetrics = data.equalMetrics;
                        root.capMetrics = data.capMetrics;
                        if (data.sectorsHoldings)
                            root.sectorsHoldings = data.sectorsHoldings;
                        root.lastFetchedAt = Date.now();

                        if (root.controller) {
                            root.controller.breadthEqualMetrics = data.equalMetrics;
                            root.controller.breadthCapMetrics = data.capMetrics;
                            if (data.sectorsHoldings)
                                root.controller.sectorsHoldings = data.sectorsHoldings;
                            root.controller.breadthLastFetchedAt = root.lastFetchedAt;
                        }

                        root.recalculateMetrics();
                        root.loading = false;
                        var d = new Date();
                        root.statusText = "Updated " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                        return;
                    }
                } catch (e) {
                    console.log("[Breadth] Fast runner parse error:", e);
                }
            }

            // Fallback to sequential curl batch fetching
            console.log("[Breadth] Fast runner exited with", exitCode, ", falling back to curl batches");
            root.startFallbackCurlRefresh();
        }
        stdout: StdioCollector {
            id: runnerStdout
            waitForEnd: true
        }
    }

    // Fallback batch fetching
    function startFallbackCurlRefresh() {
        var sectors = Model.allSpdrSectorsList();
        var pending = [];
        for (var i = 0; i < sectors.length; i++) {
            pending.push(sectors[i].symbol);
        }
        root.pendingHoldingsFetches = pending;
        processNextHoldingsFetch();
    }

    function processNextHoldingsFetch() {
        if (root.pendingHoldingsFetches.length === 0) {
            var symSeen = {};
            var allConstituents = [];
            var sectors = Model.allSpdrSectorsList();
            for (var i = 0; i < sectors.length; i++) {
                var sym = sectors[i].symbol;
                var data = root.sectorsHoldings[sym];
                var hList = (data && data.holdings) ? data.holdings : [];
                for (var j = 0; j < hList.length; j++) {
                    var cSym = Model.normalizeSymbol(hList[j].symbol);
                    if (cSym && !hList[j].delisted && !symSeen[cSym]) {
                        symSeen[cSym] = true;
                        allConstituents.push(cSym);
                    }
                }
            }

            if (allConstituents.length === 0) {
                root.loading = false;
                root.statusText = "No constituents found";
                recalculateMetrics();
                return;
            }

            root.pendingDailyBatches = chunkArray(allConstituents, 20);
            root.pendingHourlyBatches = chunkArray(allConstituents, 20);
            root.totalDailyBatches = root.pendingDailyBatches.length;
            root.totalHourlyBatches = root.pendingHourlyBatches.length;
            root.statusText = "Fetching daily bars (0/" + root.totalDailyBatches + ")...";
            processNextDailyBatch();
            return;
        }

        var nextSym = root.pendingHoldingsFetches.shift();
        if (root.sectorsHoldings[nextSym] && root.sectorsHoldings[nextSym].holdings && root.sectorsHoldings[nextSym].holdings.length > 0) {
            Qt.callLater(processNextHoldingsFetch);
            return;
        }

        root.currentHoldingsSymbol = nextSym;
        root.statusText = "Loading " + nextSym + " (" + (11 - root.pendingHoldingsFetches.length) + "/11)...";
        holdingsFetchProc.command = ["curl", "-fsS", "--compressed", "--max-time", "12", "-A", "Omafinance research@omafinance.org", Model.holdingsUrl(nextSym)];
        holdingsFetchProc.running = true;
    }

    Process {
        id: holdingsFetchProc
        onExited: function (exitCode) {
            var raw = String(holdingsStdout.text || "").trim();
            if (exitCode === 0 && raw && root.currentHoldingsSymbol) {
                var parsed = Model.parseNportXml(raw, root.currentHoldingsSymbol);
                if (parsed && parsed.holdings && parsed.holdings.length > 0) {
                    var nextMap = Object.assign({}, root.sectorsHoldings);
                    nextMap[root.currentHoldingsSymbol] = parsed;
                    root.sectorsHoldings = nextMap;
                    if (root.controller) {
                        root.controller.sectorsHoldings = nextMap;
                    }
                }
            }
            Qt.callLater(root.processNextHoldingsFetch);
        }
        stdout: StdioCollector {
            id: holdingsStdout
            waitForEnd: true
        }
    }

    function processNextDailyBatch() {
        if (root.pendingDailyBatches.length === 0) {
            root.statusText = "Fetching 60m bars (0/" + root.totalHourlyBatches + ")...";
            processNextHourlyBatch();
            return;
        }

        var currentIdx = root.totalDailyBatches - root.pendingDailyBatches.length + 1;
        root.statusText = "Fetching daily bars (" + currentIdx + "/" + root.totalDailyBatches + ")...";
        var batch = root.pendingDailyBatches.shift();
        dailySparkProc.command = ["curl", "-fsS", "--max-time", "10", "-A", "Mozilla/5.0", Model.sparkCandlesUrl(batch, "1d", "2y")];
        dailySparkProc.running = true;
    }

    Process {
        id: dailySparkProc
        onExited: function (exitCode) {
            var raw = String(dailySparkStdout.text || "").trim();
            if (exitCode === 0 && raw) {
                var parsed = Model.parseSparkCandles(raw, "1d");
                var nextDaily = Object.assign({}, root.dailyCandlesMap);
                for (var sym in parsed) {
                    nextDaily[sym] = parsed[sym];
                }
                root.dailyCandlesMap = nextDaily;
                if (root.controller) {
                    root.controller.breadthDailyCandles = nextDaily;
                }
                root.recalculateMetrics();
            }
            Qt.callLater(root.processNextDailyBatch);
        }
        stdout: StdioCollector {
            id: dailySparkStdout
            waitForEnd: true
        }
    }

    function processNextHourlyBatch() {
        if (root.pendingHourlyBatches.length === 0) {
            root.loading = false;
            root.lastFetchedAt = Date.now();
            if (root.controller) {
                root.controller.breadthHourlyCandles = root.hourlyCandlesMap;
                root.controller.breadthLastFetchedAt = root.lastFetchedAt;
            }
            var d = new Date();
            root.statusText = "Updated " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            root.recalculateMetrics();
            return;
        }

        var currentIdx = root.totalHourlyBatches - root.pendingHourlyBatches.length + 1;
        root.statusText = "Fetching 60m bars (" + currentIdx + "/" + root.totalHourlyBatches + ")...";
        var batch = root.pendingHourlyBatches.shift();
        hourlySparkProc.command = ["curl", "-fsS", "--max-time", "10", "-A", "Mozilla/5.0", Model.sparkCandlesUrl(batch, "60m", "1mo")];
        hourlySparkProc.running = true;
    }

    Process {
        id: hourlySparkProc
        onExited: function (exitCode) {
            var raw = String(hourlySparkStdout.text || "").trim();
            if (exitCode === 0 && raw) {
                var parsed = Model.parseSparkCandles(raw, "60m");
                var nextHourly = Object.assign({}, root.hourlyCandlesMap);
                for (var sym in parsed) {
                    nextHourly[sym] = parsed[sym];
                }
                root.hourlyCandlesMap = nextHourly;
                if (root.controller) {
                    root.controller.breadthHourlyCandles = nextHourly;
                }
                root.recalculateMetrics();
            }
            Qt.callLater(root.processNextHourlyBatch);
        }
        stdout: StdioCollector {
            id: hourlySparkStdout
            waitForEnd: true
        }
    }

    function setWeightMode(mode) {
        if (root.weightMode === mode)
            return;
        root.weightMode = mode;
        root.recalculateMetrics();
        root.stateSaveRequested(root.weightMode, root.sortTimeframe, root.sortAsc);
    }

    function toggleSortTimeframe(tf) {
        if (root.sortTimeframe === tf) {
            root.sortAsc = !root.sortAsc;
        } else {
            root.sortTimeframe = tf;
            root.sortAsc = false;
        }
        root.recalculateMetrics();
        root.stateSaveRequested(root.weightMode, root.sortTimeframe, root.sortAsc);
    }

    Component.onCompleted: {
        root.recalculateMetrics();
        var hasCached = (root.equalMetrics && root.equalMetrics.length > 0) || Object.keys(root.dailyCandlesMap || {}).length > 0;
        var isStale = root.lastFetchedAt === 0 || (Date.now() - root.lastFetchedAt > 60000);
        if (!hasCached || isStale) {
            root.startFullRefresh();
        } else {
            var d = new Date(root.lastFetchedAt);
            root.statusText = "Updated " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
    }

    Item {
        id: mainContainer
        anchors.fill: parent
        anchors.margins: Style.space(16)

        // Top Toolbar
        Item {
            id: toolbar
            width: parent.width
            height: Style.space(40)
            anchors.top: parent.top

            // Left: Weight Mode Selector
            Row {
                id: weightModeRow
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.space(6)

                Rectangle {
                    width: eqLabel.implicitWidth + Style.space(16)
                    height: Style.space(28)
                    radius: Style.space(14)
                    color: root.weightMode === "equal" ? Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.18) : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.05)
                    border.color: root.weightMode === "equal" ? Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.35) : "transparent"
                    border.width: 1

                    Text {
                        id: eqLabel
                        anchors.centerIn: parent
                        text: "Equal Weight"
                        color: root.weightMode === "equal" ? root.foreground : root.dim
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall
                        font.bold: root.weightMode === "equal"
                    }

                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: root.setWeightMode("equal")
                    }
                }

                Rectangle {
                    width: capLabel.implicitWidth + Style.space(16)
                    height: Style.space(28)
                    radius: Style.space(14)
                    color: root.weightMode === "cap" ? Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.18) : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.05)
                    border.color: root.weightMode === "cap" ? Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.35) : "transparent"
                    border.width: 1

                    Text {
                        id: capLabel
                        anchors.centerIn: parent
                        text: "Cap Weight"
                        color: root.weightMode === "cap" ? root.foreground : root.dim
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall
                        font.bold: root.weightMode === "cap"
                    }

                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: root.setWeightMode("cap")
                    }
                }
            }

            // Right: Status & Refresh Button
            Row {
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.space(10)

                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    text: root.statusText
                    color: root.dim
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                }

                Rectangle {
                    width: Style.space(28)
                    height: Style.space(28)
                    radius: Style.space(14)
                    color: refreshArea.containsMouse ? Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.15) : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.06)

                    Text {
                        anchors.centerIn: parent
                        text: "\uf021"
                        color: root.loading ? Color.accent : (refreshArea.containsMouse ? root.foreground : root.dim)
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.body
                    }

                    MouseArea {
                        id: refreshArea
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: root.startFullRefresh()
                    }
                }
            }
        }

        // Table Header
        Item {
            id: tableHeader
            width: parent.width
            height: Style.space(34)
            anchors.top: toolbar.bottom
            anchors.topMargin: Style.space(8)

            readonly property real sectorWidth: Style.space(220)
            readonly property real colWidth: (width - sectorWidth) / 5

            Text {
                anchors.left: parent.left
                anchors.leftMargin: Style.space(8)
                anchors.verticalCenter: parent.verticalCenter
                text: "SECTOR"
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                font.bold: true
                font.letterSpacing: 1
            }

            Row {
                anchors.left: parent.left
                anchors.leftMargin: tableHeader.sectorWidth
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter

                Repeater {
                    model: root.timeframes

                    Item {
                        required property var modelData
                        required property int index
                        width: tableHeader.colWidth
                        height: tableHeader.height

                        readonly property bool isSorted: root.sortTimeframe === modelData

                        Rectangle {
                            anchors.fill: parent
                            anchors.margins: 2
                            radius: Style.space(6)
                            color: isSorted ? Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.12) : (colHeaderArea.containsMouse ? Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.05) : "transparent")

                            Row {
                                anchors.centerIn: parent
                                spacing: Style.space(4)

                                Text {
                                    text: modelData
                                    color: isSorted ? root.foreground : root.dim
                                    font.family: root.fontFamily
                                    font.pixelSize: Style.font.bodySmall
                                    font.bold: isSorted
                                }

                                Text {
                                    visible: isSorted
                                    text: root.sortAsc ? "▲" : "▼"
                                    color: isSorted ? root.foreground : root.dim
                                    font.family: root.fontFamily
                                    font.pixelSize: Style.font.bodySmall
                                }
                            }

                            MouseArea {
                                id: colHeaderArea
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: root.toggleSortTimeframe(modelData)
                            }
                        }
                    }
                }
            }
        }

        // Matrix Rows
        Flickable {
            id: scrollView
            anchors.top: tableHeader.bottom
            anchors.topMargin: Style.space(4)
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.bottom: parent.bottom
            contentWidth: width
            contentHeight: rowsColumn.implicitHeight
            clip: true

            Column {
                id: rowsColumn
                width: scrollView.width
                spacing: Style.space(4)

                Repeater {
                    model: root.sectorsData

                    Rectangle {
                        id: sectorRow
                        required property var modelData
                        required property int index
                        width: parent.width
                        height: Style.space(46)
                        radius: Style.space(6)
                        color: rowMouseArea.containsMouse ? Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.06) : (index % 2 === 1 ? Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.02) : "transparent")

                        readonly property real sectorWidth: Style.space(220)
                        readonly property real colWidth: (width - sectorWidth) / 5

                        // Sector Info Column (Clickable to open ETF detail in main panel)
                        Item {
                            id: sectorInfoCol
                            anchors.left: parent.left
                            anchors.leftMargin: Style.space(8)
                            width: sectorRow.sectorWidth - Style.space(12)
                            height: parent.height

                            MouseArea {
                                id: rowMouseArea
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: {
                                    if (root.controller && typeof root.controller.openDetail === "function") {
                                        root.controller.openDetail(sectorRow.modelData.symbol);
                                    }
                                }
                            }

                            Row {
                                anchors.verticalCenter: parent.verticalCenter
                                spacing: Style.space(8)

                                Text {
                                    text: sectorRow.modelData.symbol
                                    color: root.foreground
                                    font.family: root.fontFamily
                                    font.pixelSize: Style.font.body
                                    font.bold: true
                                }

                                Column {
                                    anchors.verticalCenter: parent.verticalCenter
                                    spacing: 1

                                    Text {
                                        text: sectorRow.modelData.name
                                        color: root.dim
                                        font.family: root.fontFamily
                                        font.pixelSize: Style.font.bodySmall
                                        elide: Text.ElideRight
                                        width: Style.space(130)
                                    }

                                    Text {
                                        text: sectorRow.modelData.holdingsCount > 0 ? (sectorRow.modelData.holdingsCount + " stocks") : ""
                                        color: Qt.darker(root.dim, 1.2)
                                        font.family: root.fontFamily
                                        font.pixelSize: Style.font.bodySmall - 2
                                    }
                                }
                            }
                        }

                        // Timeframe Matrix Cells
                        Row {
                            anchors.left: parent.left
                            anchors.leftMargin: sectorRow.sectorWidth
                            anchors.right: parent.right
                            anchors.verticalCenter: parent.verticalCenter

                            Repeater {
                                model: root.timeframes

                                Item {
                                    id: cellItem
                                    required property var modelData
                                    required property int index
                                    width: sectorRow.colWidth
                                    height: sectorRow.height

                                    readonly property var cellMetrics: (sectorRow.modelData.timeframes && sectorRow.modelData.timeframes[modelData]) ? sectorRow.modelData.timeframes[modelData] : null
                                    readonly property bool hasData: cellMetrics !== null && cellMetrics.totalCount > 0
                                    readonly property real netDelta: hasData ? Number(cellMetrics.netDelta) : 0
                                    readonly property string deltaText: hasData ? Model.formatNetDelta(netDelta) : "—"
                                    readonly property color deltaToneColor: {
                                        if (!hasData)
                                            return root.dim;
                                        if (netDelta > 0.05)
                                            return root.upColor;
                                        if (netDelta < -0.05)
                                            return root.downColor;
                                        return root.dim;
                                    }
                                    readonly property color cellBgColor: {
                                        if (!hasData)
                                            return Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.02);
                                        if (netDelta > 0.05)
                                            return Qt.rgba(root.upColor.r, root.upColor.g, root.upColor.b, 0.12);
                                        if (netDelta < -0.05)
                                            return Qt.rgba(root.downColor.r, root.downColor.g, root.downColor.b, 0.12);
                                        return Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.03);
                                    }

                                    Rectangle {
                                        id: cellRect
                                        anchors.fill: parent
                                        anchors.margins: Style.space(3)
                                        radius: Style.space(6)
                                        color: cellItem.cellBgColor
                                        border.color: cellMouseArea.containsMouse ? Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.3) : "transparent"
                                        border.width: 1

                                        Column {
                                            anchors.centerIn: parent
                                            spacing: Style.space(3)
                                            width: parent.width - Style.space(16)

                                            Text {
                                                anchors.horizontalCenter: parent.horizontalCenter
                                                text: cellItem.deltaText
                                                color: cellItem.deltaToneColor
                                                font.family: root.fontFamily
                                                font.pixelSize: Style.font.body
                                                font.bold: cellItem.hasData
                                            }

                                            // Dual-color ratio bar
                                            Item {
                                                anchors.horizontalCenter: parent.horizontalCenter
                                                width: parent.width
                                                height: Style.space(4)
                                                visible: cellItem.hasData

                                                readonly property real p2u: cellItem.cellMetrics ? Math.max(0, Math.min(100, cellItem.cellMetrics.pct2u)) : 0
                                                readonly property real p2d: cellItem.cellMetrics ? Math.max(0, Math.min(100, cellItem.cellMetrics.pct2d)) : 0
                                                readonly property real pOther: cellItem.cellMetrics ? Math.max(0, Math.min(100, cellItem.cellMetrics.pctOther)) : 0
                                                readonly property real totalP: p2u + p2d + pOther > 0 ? (p2u + p2d + pOther) : 100

                                                Rectangle {
                                                    anchors.fill: parent
                                                    radius: 2
                                                    color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.10)
                                                }

                                                Row {
                                                    anchors.fill: parent

                                                    Rectangle {
                                                        width: parent.width * (parent.p2u / parent.totalP)
                                                        height: parent.height
                                                        radius: 2
                                                        color: root.upColor
                                                    }

                                                    Rectangle {
                                                        width: parent.width * (parent.pOther / parent.totalP)
                                                        height: parent.height
                                                        color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.15)
                                                    }

                                                    Rectangle {
                                                        width: parent.width * (parent.p2d / parent.totalP)
                                                        height: parent.height
                                                        radius: 2
                                                        color: root.downColor
                                                    }
                                                }
                                            }
                                        }

                                        MouseArea {
                                            id: cellMouseArea
                                            anchors.fill: parent
                                            hoverEnabled: true
                                            onEntered: {
                                                var pos = cellRect.mapToItem(mainContainer, 0, 0);
                                                root.hoveredCellGlobalX = pos.x + cellRect.width / 2;
                                                root.hoveredCellGlobalY = pos.y;
                                                root.hoveredCellInfo = {
                                                    sectorSymbol: sectorRow.modelData.symbol,
                                                    sectorName: sectorRow.modelData.name,
                                                    timeframe: cellItem.modelData,
                                                    metrics: cellItem.cellMetrics
                                                };
                                            }
                                            onExited: {
                                                if (root.hoveredCellInfo && root.hoveredCellInfo.sectorSymbol === sectorRow.modelData.symbol && root.hoveredCellInfo.timeframe === cellItem.modelData) {
                                                    root.hoveredCellInfo = null;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Hover Tooltip Popup Overlay
        Item {
            id: tooltipOverlay
            anchors.fill: parent
            z: 999
            visible: root.hoveredCellInfo !== null

            Rectangle {
                id: tooltipBox
                visible: root.hoveredCellInfo !== null
                width: tooltipCol.implicitWidth + Style.space(24)
                height: tooltipCol.implicitHeight + Style.space(20)
                radius: Style.space(8)
                color: Qt.rgba(0.06, 0.06, 0.08, 0.96)
                border.color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.25)
                border.width: 1

                x: Math.max(Style.space(12), Math.min(mainContainer.width - width - Style.space(12), root.hoveredCellGlobalX - width / 2))
                y: root.hoveredCellGlobalY - height - Style.space(8) > Style.space(10) ? (root.hoveredCellGlobalY - height - Style.space(8)) : (root.hoveredCellGlobalY + Style.space(48))

                Column {
                    id: tooltipCol
                    anchors.centerIn: parent
                    spacing: Style.space(4)

                    Row {
                        spacing: Style.space(6)

                        Text {
                            text: root.hoveredCellInfo ? (root.hoveredCellInfo.sectorSymbol + " · " + root.hoveredCellInfo.sectorName) : ""
                            color: root.foreground
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.body
                            font.bold: true
                        }

                        Text {
                            text: root.hoveredCellInfo ? ("(" + root.hoveredCellInfo.timeframe + ")") : ""
                            color: Color.accent
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.body
                            font.bold: true
                        }
                    }

                    Text {
                        text: root.weightMode === "cap" ? "Mode: Cap Weight (% AUM)" : "Mode: Equal Weight (% Count)"
                        color: root.dim
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall - 1
                    }

                    Rectangle {
                        width: parent.width
                        height: 1
                        color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.12)
                    }

                    Row {
                        spacing: Style.space(8)
                        Text {
                            text: "▲ 2U (Buyers):"
                            color: root.upColor
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.bodySmall
                            font.bold: true
                        }
                        Text {
                            text: root.hoveredCellInfo && root.hoveredCellInfo.metrics && root.hoveredCellInfo.metrics.totalCount > 0 ? (root.hoveredCellInfo.metrics.pct2u.toFixed(1) + "% (" + root.hoveredCellInfo.metrics.count2u + " stocks)") : "-"
                            color: root.foreground
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.bodySmall
                        }
                    }

                    Row {
                        spacing: Style.space(8)
                        Text {
                            text: "▼ 2D (Sellers):"
                            color: root.downColor
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.bodySmall
                            font.bold: true
                        }
                        Text {
                            text: root.hoveredCellInfo && root.hoveredCellInfo.metrics && root.hoveredCellInfo.metrics.totalCount > 0 ? (root.hoveredCellInfo.metrics.pct2d.toFixed(1) + "% (" + root.hoveredCellInfo.metrics.count2d + " stocks)") : "-"
                            color: root.foreground
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.bodySmall
                        }
                    }

                    Row {
                        spacing: Style.space(8)
                        Text {
                            text: "■ 1/3 (Neutral):"
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.bodySmall
                            font.bold: true
                        }
                        Text {
                            text: root.hoveredCellInfo && root.hoveredCellInfo.metrics && root.hoveredCellInfo.metrics.totalCount > 0 ? (root.hoveredCellInfo.metrics.pctOther.toFixed(1) + "% (" + root.hoveredCellInfo.metrics.countOther + " stocks)") : "-"
                            color: root.foreground
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.bodySmall
                        }
                    }

                    Rectangle {
                        width: parent.width
                        height: 1
                        color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.12)
                    }

                    Row {
                        spacing: Style.space(8)
                        Text {
                            text: "Net Directional Delta:"
                            color: root.foreground
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.bodySmall
                            font.bold: true
                        }
                        Text {
                            readonly property bool hasData: root.hoveredCellInfo && root.hoveredCellInfo.metrics && root.hoveredCellInfo.metrics.totalCount > 0
                            readonly property real d: hasData ? Number(root.hoveredCellInfo.metrics.netDelta) : 0
                            text: hasData ? Model.formatNetDelta(d) : "-"
                            color: !hasData ? root.dim : (d > 0.05 ? root.upColor : (d < -0.05 ? root.downColor : root.dim))
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.bodySmall
                            font.bold: true
                        }
                    }
                }
            }
        }
    }
}
