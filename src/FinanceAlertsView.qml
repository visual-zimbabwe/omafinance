import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model

Column {
    id: alertsViewRoot
    required property var controller
    width: parent.width
    spacing: Style.space(12)
    visible: controller.view === "alerts"

    property string draftSymbol: controller.detailSymbol || (controller.watchlist && controller.watchlist.length > 0 ? controller.watchlist[0] : "SPY")
    property string draftPrice: ""
    property string draftCondition: "CROSSES_ABOVE"
    property string draftNote: ""
    property string formError: ""

    readonly property var workingPriceAlerts: {
        var map = controller.symbolLevels || ({});
        var syms = Object.keys(map);
        var out = [];
        for (var i = 0; i < syms.length; i++) {
            var sym = syms[i];
            var lvls = map[sym];
            if (!Array.isArray(lvls))
                continue;
            for (var j = 0; j < lvls.length; j++) {
                var lvl = lvls[j];
                if (lvl && lvl.alertEnabled) {
                    var q = controller.quoteFor(sym);
                    var curP = (q && typeof q.price === "number" && isFinite(q.price)) ? q.price : null;
                    var distPct = (curP !== null && curP > 0 && typeof lvl.price === "number") ? (((lvl.price - curP) / curP) * 100) : null;
                    out.push({
                        symbol: sym,
                        levelIndex: j,
                        price: lvl.price,
                        condition: lvl.alertCondition || "CROSSES_ABOVE",
                        triggered: Boolean(lvl.alertTriggered),
                        text: lvl.text || "",
                        sourceTf: lvl.sourceTf || "60",
                        currentPrice: curP,
                        distancePct: distPct
                    });
                }
            }
        }
        return out;
    }

    function submitQuickPriceAlert() {
        var sym = Model.normalizeSymbol(symbolInput.text || alertsViewRoot.draftSymbol);
        var priceVal = Number(priceInput.text);
        if (!sym) {
            alertsViewRoot.formError = qsTr("Enter a valid ticker symbol.");
            return;
        }
        if (!isFinite(priceVal) || priceVal <= 0) {
            alertsViewRoot.formError = qsTr("Enter a positive target price.");
            return;
        }
        alertsViewRoot.formError = "";
        controller.createPriceAlert(sym, priceVal, alertsViewRoot.draftCondition, noteInput.text.trim());
        priceInput.text = "";
        noteInput.text = "";
    }

    Item {
        width: parent.width
        height: backLabel.implicitHeight

        BackLink {
            id: backLabel
            anchors.left: parent.left
            linkColor: controller.dim
            fontFamily: controller.contentFontFamily
            onTriggered: controller.view = "list"
        }

        Text {
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            text: alertsViewRoot.workingPriceAlerts.length + " Armed · " + (controller.armedWatchlistSetups ? controller.armedWatchlistSetups.length : 0) + " Radar"
            color: controller.dim
            font.family: controller.contentFontFamily
            font.pixelSize: Style.font.bodySmall
        }
    }

    Text {
        text: "Alert Book & Study Radar"
        color: controller.contentForeground
        font.family: controller.contentFontFamily
        font.pixelSize: Style.font.heading
        font.bold: true
    }

    // Section 0: Mute (chart-only days). Engines keep tracking; delivery is suppressed.
    FinanceSurface {
        id: muteCard
        elevation: 1
        radiusToken: "lg"
        foregroundColor: controller.contentForeground
        surfaceColor: controller.alertsMuted ? Qt.rgba(controller.contentUrgent.r, controller.contentUrgent.g, controller.contentUrgent.b, 0.12) : Qt.rgba(controller.dim.r, controller.dim.g, controller.dim.b, 0.08)
        borderColorOverride: controller.alertsMuted ? Qt.rgba(controller.contentUrgent.r, controller.contentUrgent.g, controller.contentUrgent.b, 0.45) : "transparent"
        width: parent.width
        implicitHeight: muteCol.implicitHeight + Style.space(18)

        Column {
            id: muteCol
            anchors.fill: parent
            anchors.margins: Style.space(9)
            spacing: Style.space(8)

            Text {
                width: parent.width
                text: controller.alertsMuted ? ("\uf1f6  " + controller.alertsMuteStatus) : "\uf0f3  Alerts live"
                color: controller.alertsMuted ? controller.contentUrgent : controller.contentForeground
                font.family: controller.contentFontFamily
                font.pixelSize: Style.font.bodySmall
                font.bold: true
                elide: Text.ElideRight
            }

            Text {
                width: parent.width
                visible: controller.alertsMuted
                text: qsTr("No notifications, sounds, or Discord posts. Muted events are still logged below.")
                color: controller.dim
                font.family: controller.contentFontFamily
                font.pixelSize: Style.font.caption
                lineHeight: 1.3
                wrapMode: Text.WordWrap
            }

            Row {
                spacing: Style.space(6)

                Repeater {
                    model: controller.alertsMuted ? [
                        {
                            mode: "",
                            label: "Unmute"
                        }
                    ] : [
                        {
                            mode: "open",
                            label: "Mute until open"
                        },
                        {
                            mode: "1h",
                            label: "Mute 1h"
                        },
                        {
                            mode: "indefinite",
                            label: "Mute until I unmute"
                        }
                    ]

                    delegate: Button {
                        required property var modelData
                        bordered: true
                        text: modelData.label
                        foreground: controller.contentForeground
                        fontFamily: controller.contentFontFamily
                        fontSize: Style.font.bodySmall
                        onClicked: controller.setAlertsMute(modelData.mode)
                    }
                }
            }
        }
    }

    // Section 1: Create Price Alert
    FinanceSurface {
        elevation: 1
        radiusToken: "lg"
        foregroundColor: controller.contentForeground
        width: parent.width
        implicitHeight: createCol.implicitHeight + Style.space(18)

        Column {
            id: createCol
            anchors.fill: parent
            anchors.margins: Style.space(9)
            spacing: Style.space(8)

            Text {
                text: "Create Price Crossover Alert"
                color: controller.contentForeground
                font.family: controller.contentFontFamily
                font.pixelSize: Style.font.bodySmall
                font.bold: true
            }

            Row {
                width: parent.width
                spacing: Style.space(6)

                TextField {
                    id: symbolInput
                    width: Style.space(72)
                    placeholderText: "SYM"
                    foreground: controller.contentForeground
                    font.family: controller.contentFontFamily
                    text: alertsViewRoot.draftSymbol
                    onTextChanged: alertsViewRoot.formError = ""
                }

                Button {
                    id: condBtn
                    bordered: true
                    width: Style.space(52)
                    height: symbolInput.implicitHeight
                    text: alertsViewRoot.draftCondition === "CROSSES_BELOW" ? "<=" : (alertsViewRoot.draftCondition === "CROSSES" ? "<>" : ">=")
                    tooltipText: alertsViewRoot.draftCondition === "CROSSES_BELOW" ? qsTr("Crosses below") : (alertsViewRoot.draftCondition === "CROSSES" ? qsTr("Crosses either way") : qsTr("Crosses above"))
                    foreground: controller.contentForeground
                    fontFamily: controller.contentFontFamily
                    fontSize: Style.font.bodySmall
                    onClicked: {
                        alertsViewRoot.draftCondition = (alertsViewRoot.draftCondition === "CROSSES_ABOVE") ? "CROSSES_BELOW" : (alertsViewRoot.draftCondition === "CROSSES_BELOW" ? "CROSSES" : "CROSSES_ABOVE");
                    }
                }

                TextField {
                    id: priceInput
                    width: Style.space(86)
                    placeholderText: "Price"
                    foreground: controller.contentForeground
                    font.family: controller.contentFontFamily
                    onTextChanged: alertsViewRoot.formError = ""
                    Keys.onReturnPressed: alertsViewRoot.submitQuickPriceAlert()
                }

                TextField {
                    id: noteInput
                    width: Math.max(Style.space(60), parent.width - symbolInput.width - condBtn.width - priceInput.width - armBtn.width - Style.space(24))
                    placeholderText: "Note (T1 / Trigger)"
                    foreground: controller.contentForeground
                    font.family: controller.contentFontFamily
                    Keys.onReturnPressed: alertsViewRoot.submitQuickPriceAlert()
                }

                Button {
                    id: armBtn
                    bordered: true
                    selected: true
                    height: symbolInput.implicitHeight
                    text: qsTr("Arm")
                    foreground: controller.upColor
                    accent: controller.upColor
                    fontFamily: controller.contentFontFamily
                    fontSize: Style.font.bodySmall
                    Accessible.name: qsTr("Arm price alert")
                    onClicked: alertsViewRoot.submitQuickPriceAlert()
                }
            }

            FinanceStatusBanner {
                width: parent.width
                compact: true
                tone: "error"
                text: alertsViewRoot.formError
                fontFamily: controller.contentFontFamily
                foreground: controller.contentForeground
                dimColor: controller.dim
                errorColor: controller.contentUrgent
            }
        }
    }

    // Section 2: Working Price Alerts
    Column {
        width: parent.width
        spacing: Style.space(6)

        Item {
            width: parent.width
            height: workingTitle.implicitHeight

            Text {
                id: workingTitle
                anchors.left: parent.left
                text: "Working Price Alerts (" + alertsViewRoot.workingPriceAlerts.length + ")"
                color: controller.contentForeground
                font.family: controller.contentFontFamily
                font.pixelSize: Style.font.bodySmall
                font.bold: true
            }

            Text {
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                text: "Alt+Right-Click chart to draw"
                color: controller.dim
                font.family: controller.contentFontFamily
                font.pixelSize: Style.font.bodySmall - 1
            }
        }

        Text {
            visible: alertsViewRoot.workingPriceAlerts.length === 0
            width: parent.width
            text: "No price crossover alerts armed. Create one above or click ALRT ON on any chart level."
            color: controller.dim
            font.family: controller.contentFontFamily
            font.pixelSize: Style.font.bodySmall
            wrapMode: Text.WordWrap
        }

        Repeater {
            model: alertsViewRoot.workingPriceAlerts

            delegate: FinanceSurface {
                required property var modelData
                elevation: 1
                radiusToken: "md"
                foregroundColor: controller.contentForeground
                width: alertsViewRoot.width
                height: Style.space(42)

                Row {
                    anchors.fill: parent
                    anchors.margins: Style.space(7)
                    spacing: Style.space(8)

                    Rectangle {
                        width: Style.space(52)
                        height: Style.space(20)
                        anchors.verticalCenter: parent.verticalCenter
                        radius: Style.space(4)
                        color: modelData.triggered ? Qt.rgba(0.22, 0.50, 0.30, 0.25) : Qt.rgba(0.82, 0.60, 0.16, 0.25)

                        Text {
                            anchors.centerIn: parent
                            text: modelData.triggered ? "HIT" : (modelData.condition === "CROSSES_BELOW" ? "ALRT <=" : (modelData.condition === "CROSSES" ? "ALRT <>" : "ALRT >="))
                            color: controller.contentForeground
                            font.family: controller.contentFontFamily
                            font.pixelSize: Style.font.bodySmall - 2
                            font.bold: true
                        }
                    }

                    Column {
                        width: Math.max(Style.space(80), parent.width - Style.space(185))
                        anchors.verticalCenter: parent.verticalCenter
                        spacing: Style.space(1)

                        Text {
                            width: parent.width
                            text: modelData.symbol + " $" + Number(modelData.price).toFixed(2) + (modelData.text ? (" · " + modelData.text) : "")
                            color: controller.contentForeground
                            font.family: controller.contentFontFamily
                            font.pixelSize: Style.font.bodySmall
                            font.bold: true
                            elide: Text.ElideRight
                        }

                        Text {
                            width: parent.width
                            text: {
                                if (modelData.currentPrice === null)
                                    return "Waiting for quote...";
                                var sign = modelData.distancePct >= 0 ? "+" : "";
                                return "Last $" + Number(modelData.currentPrice).toFixed(2) + " (" + sign + Number(modelData.distancePct).toFixed(2) + "% to level)";
                            }
                            color: controller.dim
                            font.family: controller.contentFontFamily
                            font.pixelSize: Style.font.bodySmall - 1
                            elide: Text.ElideRight
                        }
                    }

                    Rectangle {
                        width: Style.space(44)
                        height: Style.space(22)
                        anchors.verticalCenter: parent.verticalCenter
                        radius: Style.space(4)
                        color: Qt.rgba(controller.contentForeground.r, controller.contentForeground.g, controller.contentForeground.b, 0.12)

                        Text {
                            anchors.centerIn: parent
                            text: "Grid"
                            color: controller.contentForeground
                            font.family: controller.contentFontFamily
                            font.pixelSize: Style.font.bodySmall - 1
                            font.bold: true
                        }

                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: controller.openGrid(modelData.symbol)
                        }
                    }

                    Rectangle {
                        visible: modelData.triggered
                        width: Style.space(46)
                        height: Style.space(22)
                        anchors.verticalCenter: parent.verticalCenter
                        radius: Style.space(4)
                        color: Qt.rgba(0.22, 0.50, 0.30, 0.25)

                        Text {
                            anchors.centerIn: parent
                            text: "Arm"
                            color: controller.contentForeground
                            font.family: controller.contentFontFamily
                            font.pixelSize: Style.font.bodySmall - 1
                            font.bold: true
                        }

                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: controller.rearmPriceAlert(modelData.symbol, modelData.levelIndex)
                        }
                    }

                    Rectangle {
                        width: Style.space(24)
                        height: Style.space(22)
                        anchors.verticalCenter: parent.verticalCenter
                        radius: Style.space(4)
                        color: Qt.rgba(0.62, 0.22, 0.22, 0.22)

                        Text {
                            anchors.centerIn: parent
                            text: "×"
                            color: controller.contentForeground
                            font.family: controller.contentFontFamily
                            font.pixelSize: Style.font.bodySmall
                            font.bold: true
                        }

                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: controller.removePriceAlert(modelData.symbol, modelData.levelIndex)
                        }
                    }
                }
            }
        }
    }

    // Section 3: Watchlist Strat Radar
    Column {
        width: parent.width
        spacing: Style.space(6)

        Item {
            width: parent.width
            height: radarTitle.implicitHeight

            Text {
                id: radarTitle
                anchors.left: parent.left
                text: "Watchlist Strat Radar (" + (controller.armedWatchlistSetups ? controller.armedWatchlistSetups.length : 0) + ")"
                color: controller.contentForeground
                font.family: controller.contentFontFamily
                font.pixelSize: Style.font.bodySmall
                font.bold: true
            }

            Text {
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                text: "Scan Watchlist"
                color: controller.dim
                font.family: controller.contentFontFamily
                font.pixelSize: Style.font.bodySmall - 1
                font.underline: true

                MouseArea {
                    anchors.fill: parent
                    anchors.margins: Style.space(-4)
                    cursorShape: Qt.PointingHandCursor
                    onClicked: controller.triggerWatchlistStratScan()
                }
            }
        }

        Text {
            visible: !controller.armedWatchlistSetups || controller.armedWatchlistSetups.length === 0
            width: parent.width
            text: "No TRADEABLE or ARMED Strat setups detected across your watchlist."
            color: controller.dim
            font.family: controller.contentFontFamily
            font.pixelSize: Style.font.bodySmall
            wrapMode: Text.WordWrap
        }

        Repeater {
            model: controller.armedWatchlistSetups || []

            delegate: FinanceSurface {
                required property var modelData
                elevation: 1
                radiusToken: "md"
                foregroundColor: controller.contentForeground
                width: alertsViewRoot.width
                height: Style.space(42)

                Row {
                    anchors.fill: parent
                    anchors.margins: Style.space(7)
                    spacing: Style.space(8)

                    Rectangle {
                        width: Style.space(62)
                        height: Style.space(20)
                        anchors.verticalCenter: parent.verticalCenter
                        radius: Style.space(4)
                        color: modelData.status === "TRADEABLE" ? Qt.rgba(0.22, 0.50, 0.30, 0.28) : Qt.rgba(0.82, 0.60, 0.16, 0.25)

                        Text {
                            anchors.centerIn: parent
                            text: modelData.status
                            color: controller.contentForeground
                            font.family: controller.contentFontFamily
                            font.pixelSize: Style.font.bodySmall - 2
                            font.bold: true
                        }
                    }

                    Column {
                        width: Math.max(Style.space(80), parent.width - Style.space(125))
                        anchors.verticalCenter: parent.verticalCenter
                        spacing: Style.space(1)

                        Text {
                            width: parent.width
                            text: modelData.symbol + " [" + modelData.direction + "] · " + modelData.setupTimeframe + " (" + modelData.passedCount + "/" + modelData.totalCount + ")"
                            color: controller.contentForeground
                            font.family: controller.contentFontFamily
                            font.pixelSize: Style.font.bodySmall
                            font.bold: true
                            elide: Text.ElideRight
                        }

                        Text {
                            width: parent.width
                            text: "Trigger $" + Number(modelData.triggerPrice || 0).toFixed(2) + " | Stop $" + Number(modelData.stopPrice || 0).toFixed(2) + (modelData.targetPrice ? (" | T1 $" + Number(modelData.targetPrice).toFixed(2)) : "")
                            color: controller.dim
                            font.family: controller.contentFontFamily
                            font.pixelSize: Style.font.bodySmall - 1
                            elide: Text.ElideRight
                        }
                    }

                    Rectangle {
                        width: Style.space(44)
                        height: Style.space(22)
                        anchors.verticalCenter: parent.verticalCenter
                        radius: Style.space(4)
                        color: Qt.rgba(controller.contentForeground.r, controller.contentForeground.g, controller.contentForeground.b, 0.12)

                        Text {
                            anchors.centerIn: parent
                            text: "Grid"
                            color: controller.contentForeground
                            font.family: controller.contentFontFamily
                            font.pixelSize: Style.font.bodySmall - 1
                            font.bold: true
                        }

                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: controller.openGrid(modelData.symbol)
                        }
                    }
                }
            }
        }
    }

    // Section 4: Triggered Alert Log
    Column {
        width: parent.width
        spacing: Style.space(6)

        Item {
            width: parent.width
            height: logTitle.implicitHeight

            Text {
                id: logTitle
                anchors.left: parent.left
                text: "Triggered Alert Log (" + (controller.alertLog ? controller.alertLog.length : 0) + ")"
                color: controller.contentForeground
                font.family: controller.contentFontFamily
                font.pixelSize: Style.font.bodySmall
                font.bold: true
            }

            Button {
                visible: Boolean(controller.alertLog && controller.alertLog.length > 0)
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                text: qsTr("Clear")
                foreground: controller.dim
                fontFamily: controller.contentFontFamily
                fontSize: Style.font.caption
                horizontalPadding: Style.space(6)
                verticalPadding: Style.space(2)
                onClicked: controller.clearAlertLog()
            }
        }

        Text {
            visible: !controller.alertLog || controller.alertLog.length === 0
            width: parent.width
            text: "No triggered alerts recorded yet."
            color: controller.dim
            font.family: controller.contentFontFamily
            font.pixelSize: Style.font.bodySmall
        }

        Repeater {
            model: controller.alertLog ? controller.alertLog.slice(0, 12) : []

            delegate: FinanceSurface {
                required property var modelData
                elevation: 1
                radiusToken: "md"
                foregroundColor: controller.contentForeground
                width: alertsViewRoot.width
                height: Style.space(40)

                Row {
                    anchors.fill: parent
                    anchors.margins: Style.space(6)
                    spacing: Style.space(8)

                    Column {
                        width: Math.max(Style.space(80), parent.width - Style.space(58))
                        anchors.verticalCenter: parent.verticalCenter
                        spacing: Style.space(1)

                        Text {
                            width: parent.width
                            text: {
                                var d = new Date(modelData.timestampMs);
                                var tStr = d.toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    second: "2-digit"
                                });
                                return modelData.symbol + " · " + modelData.eventType + (modelData.muted ? " · MUTED" : "") + " (" + tStr + ")";
                            }
                            color: modelData.muted ? controller.dim : controller.contentForeground
                            font.family: controller.contentFontFamily
                            font.pixelSize: Style.font.bodySmall
                            font.bold: true
                            elide: Text.ElideRight
                        }

                        Text {
                            width: parent.width
                            text: String(modelData.body || modelData.title || "").replace(/\n/g, " · ")
                            color: controller.dim
                            font.family: controller.contentFontFamily
                            font.pixelSize: Style.font.bodySmall - 1
                            elide: Text.ElideRight
                        }
                    }

                    Button {
                        bordered: true
                        height: Style.space(24)
                        anchors.verticalCenter: parent.verticalCenter
                        text: qsTr("Grid")
                        foreground: controller.contentForeground
                        fontFamily: controller.contentFontFamily
                        fontSize: Style.font.caption
                        horizontalPadding: Style.space(8)
                        verticalPadding: Style.space(2)
                        onClicked: controller.openGrid(modelData.symbol)
                    }
                }
            }
        }
    }
}
