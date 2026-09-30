import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model

Item {
    id: root

    property var checklistData: null
    property bool open: false
    property real anchorX: 0
    property real anchorY: 0
    property color foreground: Color.foreground
    property color dim: Qt.darker(foreground, 1.45)
    property color upColor: Qt.rgba(0.22, 0.50, 0.30, 1)
    property color downColor: Qt.rgba(0.62, 0.22, 0.22, 1)
    property string fontFamily: Style.font.family

    property int hoveredRuleIndex: -1

    visible: open && checklistData !== null
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
        width: Style.space(340)
        height: contentCol.implicitHeight + Style.space(24)
        radius: Style.space(8)
        color: Color.background
        border.color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.15)
        border.width: 1

        x: Math.max(Style.space(8), Math.min(root.width - width - Style.space(8), root.anchorX - width / 2))
        y: Math.max(Style.space(8), Math.min(root.height - height - Style.space(8), root.anchorY + Style.space(6)))

        // Prevent outside-click inside card
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
            width: parent.width - Style.space(20)
            spacing: Style.space(8)

            // Header Row (Text & Color Only)
            Row {
                width: parent.width
                spacing: Style.space(8)

                Text {
                    text: root.checklistData ? ("STRAT: " + root.checklistData.symbol) : "STRAT CHECKLIST"
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.body
                    font.bold: true
                    anchors.verticalCenter: parent.verticalCenter
                }

                Item {
                    width: parent.width - (parent.children[0].implicitWidth + parent.children[2].implicitWidth + Style.space(16))
                    height: 1
                }

                // Score text (Text & Color only, no box/border)
                Text {
                    text: root.checklistData ? root.checklistData.badgeText : "0/9"
                    color: {
                        if (!root.checklistData)
                            return root.dim;
                        if (!root.checklistData.isTradeable)
                            return root.dim;
                        return root.checklistData.direction === "SHORT" ? root.downColor : root.upColor;
                    }
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.body
                    font.bold: true
                    anchors.verticalCenter: parent.verticalCenter
                }
            }

            // Direction / Status Tag (Text & Color Only)
            Text {
                text: {
                    if (!root.checklistData)
                        return "";
                    var dir = root.checklistData.direction ? ("[" + root.checklistData.direction + "] ") : "";
                    return dir + (root.checklistData.isTradeable ? "TRADEABLE - All 9 Rules Verified" : "BLOCKED - " + root.checklistData.passedCount + "/9 Rules Met");
                }
                color: {
                    if (!root.checklistData)
                        return root.dim;
                    if (!root.checklistData.isTradeable)
                        return root.dim;
                    return root.checklistData.direction === "SHORT" ? root.downColor : root.upColor;
                }
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall - 1
                font.bold: true
            }

            // Divider
            Rectangle {
                width: parent.width
                height: 1
                color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.10)
            }

            // 9 Rules List
            Column {
                width: parent.width
                spacing: Style.space(4)

                Repeater {
                    model: root.checklistData ? root.checklistData.rules : []

                    Item {
                        id: ruleItem
                        required property var modelData
                        required property int index
                        width: parent.width
                        height: ruleCol.implicitHeight + Style.space(4)

                        Rectangle {
                            anchors.fill: parent
                            radius: Style.space(4)
                            color: ruleItemHover.containsMouse ? Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.05) : "transparent"
                        }

                        Row {
                            id: ruleCol
                            anchors.verticalCenter: parent.verticalCenter
                            anchors.left: parent.left
                            anchors.right: parent.right
                            spacing: Style.space(8)

                            // Status Text (Text & Color only, no pill box)
                            Text {
                                text: ruleItem.modelData.passed ? "PASS" : "FAIL"
                                color: ruleItem.modelData.passed ? root.upColor : root.downColor
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.bodySmall - 2
                                font.bold: true
                                anchors.top: parent.top
                                anchors.topMargin: 1
                            }

                            // Rule Title & Detail
                            Column {
                                width: parent.width - Style.space(40)
                                spacing: 1

                                Text {
                                    width: parent.width
                                    text: ruleItem.modelData.shortTitle
                                    color: ruleItem.modelData.passed ? root.foreground : root.downColor
                                    font.family: root.fontFamily
                                    font.pixelSize: Style.font.bodySmall - 1
                                    font.bold: true
                                    elide: Text.ElideRight
                                }

                                Text {
                                    width: parent.width
                                    text: ruleItem.modelData.detail
                                    color: root.dim
                                    font.family: root.fontFamily
                                    font.pixelSize: Style.font.bodySmall - 2
                                    elide: Text.ElideRight
                                }
                            }
                        }

                        MouseArea {
                            id: ruleItemHover
                            anchors.fill: parent
                            hoverEnabled: true
                            onEntered: {
                                root.hoveredRuleIndex = ruleItem.index;
                            }
                            onExited: {
                                if (root.hoveredRuleIndex === ruleItem.index) {
                                    root.hoveredRuleIndex = -1;
                                }
                            }
                        }
                    }
                }
            }

            // Hover Tooltip / Rationale Card
            Rectangle {
                width: parent.width
                height: rationaleCol.implicitHeight + Style.space(10)
                radius: Style.space(4)
                color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.04)
                border.color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.10)
                border.width: 1
                visible: root.hoveredRuleIndex >= 0 && root.checklistData && root.checklistData.rules && root.checklistData.rules[root.hoveredRuleIndex]

                Column {
                    id: rationaleCol
                    anchors.centerIn: parent
                    width: parent.width - Style.space(12)
                    spacing: 2

                    Text {
                        text: "STRAT RATIONALE"
                        color: Color.accent
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall - 3
                        font.bold: true
                    }

                    Text {
                        width: parent.width
                        text: (root.hoveredRuleIndex >= 0 && root.checklistData && root.checklistData.rules && root.checklistData.rules[root.hoveredRuleIndex]) ? root.checklistData.rules[root.hoveredRuleIndex].rationale : ""
                        color: root.foreground
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall - 2
                        wrapMode: Text.WordWrap
                    }
                }
            }
        }
    }
}
