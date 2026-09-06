import QtQuick
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

Item {
    id: root

    property int cellIndex: 0
    property string symbol: "AAPL"
    property string timeframe: "1D"
    property var quote: null
    property var candles: []
    property bool activeFocusCell: false
    focus: activeFocusCell
    onActiveFocusCellChanged: {
        if (activeFocusCell)
            root.forceActiveFocus();
    }
    property color foreground: Color.foreground
    property color dim: Qt.darker(foreground, 1.45)
    property color upColor: Qt.rgba(0.22, 0.50, 0.30, 1)
    property color downColor: Qt.rgba(0.62, 0.22, 0.22, 1)
    property string fontFamily: Style.font.family

    property bool searching: false
    property string searchQuery: ""
    property var suggestions: []
    property int suggestionIndex: 0
    property string searchPendingQuery: ""
    property string searchActiveQuery: ""
    property string searchError: ""
    property var searchCache: ({})
    property var searchCacheOrder: []
    readonly property int searchCacheTtlMs: 300000
    readonly property int searchCacheLimit: 32
    property bool tfExpanded: false
    property bool changingInterval: false
    property string intervalQuery: ""

    signal focusRequested(int index)
    signal maximizeRequested(int index)
    signal symbolChangedManually(int index, string nextSymbol)
    signal timeframeChangedManually(int index, string nextTimeframe)
    signal crosshairMoved(real timestamp, real price, var candle)
    signal crosshairCleared

    readonly property var activeHoverCandle: chart.hoverCandle
    readonly property var currentBar: {
        var src = root.candles || [];
        if (src.length === 0)
            return null;
        var last = src[src.length - 1];
        if (!last)
            return null;
        var prev = src.length > 1 ? src[src.length - 2] : null;
        var st = Model.stratScenario(last, prev);
        return {
            timestamp: last.timestamp,
            open: Number(last.open),
            high: Number(last.high),
            low: Number(last.low),
            close: Number(last.close),
            volume: last.volume || 0,
            strat: st
        };
    }
    readonly property var activeCandle: root.activeHoverCandle !== null ? root.activeHoverCandle : root.currentBar

    function syncToTimestamp(ts) {
        chart.syncToTimestamp(ts);
    }

    function resetZoom() {
        chart.resetZoom();
    }

    function startSearch() {
        if (root.changingInterval)
            root.dismissIntervalInput();
        root.tfExpanded = false;
        root.searching = true;
        root.searchQuery = "";
        root.searchPendingQuery = "";
        root.searchActiveQuery = "";
        root.searchError = "";
        root.suggestions = [];
        root.suggestionIndex = 0;
        searchInput.text = "";
        searchInput.cursorPosition = 0;
        searchInput.forceActiveFocus();
    }

    function dismissSearch() {
        searchDebounce.stop();
        if (searchProc.running)
            searchProc.running = false;
        root.searching = false;
        root.searchQuery = "";
        root.searchPendingQuery = "";
        root.searchActiveQuery = "";
        root.searchError = "";
        root.suggestions = [];
        root.forceActiveFocus();
    }

    function commitSearch() {
        if (root.suggestions.length > 0 && root.suggestionIndex >= 0 && root.suggestionIndex < root.suggestions.length) {
            var pick = root.suggestions[root.suggestionIndex];
            if (pick && pick.symbol) {
                root.symbolChangedManually(root.cellIndex, pick.symbol);
            }
        } else if (root.searchQuery.trim().length > 0) {
            var sym = Model.normalizeSymbol(root.searchQuery);
            if (sym) {
                root.symbolChangedManually(root.cellIndex, sym);
            }
        }
        dismissSearch();
    }

    function requestSearch() {
        var query = searchInput.text.replace(/^\s+|\s+$/g, "");
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
        searchProc.command = ["curl", "-fsS", "--max-time", "5", "-A", "Mozilla/5.0", Model.searchUrl(searchActiveQuery)];
        searchProc.running = true;
    }

    function scheduleSearch() {
        searchDebounce.restart();
    }

    function startIntervalInput(initialChar) {
        if (root.searching)
            root.dismissSearch();
        root.tfExpanded = false;
        root.changingInterval = true;
        var init = (typeof initialChar === "string") ? initialChar : "";
        root.intervalQuery = init;
        intervalInput.text = init;
        intervalInput.cursorPosition = init.length;
        intervalInput.forceActiveFocus();
    }

    function dismissIntervalInput() {
        root.changingInterval = false;
        root.intervalQuery = "";
        root.forceActiveFocus();
    }

    function commitIntervalInput() {
        var parsed = Model.parseInterval(root.intervalQuery);
        if (parsed) {
            root.timeframeChangedManually(root.cellIndex, parsed);
        }
        dismissIntervalInput();
    }

    HoverHandler {
        id: cellHoverHandler
        onHoveredChanged: {
            if (!hovered)
                root.tfExpanded = false;
        }
    }

    Keys.onPressed: function (event) {
        if (event.key >= Qt.Key_0 && event.key <= Qt.Key_9) {
            if (!root.searching && !root.changingInterval) {
                var digit = (event.text && event.text.length > 0) ? event.text : String(event.key - Qt.Key_0);
                root.startIntervalInput(digit);
                event.accepted = true;
                return;
            }
        } else if (event.key === Qt.Key_Comma || event.key === Qt.Key_I) {
            if (!root.searching && !root.changingInterval) {
                root.startIntervalInput("");
                event.accepted = true;
                return;
            }
        } else if (event.key === Qt.Key_Slash || event.key === Qt.Key_S) {
            if (!root.searching && !root.changingInterval) {
                root.startSearch();
                event.accepted = true;
                return;
            }
        } else if (event.key === Qt.Key_Escape) {
            if (root.searching) {
                root.dismissSearch();
                event.accepted = true;
            } else if (root.changingInterval) {
                root.dismissIntervalInput();
                event.accepted = true;
            } else if (root.tfExpanded) {
                root.tfExpanded = false;
                event.accepted = true;
            }
        }
    }

    MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton
        onPressed: function (mouse) {
            root.forceActiveFocus();
            root.focusRequested(root.cellIndex);
            mouse.accepted = false;
        }
        onDoubleClicked: {
            root.maximizeRequested(root.cellIndex);
        }
    }

    Column {
        anchors.fill: parent
        spacing: 0

        // Zero-Chrome HUD Header
        Item {
            width: parent.width
            height: Style.space(32)

            Row {
                anchors.left: parent.left
                anchors.leftMargin: Style.space(8)
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.space(8)

                // Symbol Tag
                Text {
                    textFormat: Text.PlainText
                    text: root.symbol
                    color: root.activeFocusCell ? root.foreground : root.dim
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.body
                    font.bold: true

                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            root.forceActiveFocus();
                            root.focusRequested(root.cellIndex);
                            root.startSearch();
                        }
                    }
                }

                // Collapsible/Expandable Timeframe Indicator
                Item {
                    id: tfContainer
                    implicitWidth: root.tfExpanded ? expandedTfRow.implicitWidth : activeTfLabel.implicitWidth
                    implicitHeight: Math.max(activeTfLabel.implicitHeight, expandedTfRow.implicitHeight)
                    anchors.verticalCenter: parent.verticalCenter

                    Text {
                        id: activeTfLabel
                        visible: !root.tfExpanded
                        anchors.verticalCenter: parent.verticalCenter
                        textFormat: Text.PlainText
                        text: root.timeframe
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
                                root.forceActiveFocus();
                                root.focusRequested(root.cellIndex);
                                root.tfExpanded = true;
                            }
                        }
                    }

                    Row {
                        id: expandedTfRow
                        visible: root.tfExpanded
                        spacing: Style.space(4)
                        anchors.verticalCenter: parent.verticalCenter

                        Repeater {
                            model: ["60", "1D", "1W", "1M", "1Y"]

                            Text {
                                required property string modelData
                                textFormat: Text.PlainText
                                text: modelData
                                color: modelData === root.timeframe ? root.foreground : Qt.rgba(root.dim.r, root.dim.g, root.dim.b, 0.45)
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.bodySmall
                                font.bold: modelData === root.timeframe

                                MouseArea {
                                    anchors.fill: parent
                                    anchors.margins: -Style.space(2)
                                    cursorShape: Qt.PointingHandCursor
                                    hoverEnabled: true
                                    onClicked: {
                                        root.forceActiveFocus();
                                        root.focusRequested(root.cellIndex);
                                        root.timeframeChangedManually(root.cellIndex, modelData);
                                        root.tfExpanded = false;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Inspect Line (Right-aligned or overlay)
            Item {
                anchors.right: parent.right
                anchors.rightMargin: Style.space(8)
                anchors.verticalCenter: parent.verticalCenter
                visible: root.activeCandle !== null

                Row {
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: Style.space(6)

                    Text {
                        visible: root.activeCandle && root.activeCandle.strat && root.activeCandle.strat !== "-"
                        textFormat: Text.PlainText
                        text: (root.activeCandle && root.activeCandle.strat && root.activeCandle.strat !== "-") ? String(root.activeCandle.strat).toUpperCase() : ""
                        color: (root.activeCandle && root.activeCandle.close >= root.activeCandle.open) ? root.upColor : root.downColor
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall
                        font.bold: true
                    }

                    Text {
                        textFormat: Text.PlainText
                        text: {
                            if (!root.activeCandle)
                                return "";
                            var c = root.activeCandle;
                            var cur = root.quote ? root.quote.currency : "USD";
                            var h = root.quote ? root.quote.priceHint : 2;
                            return "O:" + Model.formatPrice(c.open, cur, h) + " H:" + Model.formatPrice(c.high, cur, h) + " L:" + Model.formatPrice(c.low, cur, h) + " C:" + Model.formatPrice(c.close, cur, h);
                        }
                        color: root.dim
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall
                    }
                }
            }
        }

        // Chart Area
        Item {
            width: parent.width
            height: parent.height - Style.space(32)

            CandlestickChart {
                id: chart
                anchors.fill: parent
                symbol: root.symbol
                rangeKey: root.timeframe
                candles: root.candles
                upColor: root.upColor
                downColor: root.downColor
                fontFamily: root.fontFamily
                currency: root.quote && root.quote.currency ? root.quote.currency : "USD"
                priceHint: root.quote && root.quote.priceHint ? root.quote.priceHint : 2
                interactive: true
                showGridLines: false
                showTooltipHeader: false

                onCrosshairMoved: function (timestamp, price, candle) {
                    root.crosshairMoved(timestamp, price, candle);
                }
                onCrosshairCleared: {
                    root.crosshairCleared();
                }
            }
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

    Timer {
        id: searchDebounce
        interval: 100
        onTriggered: root.requestSearch()
    }

    // Floating Type-to-Search Input & Suggestions Dropdown (Zero-Chrome)
    Item {
        id: searchOverlay
        visible: root.searching
        anchors.top: parent.top
        anchors.left: parent.left
        anchors.leftMargin: Style.space(8)
        anchors.topMargin: Style.space(4)
        width: Style.space(260)
        z: 200

        Rectangle {
            id: searchBox
            width: parent.width
            height: Style.space(28)
            color: Color.popups.background
            border.width: 1
            border.color: root.foreground

            TextInput {
                id: searchInput
                anchors.fill: parent
                anchors.margins: Style.space(4)
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.body
                selectByMouse: true

                onTextChanged: {
                    root.searchQuery = text;
                    if (root.searching)
                        root.scheduleSearch();
                }

                Keys.onPressed: function (event) {
                    if (event.key === Qt.Key_Down) {
                        if (root.suggestions.length > 0) {
                            root.suggestionIndex = (root.suggestionIndex + 1) % root.suggestions.length;
                            event.accepted = true;
                        }
                    } else if (event.key === Qt.Key_Up) {
                        if (root.suggestions.length > 0) {
                            root.suggestionIndex = (root.suggestionIndex - 1 + root.suggestions.length) % root.suggestions.length;
                            event.accepted = true;
                        }
                    } else if (event.key === Qt.Key_Tab) {
                        if (root.suggestions.length > 0) {
                            root.suggestionIndex = (root.suggestionIndex + 1) % root.suggestions.length;
                            event.accepted = true;
                        }
                    } else if (event.key === Qt.Key_Backtab) {
                        if (root.suggestions.length > 0) {
                            root.suggestionIndex = (root.suggestionIndex - 1 + root.suggestions.length) % root.suggestions.length;
                            event.accepted = true;
                        }
                    } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
                        root.commitSearch();
                        event.accepted = true;
                    } else if (event.key === Qt.Key_Escape) {
                        root.dismissSearch();
                        event.accepted = true;
                    }
                }
            }
        }

        // Suggestions Dropdown Popup
        Rectangle {
            id: suggestionsPopup
            visible: root.suggestions.length > 0 || (root.searchError !== "" && root.searchQuery.length > 0)
            anchors.top: searchBox.bottom
            anchors.topMargin: Style.space(4)
            width: parent.width
            implicitHeight: suggestionsColumn.implicitHeight + Style.space(8)
            color: Color.popups.background
            border.width: 1
            border.color: root.dim
            clip: true

            Column {
                id: suggestionsColumn
                anchors.top: parent.top
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.topMargin: Style.space(4)
                spacing: Style.space(2)

                Repeater {
                    model: root.suggestions

                    Item {
                        required property int index
                        required property var modelData
                        width: suggestionsColumn.width
                        height: Style.space(38)

                        Rectangle {
                            anchors.fill: parent
                            anchors.margins: 1
                            color: (index === root.suggestionIndex) ? Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.15) : "transparent"
                        }

                        MouseArea {
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onEntered: {
                                root.suggestionIndex = index;
                            }
                            onClicked: {
                                root.symbolChangedManually(root.cellIndex, modelData.symbol);
                                root.dismissSearch();
                            }
                        }

                        Column {
                            anchors.left: parent.left
                            anchors.right: parent.right
                            anchors.leftMargin: Style.space(8)
                            anchors.rightMargin: Style.space(8)
                            anchors.verticalCenter: parent.verticalCenter
                            spacing: 1

                            Text {
                                textFormat: Text.PlainText
                                text: modelData.symbol
                                color: root.foreground
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.bodySmall
                                font.bold: true
                            }

                            Text {
                                textFormat: Text.PlainText
                                text: modelData.name + (Model.suggestionMeta(modelData) ? "  " + Model.suggestionMeta(modelData) : "")
                                color: root.dim
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.bodySmall * 0.88
                                elide: Text.ElideRight
                                width: parent.width
                            }
                        }
                    }
                }

                Text {
                    visible: root.searchError !== "" && root.suggestions.length === 0
                    textFormat: Text.PlainText
                    text: root.searchError
                    color: Color.urgent
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                    anchors.horizontalCenter: parent.horizontalCenter
                    topPadding: Style.space(4)
                    bottomPadding: Style.space(4)
                }
            }
        }
    }

    // Floating Change Interval Input (Zero-Chrome)
    Item {
        id: intervalOverlay
        visible: root.changingInterval
        anchors.top: parent.top
        anchors.left: parent.left
        anchors.leftMargin: Style.space(8)
        anchors.topMargin: Style.space(4)
        width: Style.space(170)
        height: Style.space(28)
        z: 200

        Rectangle {
            anchors.fill: parent
            color: Color.popups.background
            border.width: 1
            border.color: root.foreground

            Row {
                anchors.fill: parent
                anchors.leftMargin: Style.space(6)
                anchors.rightMargin: Style.space(6)
                spacing: Style.space(4)

                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    text: "INTERVAL:"
                    color: root.dim
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                    font.bold: true
                }

                TextInput {
                    id: intervalInput
                    anchors.verticalCenter: parent.verticalCenter
                    width: parent.width - Style.space(70)
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.body
                    font.bold: true
                    selectByMouse: true

                    onTextChanged: {
                        root.intervalQuery = text;
                    }

                    Keys.onReturnPressed: {
                        root.commitIntervalInput();
                    }

                    Keys.onEnterPressed: {
                        root.commitIntervalInput();
                    }

                    Keys.onEscapePressed: {
                        root.dismissIntervalInput();
                    }
                }
            }
        }
    }
}
