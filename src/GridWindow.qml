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

    property int activeCellIndex: 0
    property var cellSymbols: ["AAPL", "AAPL", "AAPL", "AAPL", "AAPL"]
    property var cellTimeframes: ["60", "1D", "1W", "1M", "1Y"]

    // Split Ratios
    property real rowSplitRatio: 0.5
    property real topColSplitRatio: 0.5
    property real botColSplitRatio: 0.5
    property real botCol1Ratio: 0.333
    property real botCol2Ratio: 0.333

    // Quotes and Candles Cache
    property var quotes: ({})
    property var chartCache: ({})
    property var pendingFetches: []
    property bool fetching: false

    signal stateSaveRequested(string mode, var sync, var symbols, var splits)

    title: root.mainSymbol ? "Omafinance Grid - " + root.mainSymbol : "Omafinance Grid"
    color: Color.background
    implicitWidth: Style.space(1200)
    implicitHeight: Style.space(750)
    minimumSize: Qt.size(Style.space(700), Style.space(500))

    readonly property color foreground: Color.foreground
    readonly property color dim: Qt.darker(foreground, 1.45)
    readonly property color upColor: Qt.rgba(0.22, 0.50, 0.30, 1)
    readonly property color downColor: Qt.rgba(0.62, 0.22, 0.22, 1)
    readonly property string fontFamily: Style.font.family

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

    function cacheKey(sym, tf) {
        return sym + "_" + tf;
    }

    function getCandles(sym, tf) {
        var key = cacheKey(sym, tf);
        return root.chartCache[key] || [];
    }

    function requestChartFetch(sym, tf) {
        var key = cacheKey(sym, tf);
        if (root.chartCache[key])
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

    function processNextFetch() {
        if (root.pendingFetches.length === 0)
            return;
        var next = root.pendingFetches.shift();
        currentFetchSymbol = next.symbol;
        currentFetchRange = next.rangeKey;
        chartFetchProc.command = ["curl", "-fsS", "--max-time", "8", "-A", "Mozilla/5.0", Model.chartUrl(next.symbol, next.rangeKey)];
        chartFetchProc.running = true;
    }

    property string currentFetchSymbol: ""
    property string currentFetchRange: ""

    Process {
        id: chartFetchProc
        onExited: function (exitCode) {
            if (exitCode === 0 && chartFetchStdout.text) {
                var parsed = Model.parseChart(chartFetchStdout.text, root.currentFetchRange);
                if (parsed && parsed.candles) {
                    var key = root.cacheKey(root.currentFetchSymbol, root.currentFetchRange);
                    var nextCache = Object.assign({}, root.chartCache);
                    nextCache[key] = parsed.candles;
                    root.chartCache = nextCache;

                    if (parsed.quote) {
                        var nextQuotes = Object.assign({}, root.quotes);
                        nextQuotes[root.currentFetchSymbol] = parsed.quote;
                        root.quotes = nextQuotes;
                    }
                }
            }
            if (root.pendingFetches.length > 0)
                Qt.callLater(root.processNextFetch);
        }
        stdout: StdioCollector {
            id: chartFetchStdout
            waitForEnd: true
        }
    }

    function refreshAllCharts() {
        if (root.gridMode === "1x1") {
            var sym1 = symbolForCell(root.activeCellIndex);
            var tf1 = timeframeForCell(root.activeCellIndex);
            requestChartFetch(sym1, tf1);
            return;
        }
        var count = root.gridMode === "2+3" ? 5 : 4;
        for (var i = 0; i < count; i++) {
            var sym = symbolForCell(i);
            var tf = timeframeForCell(i);
            requestChartFetch(sym, tf);
        }
    }

    function handleCrosshairMoved(sourceIndex, timestamp, price, candle) {
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

    function toggleMaximize(index) {
        if (root.gridMode === "1x1") {
            root.gridMode = root.previousGridMode;
        } else {
            root.previousGridMode = root.gridMode;
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
            time: root.syncTime
        };
        root.stateSaveRequested(root.gridMode, sync, root.cellSymbols, splits);
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
        refreshAllCharts();
        Qt.callLater(function () {
            var item = root.getActiveCellItem();
            if (item)
                item.forceActiveFocus();
        });
    }

    onVisibleChanged: {
        if (visible) {
            Qt.callLater(function () {
                var item = root.getActiveCellItem();
                if (item)
                    item.forceActiveFocus();
            });
        }
    }

    onActiveCellIndexChanged: {
        Qt.callLater(function () {
            var item = root.getActiveCellItem();
            if (item)
                item.forceActiveFocus();
        });
    }

    onMainSymbolChanged: refreshAllCharts()
    onGridModeChanged: {
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
            var inputActive = activeCell && (activeCell.searching || activeCell.changingInterval);

            if (inputActive) {
                if (event.key === Qt.Key_Escape) {
                    if (activeCell.searching)
                        activeCell.dismissSearch();
                    else if (activeCell.changingInterval)
                        activeCell.dismissIntervalInput();
                    event.accepted = true;
                }
                return;
            }

            if (event.key === Qt.Key_Escape) {
                if (root.gridExpanded) {
                    root.gridExpanded = false;
                    event.accepted = true;
                    return;
                }
                if (root.gridMode === "1x1") {
                    root.gridMode = root.previousGridMode;
                    event.accepted = true;
                } else {
                    root.visible = false;
                    event.accepted = true;
                }
            } else if (event.key === Qt.Key_Tab) {
                var maxIdx = root.gridMode === "2+3" ? 4 : (root.gridMode === "2x2" ? 3 : 0);
                root.activeCellIndex = (root.activeCellIndex + 1) % (maxIdx + 1);
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

            // Master Text Control Header (Zero-Chrome)
            Item {
                id: masterHeader
                width: parent.width
                height: Style.space(36)

                // Grid Layout Selector (Left-aligned, collapsible)
                Row {
                    id: gridLayoutRow
                    anchors.left: parent.left
                    anchors.leftMargin: Style.space(12)
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: Style.space(8)

                    Text {
                        text: "GRID"
                        color: root.dim
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall
                        font.bold: true
                    }

                    Item {
                        id: gridLayoutContainer
                        implicitWidth: root.gridExpanded ? expandedGridRow.implicitWidth : activeGridLabel.implicitWidth
                        implicitHeight: Math.max(activeGridLabel.implicitHeight, expandedGridRow.implicitHeight)
                        anchors.verticalCenter: parent.verticalCenter

                        Text {
                            id: activeGridLabel
                            visible: !root.gridExpanded
                            anchors.verticalCenter: parent.verticalCenter
                            textFormat: Text.PlainText
                            text: root.gridMode
                            color: root.foreground
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.bodySmall
                            font.bold: true

                            MouseArea {
                                anchors.fill: parent
                                anchors.margins: -Style.space(4)
                                cursorShape: Qt.PointingHandCursor
                                hoverEnabled: true
                                onClicked: {
                                    root.gridExpanded = true;
                                }
                            }
                        }

                        Row {
                            id: expandedGridRow
                            visible: root.gridExpanded
                            spacing: Style.space(6)
                            anchors.verticalCenter: parent.verticalCenter

                            Repeater {
                                model: ["2x2", "2+3", "1x1"]

                                Text {
                                    required property string modelData
                                    textFormat: Text.PlainText
                                    text: modelData
                                    color: modelData === root.gridMode ? root.foreground : Qt.rgba(root.dim.r, root.dim.g, root.dim.b, 0.45)
                                    font.family: root.fontFamily
                                    font.pixelSize: Style.font.bodySmall
                                    font.bold: modelData === root.gridMode

                                    MouseArea {
                                        anchors.fill: parent
                                        anchors.margins: -Style.space(4)
                                        cursorShape: Qt.PointingHandCursor
                                        hoverEnabled: true
                                        onClicked: {
                                            root.gridMode = modelData;
                                            if (!root.syncTimeframe) {
                                                root.cellTimeframes = Model.gridTimeframes(modelData);
                                            }
                                            root.gridExpanded = false;
                                            root.refreshAllCharts();
                                            root.saveGridState();
                                        }
                                    }
                                }
                            }
                        }
                    }

                    HoverHandler {
                        id: gridLayoutHover
                        onHoveredChanged: {
                            if (!hovered)
                                root.gridExpanded = false;
                        }
                    }
                }

                // Sync Toggles (Right-aligned)
                Row {
                    anchors.right: parent.right
                    anchors.rightMargin: Style.space(12)
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: Style.space(10)

                    Text {
                        text: "SYNC"
                        color: root.dim
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall
                        font.bold: true
                    }

                    Text {
                        textFormat: Text.PlainText
                        text: "SYM " + (root.syncSymbol ? "[ON]" : "[OFF]")
                        color: root.syncSymbol ? root.foreground : root.dim
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall
                        font.bold: root.syncSymbol

                        MouseArea {
                            anchors.fill: parent
                            anchors.margins: -Style.space(4)
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                root.syncSymbol = !root.syncSymbol;
                                if (root.syncSymbol) {
                                    var currentSym = root.symbolForCell(root.activeCellIndex);
                                    root.mainSymbol = currentSym;
                                    var nextSymbols = [];
                                    for (var i = 0; i < 5; i++)
                                        nextSymbols.push(currentSym);
                                    root.cellSymbols = nextSymbols;
                                }
                                root.refreshAllCharts();
                                root.saveGridState();
                            }
                        }
                    }

                    Text {
                        textFormat: Text.PlainText
                        text: "TF " + (root.syncTimeframe ? "[ON]" : "[OFF]")
                        color: root.syncTimeframe ? root.foreground : root.dim
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall
                        font.bold: root.syncTimeframe

                        MouseArea {
                            anchors.fill: parent
                            anchors.margins: -Style.space(4)
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                root.syncTimeframe = !root.syncTimeframe;
                                if (root.syncTimeframe) {
                                    var currentTf = root.timeframeForCell(root.activeCellIndex);
                                    var nextTfs = [];
                                    for (var i = 0; i < 5; i++)
                                        nextTfs.push(currentTf);
                                    root.cellTimeframes = nextTfs;
                                } else {
                                    root.cellTimeframes = Model.gridTimeframes(root.gridMode === "1x1" ? root.previousGridMode : root.gridMode);
                                }
                                root.refreshAllCharts();
                                root.saveGridState();
                            }
                        }
                    }

                    Text {
                        textFormat: Text.PlainText
                        text: "CROSS " + (root.syncCrosshair ? "[ON]" : "[OFF]")
                        color: root.syncCrosshair ? root.foreground : root.dim
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall
                        font.bold: root.syncCrosshair

                        MouseArea {
                            anchors.fill: parent
                            anchors.margins: -Style.space(4)
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                root.syncCrosshair = !root.syncCrosshair;
                                root.saveGridState();
                            }
                        }
                    }

                    Text {
                        textFormat: Text.PlainText
                        text: "TIME " + (root.syncTime ? "[ON]" : "[OFF]")
                        color: root.syncTime ? root.foreground : root.dim
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall
                        font.bold: root.syncTime

                        MouseArea {
                            anchors.fill: parent
                            anchors.margins: -Style.space(4)
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                root.syncTime = !root.syncTime;
                                root.saveGridState();
                            }
                        }
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
                        quote: root.quotes[symbol] || null
                        candles: root.getCandles(symbol, timeframe)
                        activeFocusCell: true

                        onFocusRequested: function (idx) {
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
                            quote: root.quotes[symbol] || null
                            candles: root.getCandles(symbol, timeframe)
                            activeFocusCell: root.activeCellIndex === 0

                            onFocusRequested: function (idx) {
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
                            onCrosshairMoved: function (ts, pr, c) {
                                root.handleCrosshairMoved(0, ts, pr, c);
                            }
                            onCrosshairCleared: {
                                root.handleCrosshairCleared(0);
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
                            quote: root.quotes[symbol] || null
                            candles: root.getCandles(symbol, timeframe)
                            activeFocusCell: root.activeCellIndex === 1

                            onFocusRequested: function (idx) {
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
                            onCrosshairMoved: function (ts, pr, c) {
                                root.handleCrosshairMoved(1, ts, pr, c);
                            }
                            onCrosshairCleared: {
                                root.handleCrosshairCleared(1);
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
                                quote: root.quotes[symbol] || null
                                candles: root.getCandles(symbol, timeframe)
                                activeFocusCell: root.activeCellIndex === 2

                                onFocusRequested: function (idx) {
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
                                onCrosshairMoved: function (ts, pr, c) {
                                    root.handleCrosshairMoved(2, ts, pr, c);
                                }
                                onCrosshairCleared: {
                                    root.handleCrosshairCleared(2);
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
                                quote: root.quotes[symbol] || null
                                candles: root.getCandles(symbol, timeframe)
                                activeFocusCell: root.activeCellIndex === 3

                                onFocusRequested: function (idx) {
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
                                onCrosshairMoved: function (ts, pr, c) {
                                    root.handleCrosshairMoved(3, ts, pr, c);
                                }
                                onCrosshairCleared: {
                                    root.handleCrosshairCleared(3);
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
                                quote: root.quotes[symbol] || null
                                candles: root.getCandles(symbol, timeframe)
                                activeFocusCell: root.activeCellIndex === 2

                                onFocusRequested: function (idx) {
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
                                onCrosshairMoved: function (ts, pr, c) {
                                    root.handleCrosshairMoved(2, ts, pr, c);
                                }
                                onCrosshairCleared: {
                                    root.handleCrosshairCleared(2);
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
                                quote: root.quotes[symbol] || null
                                candles: root.getCandles(symbol, timeframe)
                                activeFocusCell: root.activeCellIndex === 3

                                onFocusRequested: function (idx) {
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
                                onCrosshairMoved: function (ts, pr, c) {
                                    root.handleCrosshairMoved(3, ts, pr, c);
                                }
                                onCrosshairCleared: {
                                    root.handleCrosshairCleared(3);
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
                                quote: root.quotes[symbol] || null
                                candles: root.getCandles(symbol, timeframe)
                                activeFocusCell: root.activeCellIndex === 4

                                onFocusRequested: function (idx) {
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
                                onCrosshairMoved: function (ts, pr, c) {
                                    root.handleCrosshairMoved(4, ts, pr, c);
                                }
                                onCrosshairCleared: {
                                    root.handleCrosshairCleared(4);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
