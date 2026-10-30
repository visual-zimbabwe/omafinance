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
    property string activeTimeframe: "1D" // "1D" or "1W"
    property string activeTab: "all" // "all", "attacks", "laggards"
    property string sortKey: "attack" // "attack", "symbol", "name", "pct2u", "pct2d"
    property bool sortAsc: false

    property var scanResult: null
    property var attackData: []
    property var topBullish: []
    property var topBearish: []
    property var topLaggards: []
    property double lastFetchedAt: 0
    property string expandedBasketSymbol: ""

    property bool loading: false
    property string statusText: ""

    title: "Omafinance - TheStrat Attack Scanner"
    color: Color.background
    implicitWidth: Style.space(980)
    implicitHeight: Style.space(680)
    minimumSize: Qt.size(Style.space(780), Style.space(520))

    readonly property color foreground: Color.foreground
    readonly property color dim: Qt.darker(foreground, 1.45)
    readonly property color upColor: Qt.rgba(0.22, 0.50, 0.30, 1)
    readonly property color downColor: Qt.rgba(0.62, 0.22, 0.22, 1)
    readonly property color warningColor: Qt.rgba(0.78, 0.55, 0.15, 1)
    readonly property string fontFamily: Style.font.family

    function applyScanResult(data) {
        root.scanResult = data;
        var ds = (root.activeTimeframe === "1W" && data.weekly) ? data.weekly : (data.daily || data);
        root.attackData = ds.baskets || [];
        root.topBullish = ds.topBullishAttacks || [];
        root.topBearish = ds.topBearishAttacks || [];
        root.topLaggards = ds.topLaggards || [];
    }

    onActiveTimeframeChanged: {
        if (root.scanResult)
            applyScanResult(root.scanResult);
    }

    function startRefresh() {
        if (root.loading)
            return;
        root.loading = true;
        root.statusText = "Scanning institutional attacks...";
        var home = Quickshell.env("HOME");
        var scriptPath = home + "/.config/omarchy/plugins/mohamedmansour.finance/scripts/fetch-attack.js";
        attackRunnerProc.command = Model.nodeCommand(scriptPath);
        attackRunnerProc.running = true;
    }

    Timer {
        id: autoRefreshTimer
        interval: 60000
        running: root.visible
        repeat: true
        onTriggered: {
            if (!root.loading)
                root.startRefresh();
        }
    }

    Component.onCompleted: {
        Qt.callLater(startRefresh);
    }

    Process {
        id: attackRunnerProc
        onExited: function (exitCode) {
            root.loading = false;
            var raw = String(attackStdout.text || "").trim();
            if (exitCode === 0 && raw) {
                try {
                    var data = JSON.parse(raw);
                    if (data && (data.baskets || data.daily)) {
                        applyScanResult(data);
                        root.lastFetchedAt = Date.now();
                        var d = new Date();
                        root.statusText = "Updated " + d.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit"
                        });
                        return;
                    }
                } catch (e) {
                    console.log("[AttackScanner] parse error:", e);
                }
            }
            root.statusText = "Scan failed (exit code " + exitCode + ")";
        }
        stdout: StdioCollector {
            id: attackStdout
            waitForEnd: true
        }
    }

    readonly property var filteredBaskets: {
        var list = root.attackData || [];
        if (root.activeTab === "attacks") {
            list = list.filter(function (b) {
                return (b.status === "BULLISH ATTACK" || b.status === "BEARISH ATTACK" || b.pctAttack2u >= 15 || b.pctAttack2d >= 15);
            });
        }
        return Model.sortAttackBaskets(list, root.sortKey, root.sortAsc);
    }

    Column {
        anchors.fill: parent
        anchors.margins: Style.space(16)
        spacing: Style.space(12)

        // Header section
        Row {
            width: parent.width
            height: Style.space(38)

            Column {
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.space(2)

                Text {
                    text: "THE STRAT ATTACK SCANNER"
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.title
                    font.bold: true
                }

                Text {
                    text: root.statusText !== "" ? root.statusText : "Institutional continuation attacks & group breakout momentum"
                    color: root.dim
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                }
            }

            Row {
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.space(10)

                // Timeframe Selectors (1D Daily vs 1W Weekly)
                Row {
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: Style.space(4)

                    Rectangle {
                        width: tfDailyText.implicitWidth + Style.space(12)
                        height: Style.space(28)
                        color: "transparent"

                        Text {
                            id: tfDailyText
                            anchors.centerIn: parent
                            text: "1D"
                            color: root.activeTimeframe === "1D" ? Color.accent : (tfDailyMouse.containsMouse ? root.foreground : root.dim)
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.bodySmall
                            font.bold: root.activeTimeframe === "1D"
                        }

                        Rectangle {
                            anchors.bottom: parent.bottom
                            anchors.horizontalCenter: parent.horizontalCenter
                            width: parent.width - Style.space(6)
                            height: 2
                            color: root.activeTimeframe === "1D" ? Color.accent : "transparent"
                        }

                        MouseArea {
                            id: tfDailyMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                root.activeTimeframe = "1D";
                            }
                        }
                    }

                    Rectangle {
                        width: tfWeeklyText.implicitWidth + Style.space(12)
                        height: Style.space(28)
                        color: "transparent"

                        Text {
                            id: tfWeeklyText
                            anchors.centerIn: parent
                            text: "1W"
                            color: root.activeTimeframe === "1W" ? Color.accent : (tfWeeklyMouse.containsMouse ? root.foreground : root.dim)
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.bodySmall
                            font.bold: root.activeTimeframe === "1W"
                        }

                        Rectangle {
                            anchors.bottom: parent.bottom
                            anchors.horizontalCenter: parent.horizontalCenter
                            width: parent.width - Style.space(6)
                            height: 2
                            color: root.activeTimeframe === "1W" ? Color.accent : "transparent"
                        }

                        MouseArea {
                            id: tfWeeklyMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                root.activeTimeframe = "1W";
                            }
                        }
                    }
                }

                // Vertical Separator
                Rectangle {
                    anchors.verticalCenter: parent.verticalCenter
                    width: 1
                    height: Style.space(16)
                    color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.15)
                }

                // Tab selectors
                Repeater {
                    model: [
                        {
                            id: "all",
                            label: "All Baskets (" + (root.attackData ? root.attackData.length : 0) + ")"
                        },
                        {
                            id: "attacks",
                            label: "Attacks Only"
                        },
                        {
                            id: "laggards",
                            label: "Laggards Hunter (" + (root.topLaggards ? root.topLaggards.length : 0) + ")"
                        }
                    ]

                    Rectangle {
                        id: tabItem
                        required property var modelData
                        width: tabText.implicitWidth + Style.space(12)
                        height: Style.space(28)
                        color: "transparent"

                        Text {
                            id: tabText
                            anchors.centerIn: parent
                            text: tabItem.modelData.label
                            color: root.activeTab === tabItem.modelData.id ? Color.accent : (tabMouse.containsMouse ? root.foreground : root.dim)
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.bodySmall
                            font.bold: root.activeTab === tabItem.modelData.id
                        }

                        Rectangle {
                            anchors.bottom: parent.bottom
                            anchors.horizontalCenter: parent.horizontalCenter
                            width: parent.width - Style.space(8)
                            height: 2
                            color: root.activeTab === tabItem.modelData.id ? Color.accent : "transparent"
                        }

                        MouseArea {
                            id: tabMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                root.activeTab = tabItem.modelData.id;
                            }
                        }
                    }
                }

                // Refresh Button
                Rectangle {
                    width: Style.space(28)
                    height: Style.space(28)
                    color: "transparent"

                    Text {
                        anchors.centerIn: parent
                        text: "↻"
                        color: refreshArea.containsMouse ? Color.accent : (root.loading ? Color.accent : root.dim)
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.body
                    }

                    MouseArea {
                        id: refreshArea
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            root.startRefresh();
                        }
                    }
                }
            }
        }

        // Active Attack Highlights Strip
        Row {
            visible: root.activeTab !== "laggards" && ((root.topBullish && root.topBullish.length > 0) || (root.topBearish && root.topBearish.length > 0))
            width: parent.width
            height: Style.space(26)
            spacing: Style.space(24)

            // Bullish Leaders
            Row {
                visible: root.topBullish && root.topBullish.length > 0
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.space(8)

                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    text: "BULLISH LEADERS:"
                    color: root.upColor
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    font.bold: true
                }

                Repeater {
                    model: root.topBullish.slice(0, 5)

                    Text {
                        id: bPill
                        required property var modelData
                        anchors.verticalCenter: parent.verticalCenter
                        text: bPill.modelData.symbol
                        color: bMouse.containsMouse ? Color.accent : root.upColor
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall
                        font.bold: true

                        MouseArea {
                            id: bMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                if (root.controller)
                                    root.controller.openGrid({
                                        symbol: bPill.modelData.symbol,
                                        gridMode: "2+3",
                                        timeframes: ["60", "1D", "1W", "1M", "1Y"]
                                    });
                            }
                        }
                    }
                }
            }

            // Bearish Leaders
            Row {
                visible: root.topBearish && root.topBearish.length > 0
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.space(8)

                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    text: "BEARISH LEADERS:"
                    color: root.downColor
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    font.bold: true
                }

                Repeater {
                    model: root.topBearish.slice(0, 5)

                    Text {
                        id: bearPill
                        required property var modelData
                        anchors.verticalCenter: parent.verticalCenter
                        text: bearPill.modelData.symbol
                        color: bearMouse.containsMouse ? Color.accent : root.downColor
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall
                        font.bold: true

                        MouseArea {
                            id: bearMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                if (root.controller)
                                    root.controller.openGrid({
                                        symbol: bearPill.modelData.symbol,
                                        gridMode: "2+3",
                                        timeframes: ["60", "1D", "1W", "1M", "1Y"]
                                    });
                            }
                        }
                    }
                }
            }
        }

        // Main Content Area
        QQC.ScrollView {
            width: parent.width
            height: parent.height - Style.space(88)
            clip: true

            // Laggards Hunter View
            Column {
                visible: root.activeTab === "laggards"
                width: parent.width
                spacing: Style.space(6)

                // Laggards Header
                Item {
                    width: parent.width
                    height: Style.space(24)

                    Row {
                        anchors.fill: parent
                        anchors.leftMargin: Style.space(6)
                        anchors.rightMargin: Style.space(6)
                        spacing: Style.space(12)

                        Text {
                            width: Style.space(80)
                            text: "TICKER"
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                        }

                        Text {
                            width: Style.space(80)
                            text: "BASKET"
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                        }

                        Text {
                            width: Style.space(90)
                            horizontalAlignment: Text.AlignRight
                            text: "PRICE"
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                        }

                        Text {
                            width: Style.space(100)
                            horizontalAlignment: Text.AlignRight
                            text: "TRIGGER"
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                        }

                        Text {
                            width: Style.space(130)
                            horizontalAlignment: Text.AlignRight
                            text: "DIST TO TRIGGER"
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                        }

                        Text {
                            width: Style.space(90)
                            horizontalAlignment: Text.AlignRight
                            text: root.activeTimeframe === "1W" ? "WEEK BAR" : "TODAY BAR"
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                        }

                        Text {
                            width: Style.space(280)
                            text: "COMPANY NAME"
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                        }
                    }
                }

                Repeater {
                    model: root.topLaggards

                    Rectangle {
                        id: laggardRow
                        required property var modelData
                        width: parent.width
                        height: Style.space(34)
                        radius: Style.space(4)
                        color: lagArea.containsMouse ? Style.hoverFillFor(root.foreground, Color.accent) : "transparent"

                        Row {
                            anchors.fill: parent
                            anchors.leftMargin: Style.space(6)
                            anchors.rightMargin: Style.space(6)
                            spacing: Style.space(12)

                            Text {
                                anchors.verticalCenter: parent.verticalCenter
                                width: Style.space(80)
                                text: laggardRow.modelData.symbol
                                color: root.foreground
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.body
                                font.bold: true
                            }

                            Text {
                                anchors.verticalCenter: parent.verticalCenter
                                width: Style.space(80)
                                text: laggardRow.modelData.parentBasket
                                color: Color.accent
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.bodySmall
                                font.bold: true
                            }

                            Text {
                                anchors.verticalCenter: parent.verticalCenter
                                width: Style.space(90)
                                horizontalAlignment: Text.AlignRight
                                text: laggardRow.modelData.price ? "$" + laggardRow.modelData.price.toFixed(2) : "-"
                                color: root.foreground
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.body
                            }

                            Text {
                                anchors.verticalCenter: parent.verticalCenter
                                width: Style.space(100)
                                horizontalAlignment: Text.AlignRight
                                text: laggardRow.modelData.triggerPrice ? "$" + laggardRow.modelData.triggerPrice.toFixed(2) : "-"
                                color: root.dim
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.bodySmall
                            }

                            Text {
                                anchors.verticalCenter: parent.verticalCenter
                                width: Style.space(130)
                                horizontalAlignment: Text.AlignRight
                                text: laggardRow.modelData.distToTriggerPct != null ? (laggardRow.modelData.distToTriggerPct.toFixed(1) + "% (" + (laggardRow.modelData.direction === "bullish" ? "High" : "Low") + ")") : "-"
                                color: laggardRow.modelData.direction === "bullish" ? root.upColor : root.downColor
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.bodySmall
                                font.bold: true
                            }

                            Text {
                                anchors.verticalCenter: parent.verticalCenter
                                width: Style.space(90)
                                horizontalAlignment: Text.AlignRight
                                text: laggardRow.modelData.scenario ? String(laggardRow.modelData.scenario).toUpperCase() : "-"
                                color: laggardRow.modelData.color === "G" ? root.upColor : root.downColor
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.body
                                font.bold: true
                            }

                            Text {
                                anchors.verticalCenter: parent.verticalCenter
                                width: Style.space(280)
                                text: laggardRow.modelData.name || ""
                                color: root.dim
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.bodySmall
                                elide: Text.ElideRight
                            }
                        }

                        MouseArea {
                            id: lagArea
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                if (root.controller)
                                    root.controller.openGrid({
                                        symbol: laggardRow.modelData.symbol,
                                        gridMode: "2+3",
                                        timeframes: ["60", "1D", "1W", "1M", "1Y"]
                                    });
                            }
                        }
                    }
                }
            }

            // Baskets Leaderboard View
            Column {
                visible: root.activeTab !== "laggards"
                width: parent.width
                spacing: Style.space(6)

                // Table Header
                Item {
                    width: parent.width
                    height: Style.space(24)

                    Row {
                        anchors.fill: parent
                        anchors.leftMargin: Style.space(6)
                        anchors.rightMargin: Style.space(6)
                        spacing: Style.space(12)

                        Text {
                            width: Style.space(70)
                            text: "BASKET"
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                        }

                        Text {
                            width: Style.space(210)
                            text: "NAME & SECTOR"
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                        }

                        Text {
                            width: Style.space(150)
                            text: "ATTACK STATUS"
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                        }

                        Text {
                            width: Style.space(120)
                            horizontalAlignment: Text.AlignRight
                            text: "2U ATTACK %"
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                        }

                        Text {
                            width: Style.space(120)
                            horizontalAlignment: Text.AlignRight
                            text: "2D ATTACK %"
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                        }

                        Text {
                            width: Style.space(110)
                            horizontalAlignment: Text.AlignRight
                            text: root.activeTimeframe === "1W" ? "WEEK 2U / 2D" : "TODAY 2U / 2D"
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                        }

                        Text {
                            width: Style.space(90)
                            horizontalAlignment: Text.AlignRight
                            text: "HOLDINGS"
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                        }
                    }
                }

                Repeater {
                    model: root.filteredBaskets

                    Column {
                        id: basketBlock
                        required property var modelData
                        width: parent.width
                        spacing: Style.space(4)

                        Rectangle {
                            width: parent.width
                            height: Style.space(38)
                            radius: Style.space(6)
                            color: bMouse.containsMouse ? Style.hoverFillFor(root.foreground, Color.accent) : "transparent"

                            Row {
                                anchors.fill: parent
                                anchors.leftMargin: Style.space(6)
                                anchors.rightMargin: Style.space(6)
                                spacing: Style.space(12)

                                Text {
                                    anchors.verticalCenter: parent.verticalCenter
                                    width: Style.space(70)
                                    text: basketBlock.modelData.symbol
                                    color: root.foreground
                                    font.family: root.fontFamily
                                    font.pixelSize: Style.font.body
                                    font.bold: true
                                }

                                Column {
                                    anchors.verticalCenter: parent.verticalCenter
                                    width: Style.space(210)
                                    spacing: Style.space(2)

                                    Text {
                                        text: basketBlock.modelData.name
                                        color: root.foreground
                                        font.family: root.fontFamily
                                        font.pixelSize: Style.font.bodySmall
                                        elide: Text.ElideRight
                                        width: parent.width
                                    }

                                    Text {
                                        text: basketBlock.modelData.category
                                        color: root.dim
                                        font.family: root.fontFamily
                                        font.pixelSize: Style.font.caption
                                    }
                                }

                                Text {
                                    anchors.verticalCenter: parent.verticalCenter
                                    width: Style.space(150)
                                    text: basketBlock.modelData.status
                                    color: basketBlock.modelData.status === "BULLISH ATTACK" ? root.upColor : (basketBlock.modelData.status === "BEARISH ATTACK" ? root.downColor : (basketBlock.modelData.status.indexOf("BUY") !== -1 ? root.upColor : (basketBlock.modelData.status.indexOf("SELL") !== -1 ? root.downColor : root.dim)))
                                    font.family: root.fontFamily
                                    font.pixelSize: Style.font.bodySmall
                                    font.bold: true
                                }

                                Text {
                                    anchors.verticalCenter: parent.verticalCenter
                                    width: Style.space(120)
                                    horizontalAlignment: Text.AlignRight
                                    text: basketBlock.modelData.pctAttack2u.toFixed(1) + "% (" + basketBlock.modelData.countAttack2u + ")"
                                    color: basketBlock.modelData.pctAttack2u >= 20 ? root.upColor : root.foreground
                                    font.family: root.fontFamily
                                    font.pixelSize: Style.font.body
                                    font.bold: basketBlock.modelData.pctAttack2u >= 20
                                }

                                Text {
                                    anchors.verticalCenter: parent.verticalCenter
                                    width: Style.space(120)
                                    horizontalAlignment: Text.AlignRight
                                    text: basketBlock.modelData.pctAttack2d.toFixed(1) + "% (" + basketBlock.modelData.countAttack2d + ")"
                                    color: basketBlock.modelData.pctAttack2d >= 20 ? root.downColor : root.foreground
                                    font.family: root.fontFamily
                                    font.pixelSize: Style.font.body
                                    font.bold: basketBlock.modelData.pctAttack2d >= 20
                                }

                                Text {
                                    anchors.verticalCenter: parent.verticalCenter
                                    width: Style.space(110)
                                    horizontalAlignment: Text.AlignRight
                                    text: basketBlock.modelData.pct2u.toFixed(0) + "% / " + basketBlock.modelData.pct2d.toFixed(0) + "%"
                                    color: basketBlock.modelData.pct2u > basketBlock.modelData.pct2d ? root.upColor : (basketBlock.modelData.pct2d > basketBlock.modelData.pct2u ? root.downColor : root.dim)
                                    font.family: root.fontFamily
                                    font.pixelSize: Style.font.bodySmall
                                }

                                Text {
                                    anchors.verticalCenter: parent.verticalCenter
                                    width: Style.space(90)
                                    horizontalAlignment: Text.AlignRight
                                    text: basketBlock.modelData.totalHoldings + " stocks"
                                    color: root.dim
                                    font.family: root.fontFamily
                                    font.pixelSize: Style.font.bodySmall
                                }
                            }

                            MouseArea {
                                id: bMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: {
                                    if (root.expandedBasketSymbol === basketBlock.modelData.symbol) {
                                        root.expandedBasketSymbol = "";
                                    } else {
                                        root.expandedBasketSymbol = basketBlock.modelData.symbol;
                                    }
                                }
                                onDoubleClicked: {
                                    if (root.controller)
                                        root.controller.openGrid({
                                            symbol: basketBlock.modelData.symbol,
                                            gridMode: "2+3",
                                            timeframes: ["60", "1D", "1W", "1M", "1Y"]
                                        });
                                }
                            }
                        }

                        // Expanded Section showing Attacking Constituents and Laggards with WTD bars
                        Column {
                            visible: root.expandedBasketSymbol === basketBlock.modelData.symbol
                            width: parent.width
                            anchors.leftMargin: Style.space(24)
                            spacing: Style.space(10)

                            // 1. Attacking Constituents Section
                            Column {
                                visible: basketBlock.modelData.attackConstituents && basketBlock.modelData.attackConstituents.length > 0
                                width: parent.width
                                spacing: Style.space(4)

                                Row {
                                    spacing: Style.space(6)
                                    Text {
                                        text: "ATTACKING CONSTITUENTS (" + (basketBlock.modelData.attackConstituents ? basketBlock.modelData.attackConstituents.length : 0) + "):"
                                        color: Color.accent
                                        font.family: root.fontFamily
                                        font.pixelSize: Style.font.caption
                                        font.bold: true
                                    }
                                    Text {
                                        text: "· Click any stock to open 5-timeframe Grid"
                                        color: root.dim
                                        font.family: root.fontFamily
                                        font.pixelSize: Style.font.caption
                                    }
                                }

                                Flow {
                                    width: parent.width - Style.space(32)
                                    spacing: Style.space(10)

                                    Repeater {
                                        model: basketBlock.modelData.attackConstituents

                                        Rectangle {
                                            id: cCard
                                            required property var modelData
                                            width: Style.space(222)
                                            height: Style.space(164)
                                            radius: Style.space(8)
                                            color: "transparent"
                                            border.color: cCardArea.containsMouse || cStrip.hoverIndex >= 0 ? Color.accent : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.15)
                                            border.width: 1

                                            Column {
                                                anchors.fill: parent
                                                anchors.margins: Style.space(8)
                                                spacing: Style.space(6)

                                                Item {
                                                    width: parent.width
                                                    height: Style.space(22)

                                                    Text {
                                                        anchors.left: parent.left
                                                        anchors.verticalCenter: parent.verticalCenter
                                                        text: cCard.modelData.symbol
                                                        color: root.foreground
                                                        font.family: root.fontFamily
                                                        font.pixelSize: Style.font.bodyLarge
                                                        font.bold: true
                                                    }

                                                    Row {
                                                        anchors.right: parent.right
                                                        anchors.verticalCenter: parent.verticalCenter
                                                        spacing: Style.space(6)

                                                        Text {
                                                            visible: cStrip.hoverCandle !== null
                                                            textFormat: Text.PlainText
                                                            text: {
                                                                if (!cStrip.hoverCandle)
                                                                    return "";
                                                                var c = cStrip.hoverCandle;
                                                                return c.day + " $" + (c.close ? c.close.toFixed(2) : "-");
                                                            }
                                                            color: root.dim
                                                            font.family: root.fontFamily
                                                            font.pixelSize: Style.font.caption
                                                        }

                                                        Text {
                                                            visible: cStrip.activeCandle && cStrip.activeCandle.scenario && cStrip.activeCandle.scenario !== "-"
                                                            textFormat: Text.PlainText
                                                            text: (cStrip.activeCandle && cStrip.activeCandle.scenario && cStrip.activeCandle.scenario !== "-") ? cStrip.activeCandle.scenario.toUpperCase() : ""
                                                            color: (cStrip.activeCandle && cStrip.activeCandle.close >= cStrip.activeCandle.open) ? root.upColor : root.downColor
                                                            font.family: root.fontFamily
                                                            font.pixelSize: Style.font.bodyLarge
                                                            font.bold: true
                                                        }
                                                    }
                                                }

                                                WtdCandlesStrip {
                                                    id: cStrip
                                                    width: parent.width
                                                    height: Style.space(118)
                                                    wtdData: cCard.modelData.wtd
                                                    upColor: root.upColor
                                                    downColor: root.downColor
                                                    foreground: root.foreground
                                                    dim: root.dim
                                                    fontFamily: root.fontFamily
                                                    onClicked: {
                                                        if (root.controller)
                                                            root.controller.openGrid({
                                                                symbol: cCard.modelData.symbol,
                                                                gridMode: "2+3",
                                                                timeframes: ["60", "1D", "1W", "1M", "1Y"]
                                                            });
                                                    }
                                                }
                                            }

                                            MouseArea {
                                                id: cCardArea
                                                anchors.fill: parent
                                                hoverEnabled: true
                                                cursorShape: Qt.PointingHandCursor
                                                onPositionChanged: mouse => {
                                                    var p = mapToItem(cStrip, mouse.x, mouse.y);
                                                    if (p.x >= 0 && p.x <= cStrip.width && p.y >= 0 && p.y <= cStrip.height) {
                                                        var count = cStrip.candles ? cStrip.candles.length : 0;
                                                        if (count > 0) {
                                                            var colW = cStrip.width / count;
                                                            var idx = Math.floor(p.x / colW);
                                                            cStrip.hoverIndex = (idx >= 0 && idx < count) ? idx : -1;
                                                        } else {
                                                            cStrip.hoverIndex = -1;
                                                        }
                                                    } else {
                                                        cStrip.hoverIndex = -1;
                                                    }
                                                }
                                                onExited: {
                                                    cStrip.hoverIndex = -1;
                                                }
                                                onClicked: {
                                                    if (root.controller)
                                                        root.controller.openGrid({
                                                            symbol: cCard.modelData.symbol,
                                                            gridMode: "2+3",
                                                            timeframes: ["60", "1D", "1W", "1M", "1Y"]
                                                        });
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            // 2. Basket Laggards Section (if any)
                            Column {
                                visible: basketBlock.modelData.laggards && basketBlock.modelData.laggards.length > 0
                                width: parent.width
                                spacing: Style.space(4)

                                Row {
                                    spacing: Style.space(6)
                                    Text {
                                        text: "BASKET LAGGARDS (" + (basketBlock.modelData.laggards ? basketBlock.modelData.laggards.length : 0) + "):"
                                        color: root.warningColor
                                        font.family: root.fontFamily
                                        font.pixelSize: Style.font.caption
                                        font.bold: true
                                    }
                                    Text {
                                        text: "· Click ticker to open 5-timeframe Grid"
                                        color: root.dim
                                        font.family: root.fontFamily
                                        font.pixelSize: Style.font.caption
                                    }
                                }

                                Flow {
                                    width: parent.width - Style.space(32)
                                    spacing: Style.space(10)

                                    Repeater {
                                        model: basketBlock.modelData.laggards

                                        Rectangle {
                                            id: lCard
                                            required property var modelData
                                            width: Style.space(222)
                                            height: Style.space(164)
                                            radius: Style.space(8)
                                            color: "transparent"
                                            border.color: lCardArea.containsMouse || lStrip.hoverIndex >= 0 ? Color.accent : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.15)
                                            border.width: 1

                                            Column {
                                                anchors.fill: parent
                                                anchors.margins: Style.space(8)
                                                spacing: Style.space(6)

                                                Item {
                                                    width: parent.width
                                                    height: Style.space(22)

                                                    Text {
                                                        anchors.left: parent.left
                                                        anchors.verticalCenter: parent.verticalCenter
                                                        text: lCard.modelData.symbol
                                                        color: root.foreground
                                                        font.family: root.fontFamily
                                                        font.pixelSize: Style.font.bodyLarge
                                                        font.bold: true
                                                    }

                                                    Row {
                                                        anchors.right: parent.right
                                                        anchors.verticalCenter: parent.verticalCenter
                                                        spacing: Style.space(6)

                                                        Text {
                                                            visible: lStrip.hoverCandle !== null
                                                            textFormat: Text.PlainText
                                                            text: {
                                                                if (!lStrip.hoverCandle)
                                                                    return "";
                                                                var c = lStrip.hoverCandle;
                                                                return c.day + " $" + (c.close ? c.close.toFixed(2) : "-");
                                                            }
                                                            color: root.dim
                                                            font.family: root.fontFamily
                                                            font.pixelSize: Style.font.caption
                                                        }

                                                        Text {
                                                            visible: lStrip.activeCandle && lStrip.activeCandle.scenario && lStrip.activeCandle.scenario !== "-"
                                                            textFormat: Text.PlainText
                                                            text: (lStrip.activeCandle && lStrip.activeCandle.scenario && lStrip.activeCandle.scenario !== "-") ? lStrip.activeCandle.scenario.toUpperCase() : ""
                                                            color: (lStrip.activeCandle && lStrip.activeCandle.close >= lStrip.activeCandle.open) ? root.upColor : root.downColor
                                                            font.family: root.fontFamily
                                                            font.pixelSize: Style.font.bodyLarge
                                                            font.bold: true
                                                        }
                                                    }
                                                }

                                                WtdCandlesStrip {
                                                    id: lStrip
                                                    width: parent.width
                                                    height: Style.space(118)
                                                    wtdData: lCard.modelData.wtd
                                                    upColor: root.upColor
                                                    downColor: root.downColor
                                                    foreground: root.foreground
                                                    dim: root.dim
                                                    fontFamily: root.fontFamily
                                                    onClicked: {
                                                        if (root.controller)
                                                            root.controller.openGrid({
                                                                symbol: lCard.modelData.symbol,
                                                                gridMode: "2+3",
                                                                timeframes: ["60", "1D", "1W", "1M", "1Y"]
                                                            });
                                                    }
                                                }
                                            }

                                            MouseArea {
                                                id: lCardArea
                                                anchors.fill: parent
                                                hoverEnabled: true
                                                cursorShape: Qt.PointingHandCursor
                                                onPositionChanged: mouse => {
                                                    var p = mapToItem(lStrip, mouse.x, mouse.y);
                                                    if (p.x >= 0 && p.x <= lStrip.width && p.y >= 0 && p.y <= lStrip.height) {
                                                        var count = lStrip.candles ? lStrip.candles.length : 0;
                                                        if (count > 0) {
                                                            var colW = lStrip.width / count;
                                                            var idx = Math.floor(p.x / colW);
                                                            lStrip.hoverIndex = (idx >= 0 && idx < count) ? idx : -1;
                                                        } else {
                                                            lStrip.hoverIndex = -1;
                                                        }
                                                    } else {
                                                        lStrip.hoverIndex = -1;
                                                    }
                                                }
                                                onExited: {
                                                    lStrip.hoverIndex = -1;
                                                }
                                                onClicked: {
                                                    if (root.controller)
                                                        root.controller.openGrid({
                                                            symbol: lCard.modelData.symbol,
                                                            gridMode: "2+3",
                                                            timeframes: ["60", "1D", "1W", "1M", "1Y"]
                                                        });
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
    }
}
