import QtQuick
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
        root.suggestions = [];
        root.suggestionIndex = 0;
        searchInput.text = "";
        searchInput.cursorPosition = 0;
        searchInput.forceActiveFocus();
    }

    function dismissSearch() {
        root.searching = false;
        root.searchQuery = "";
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
                visible: root.activeHoverCandle !== null

                Row {
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: Style.space(6)

                    Text {
                        textFormat: Text.PlainText
                        text: root.activeHoverCandle ? Model.formatCandleTime(root.activeHoverCandle.timestamp, root.timeframe) : ""
                        color: root.foreground
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall
                        font.bold: true
                    }

                    Text {
                        textFormat: Text.PlainText
                        text: {
                            if (!root.activeHoverCandle)
                                return "";
                            var c = root.activeHoverCandle;
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

    // Floating Type-to-Search Input (Zero-Chrome)
    Item {
        id: searchOverlay
        visible: root.searching
        anchors.top: parent.top
        anchors.left: parent.left
        anchors.leftMargin: Style.space(8)
        anchors.topMargin: Style.space(4)
        width: Style.space(220)
        height: Style.space(28)
        z: 200

        Rectangle {
            anchors.fill: parent
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
                }

                Keys.onReturnPressed: {
                    root.commitSearch();
                }

                Keys.onEscapePressed: {
                    root.dismissSearch();
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
