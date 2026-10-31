import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model

Item {
    id: root

    property var supportData: null
    property bool open: false
    property real anchorX: 0
    property real anchorY: 0
    property color foreground: (Color.popups && Color.popups.text) ? Color.popups.text : Color.foreground
    property color dim: Qt.rgba(foreground.r, foreground.g, foreground.b, 0.70)
    property color upColor: Qt.rgba(0.22, 0.50, 0.30, 1)
    property color downColor: Qt.rgba(0.62, 0.22, 0.22, 1)
    property color warningColor: Qt.rgba(0.78, 0.55, 0.15, 1)
    property string fontFamily: Style.font.family

    visible: open && supportData !== null && supportData.hasSupport
    anchors.fill: parent
    z: 9999

    // Click outside to dismiss
    MouseArea {
        anchors.fill: parent
        onClicked: {
            root.open = false;
        }
    }

    Rectangle {
        id: popupCard
        width: Style.space(380)
        height: contentCol.implicitHeight + Style.space(24)
        radius: Style.space(8)
        color: (Color.popups && Color.popups.background) ? Color.popups.background : Color.background
        border.color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.20)
        border.width: 1

        x: Math.max(Style.space(8), Math.min(root.width - width - Style.space(8), root.anchorX - width / 2))
        y: Math.max(Style.space(8), Math.min(root.height - height - Style.space(8), root.anchorY + Style.space(6)))

        MouseArea {
            anchors.fill: parent
            hoverEnabled: true
            preventStealing: true
            onClicked: function (mouse) {
                mouse.accepted = true;
            }
        }

        Column {
            id: contentCol
            anchors.centerIn: parent
            width: parent.width - Style.space(24)
            spacing: Style.space(10)

            // Header Row
            Row {
                width: parent.width

                Text {
                    textFormat: Text.PlainText
                    text: root.supportData ? (root.supportData.basket + " BASKET SUPPORT [" + root.supportData.symbol + " FOCUS · " + root.supportData.timeframe + "]") : "BASKET SUPPORT"
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.body
                    font.bold: true
                    elide: Text.ElideRight
                    width: parent.width - Style.space(24)
                }

                Text {
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
                        onClicked: {
                            root.open = false;
                        }
                    }
                }
            }

            Rectangle {
                width: parent.width
                height: 1
                color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.12)
            }

            // Timeframe Alignment Table (30m, 60m, 1D, 1W, 1M)
            Column {
                width: parent.width
                spacing: Style.space(4)

                Text {
                    textFormat: Text.PlainText
                    text: "TIMEFRAME ALIGNMENT:"
                    color: root.dim
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    font.bold: true
                }

                Repeater {
                    model: (root.supportData && root.supportData.allTimeframes) ? root.supportData.allTimeframes : []

                    Item {
                        id: tfRow
                        required property var modelData
                        width: parent.width
                        height: Style.space(20)

                        Row {
                            anchors.fill: parent
                            spacing: Style.space(8)

                            Text {
                                width: Style.space(40)
                                textFormat: Text.PlainText
                                text: tfRow.modelData.timeframe + (tfRow.modelData.timeframe === (root.supportData ? root.supportData.timeframe : "") ? " *" : "")
                                color: tfRow.modelData.timeframe === (root.supportData ? root.supportData.timeframe : "") ? Color.accent : root.foreground
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.bodySmall
                                font.bold: true
                                anchors.verticalCenter: parent.verticalCenter
                            }

                            Text {
                                width: Style.space(170)
                                textFormat: Text.PlainText
                                text: tfRow.modelData.status || "-"
                                color: {
                                    var st = String(tfRow.modelData.status || "");
                                    if (st.indexOf("BULLISH ATTACK") !== -1)
                                        return root.upColor;
                                    if (st.indexOf("BEARISH ATTACK") !== -1)
                                        return root.downColor;
                                    if (st.indexOf("BUY") !== -1)
                                        return root.upColor;
                                    if (st.indexOf("SELL") !== -1)
                                        return root.downColor;
                                    return root.dim;
                                }
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.bodySmall
                                font.bold: true
                                elide: Text.ElideRight
                                anchors.verticalCenter: parent.verticalCenter
                            }

                            Text {
                                width: Style.space(70)
                                textFormat: Text.PlainText
                                horizontalAlignment: Text.AlignRight
                                text: tfRow.modelData.supportPct != null ? (tfRow.modelData.supportPct + "% " + ((root.supportData && root.supportData.direction === "bearish") ? "2D" : "2U")) : "-"
                                color: {
                                    var p = tfRow.modelData.supportPct;
                                    if (p == null)
                                        return root.dim;
                                    if (p >= 65)
                                        return (root.supportData && root.supportData.direction === "bearish") ? root.downColor : root.upColor;
                                    if (p >= 50)
                                        return root.warningColor;
                                    return root.downColor;
                                }
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.bodySmall
                                font.bold: true
                                anchors.verticalCenter: parent.verticalCenter
                            }

                            Text {
                                width: Style.space(60)
                                textFormat: Text.PlainText
                                horizontalAlignment: Text.AlignRight
                                text: tfRow.modelData.peerScenario ? String(tfRow.modelData.peerScenario).toUpperCase() : "-"
                                color: {
                                    var sc = String(tfRow.modelData.peerScenario || "").toLowerCase();
                                    if (sc === "2u")
                                        return root.upColor;
                                    if (sc === "2d")
                                        return root.downColor;
                                    return root.dim;
                                }
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.bodySmall
                                font.bold: true
                                anchors.verticalCenter: parent.verticalCenter
                            }
                        }
                    }
                }
            }

            Rectangle {
                width: parent.width
                height: 1
                color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.12)
            }

            // Key Peer Row
            Row {
                width: parent.width
                spacing: Style.space(6)

                Text {
                    textFormat: Text.PlainText
                    text: "KEY PEER:"
                    color: root.dim
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    font.bold: true
                    anchors.verticalCenter: parent.verticalCenter
                }

                Text {
                    textFormat: Text.PlainText
                    text: {
                        if (!root.supportData)
                            return "-";
                        var str = root.supportData.peer;
                        if (root.supportData.peerPrice)
                            str += " $" + Number(root.supportData.peerPrice).toFixed(2);
                        return str;
                    }
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                    font.bold: true
                    anchors.verticalCenter: parent.verticalCenter
                }

                Text {
                    textFormat: Text.PlainText
                    text: root.supportData ? root.supportData.peerToken.split(" ")[1] || "" : ""
                    color: {
                        if (!root.supportData)
                            return root.dim;
                        if (root.supportData.peerColor === "green")
                            return root.upColor;
                        if (root.supportData.peerColor === "red")
                            return root.downColor;
                        return root.dim;
                    }
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                    font.bold: true
                    anchors.verticalCenter: parent.verticalCenter
                }

                Text {
                    visible: root.supportData && root.supportData.peerInForce && root.supportData.peerInForce !== "-"
                    textFormat: Text.PlainText
                    text: "· " + (root.supportData ? root.supportData.peerInForce : "")
                    color: root.dim
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    anchors.verticalCenter: parent.verticalCenter
                }
            }

            Rectangle {
                width: parent.width
                height: 1
                color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.12)
            }

            // Position Sizing Section
            Column {
                width: parent.width
                spacing: Style.space(4)

                Text {
                    textFormat: Text.PlainText
                    text: "RECOMMENDED POSITION SIZING:"
                    color: root.dim
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    font.bold: true
                }

                Text {
                    textFormat: Text.PlainText
                    text: root.supportData ? root.supportData.positionSizing : "STAND DOWN (0x)"
                    color: {
                        if (!root.supportData)
                            return root.downColor;
                        if (root.supportData.sizingColor === "green")
                            return root.upColor;
                        if (root.supportData.sizingColor === "amber")
                            return root.warningColor;
                        return root.downColor;
                    }
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodyLarge
                    font.bold: true
                }

                Text {
                    textFormat: Text.PlainText
                    text: root.supportData ? root.supportData.sizingReason : ""
                    color: root.dim
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                    wrapMode: Text.Wrap
                    width: parent.width
                }
            }
        }
    }
}
