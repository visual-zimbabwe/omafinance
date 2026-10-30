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
    property string activeTab: "all" // "all", "attacks", "laggards"
    property string sortKey: "attack" // "attack", "symbol", "name", "pct2u", "pct2d"
    property bool sortAsc: false

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
                    if (data && data.baskets) {
                        root.attackData = data.baskets;
                        root.topBullish = data.topBullishAttacks || [];
                        root.topBearish = data.topBearishAttacks || [];
                        root.topLaggards = data.topLaggards || [];
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
                return (b.status === "BULLISH ATTACK" || b.status === "BEARISH ATTACK" || b.pctAttack2u >= 30 || b.pctAttack2d >= 30);
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

                Row {
                    spacing: Style.space(8)

                    Text {
                        text: "THESTRAT ATTACK SCANNER"
                        color: root.foreground
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.title
                        font.bold: true
                    }

                    Rectangle {
                        anchors.verticalCenter: parent.verticalCenter
                        width: Style.space(64)
                        height: Style.space(18)
                        radius: Style.space(4)
                        color: Style.hoverFillFor(root.foreground, Color.accent)

                        Text {
                            anchors.centerIn: parent
                            text: "2u-2u / 2d-2d"
                            color: Color.accent
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                        }
                    }
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
                spacing: Style.space(8)

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
                        required property var modelData
                        width: tabText.implicitWidth + Style.space(16)
                        height: Style.space(28)
                        radius: Style.space(6)
                        color: root.activeTab === modelData.id ? Style.hoverFillFor(root.foreground, Color.accent) : "transparent"
                        border.color: root.activeTab === modelData.id ? Color.accent : Qt.darker(root.dim, 1.6)
                        border.width: 1

                        Text {
                            id: tabText
                            anchors.centerIn: parent
                            text: parent.modelData.label
                            color: root.activeTab === parent.modelData.id ? root.foreground : root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.bodySmall
                            font.bold: root.activeTab === parent.modelData.id
                        }

                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                root.activeTab = parent.modelData.id;
                            }
                        }
                    }
                }

                // Refresh Button
                Rectangle {
                    width: Style.space(28)
                    height: Style.space(28)
                    radius: Style.space(6)
                    color: refreshArea.containsMouse ? Style.hoverFillFor(root.foreground, Color.accent) : "transparent"
                    border.color: Qt.darker(root.dim, 1.6)
                    border.width: 1

                    Text {
                        anchors.centerIn: parent
                        text: "↻"
                        color: root.loading ? Color.accent : root.foreground
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
            visible: root.activeTab !== "laggards" && root.topBullish && root.topBullish.length > 0
            width: parent.width
            height: Style.space(30)
            spacing: Style.space(8)

            Text {
                anchors.verticalCenter: parent.verticalCenter
                text: "LEADERS:"
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
            }

            Repeater {
                model: root.topBullish.slice(0, 4)

                Rectangle {
                    id: attackPill
                    required property var modelData
                    width: pillRow.implicitWidth + Style.space(12)
                    height: Style.space(24)
                    radius: Style.space(4)
                    color: Style.hoverFillFor(root.upColor, 0.15)
                    border.color: root.upColor
                    border.width: 1

                    Row {
                        id: pillRow
                        anchors.centerIn: parent
                        spacing: Style.space(6)

                        Text {
                            text: attackPill.modelData.symbol
                            color: root.foreground
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                        }

                        Text {
                            text: attackPill.modelData.pctAttack2u.toFixed(0) + "% 2u-2u"
                            color: root.upColor
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                        }
                    }

                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            if (root.controller)
                                root.controller.openDetail(attackPill.modelData.symbol);
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
                        spacing: Style.space(12)

                        Text {
                            width: Style.space(70)
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
                            width: Style.space(60)
                            text: "BAR"
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                        }

                        Text {
                            width: Style.space(90)
                            horizontalAlignment: Text.AlignRight
                            text: "LIVE PRICE"
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                        }

                        Text {
                            width: Style.space(90)
                            horizontalAlignment: Text.AlignRight
                            text: "TRIGGER"
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                        }

                        Text {
                            width: Style.space(100)
                            horizontalAlignment: Text.AlignRight
                            text: "DISTANCE"
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                        }

                        Text {
                            width: Style.space(220)
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
                            anchors.leftMargin: Style.space(4)
                            anchors.rightMargin: Style.space(4)
                            spacing: Style.space(12)

                            Text {
                                anchors.verticalCenter: parent.verticalCenter
                                width: Style.space(70)
                                text: laggardRow.modelData.symbol
                                color: root.foreground
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.body
                                font.bold: true
                            }

                            Rectangle {
                                anchors.verticalCenter: parent.verticalCenter
                                width: Style.space(60)
                                height: Style.space(20)
                                radius: Style.space(4)
                                color: Style.hoverFillFor(root.foreground, 0.1)

                                Text {
                                    anchors.centerIn: parent
                                    text: laggardRow.modelData.parentBasket
                                    color: root.foreground
                                    font.family: root.fontFamily
                                    font.pixelSize: Style.font.caption
                                    font.bold: true
                                }
                            }

                            Text {
                                anchors.verticalCenter: parent.verticalCenter
                                width: Style.space(60)
                                text: laggardRow.modelData.scenario ? String(laggardRow.modelData.scenario).toUpperCase() : "-"
                                color: laggardRow.modelData.color === "G" ? root.upColor : (laggardRow.modelData.color === "R" ? root.downColor : root.dim)
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
                                width: Style.space(90)
                                horizontalAlignment: Text.AlignRight
                                text: laggardRow.modelData.triggerPrice ? "$" + laggardRow.modelData.triggerPrice.toFixed(2) : "-"
                                color: Color.accent
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.body
                                font.bold: true
                            }

                            Text {
                                anchors.verticalCenter: parent.verticalCenter
                                width: Style.space(100)
                                horizontalAlignment: Text.AlignRight
                                text: (laggardRow.modelData.distToTriggerPct != null) ? laggardRow.modelData.distToTriggerPct.toFixed(2) + "% away" : "-"
                                color: root.warningColor
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.bodySmall
                                font.bold: true
                            }

                            Text {
                                anchors.verticalCenter: parent.verticalCenter
                                width: Style.space(220)
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
                                    root.controller.openDetail(laggardRow.modelData.symbol);
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
                            width: Style.space(130)
                            text: "CATEGORY / NAME"
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                        }

                        Text {
                            width: Style.space(160)
                            text: "STATUS / INTENSITY"
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                        }

                        Text {
                            width: Style.space(140)
                            horizontalAlignment: Text.AlignRight
                            text: "2u-2u ATTACK %"
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                        }

                        Text {
                            width: Style.space(110)
                            horizontalAlignment: Text.AlignRight
                            text: "TODAY 2u / 2d"
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

                        Text {
                            width: Style.space(90)
                            horizontalAlignment: Text.AlignRight
                            text: "ETF BAR"
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
                                    width: Style.space(130)
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

                                Rectangle {
                                    anchors.verticalCenter: parent.verticalCenter
                                    width: Style.space(140)
                                    height: Style.space(22)
                                    radius: Style.space(4)
                                    color: basketBlock.modelData.status === "BULLISH ATTACK" ? Style.hoverFillFor(root.upColor, 0.2) : (basketBlock.modelData.status === "BEARISH ATTACK" ? Style.hoverFillFor(root.downColor, 0.2) : "transparent")
                                    border.color: basketBlock.modelData.status === "BULLISH ATTACK" ? root.upColor : (basketBlock.modelData.status === "BEARISH ATTACK" ? root.downColor : Qt.darker(root.dim, 1.4))
                                    border.width: 1

                                    Text {
                                        anchors.centerIn: parent
                                        text: basketBlock.modelData.status
                                        color: basketBlock.modelData.status === "BULLISH ATTACK" ? root.upColor : (basketBlock.modelData.status === "BEARISH ATTACK" ? root.downColor : root.dim)
                                        font.family: root.fontFamily
                                        font.pixelSize: Style.font.caption
                                        font.bold: true
                                    }
                                }

                                Text {
                                    anchors.verticalCenter: parent.verticalCenter
                                    width: Style.space(140)
                                    horizontalAlignment: Text.AlignRight
                                    text: basketBlock.modelData.pctAttack2u.toFixed(1) + "% (" + basketBlock.modelData.countAttack2u + ")"
                                    color: basketBlock.modelData.pctAttack2u >= 40 ? root.upColor : root.foreground
                                    font.family: root.fontFamily
                                    font.pixelSize: Style.font.body
                                    font.bold: basketBlock.modelData.pctAttack2u >= 40
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

                                Text {
                                    anchors.verticalCenter: parent.verticalCenter
                                    width: Style.space(90)
                                    horizontalAlignment: Text.AlignRight
                                    text: (basketBlock.modelData.etfAttack && basketBlock.modelData.etfAttack.attackType !== "none") ? basketBlock.modelData.etfAttack.attackType.toUpperCase() : "-"
                                    color: (basketBlock.modelData.etfAttack && basketBlock.modelData.etfAttack.direction === "bullish") ? root.upColor : ((basketBlock.modelData.etfAttack && basketBlock.modelData.etfAttack.direction === "bearish") ? root.downColor : root.dim)
                                    font.family: root.fontFamily
                                    font.pixelSize: Style.font.bodySmall
                                    font.bold: true
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
                                        root.controller.openDetail(basketBlock.modelData.symbol);
                                }
                            }
                        }

                        // Expanded Section showing Attacking Constituents
                        Column {
                            visible: root.expandedBasketSymbol === basketBlock.modelData.symbol && basketBlock.modelData.attackConstituents && basketBlock.modelData.attackConstituents.length > 0
                            width: parent.width
                            anchors.leftMargin: Style.space(24)
                            spacing: Style.space(3)

                            Text {
                                text: "ATTACKING CONSTITUENTS (" + (basketBlock.modelData.attackConstituents ? basketBlock.modelData.attackConstituents.length : 0) + "):"
                                color: Color.accent
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.caption
                                font.bold: true
                            }

                            Flow {
                                width: parent.width - Style.space(40)
                                spacing: Style.space(6)

                                Repeater {
                                    model: basketBlock.modelData.attackConstituents

                                    Rectangle {
                                        id: cPill
                                        required property var modelData
                                        width: cPillText.implicitWidth + Style.space(12)
                                        height: Style.space(22)
                                        radius: Style.space(4)
                                        color: Style.hoverFillFor(cPill.modelData.direction === "bullish" ? root.upColor : root.downColor, 0.15)
                                        border.color: cPill.modelData.direction === "bullish" ? root.upColor : root.downColor
                                        border.width: 1

                                        Text {
                                            id: cPillText
                                            anchors.centerIn: parent
                                            text: cPill.modelData.symbol + " (" + cPill.modelData.attackType + ")"
                                            color: root.foreground
                                            font.family: root.fontFamily
                                            font.pixelSize: Style.font.caption
                                            font.bold: true
                                        }

                                        MouseArea {
                                            anchors.fill: parent
                                            cursorShape: Qt.PointingHandCursor
                                            onClicked: {
                                                if (root.controller)
                                                    root.controller.openDetail(cPill.modelData.symbol);
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
