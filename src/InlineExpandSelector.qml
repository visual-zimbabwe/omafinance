import QtQuick
import qs.Commons

// Collapsible inline text selector that expands into a row of options on click.
Item {
    id: root

    property var model: []
    property string currentValue: ""
    property string collapsedText: currentValue
    property bool expanded: false
    property color activeColor: Color.foreground
    property color dimColor: Color.muted
    property string fontFamily: Style.font.family
    property int fontSize: Style.font.bodySmall
    property int spacing: Style.space(6)
    property int collapsedMargin: Style.space(4)
    property int optionMargin: Style.space(4)

    signal expandRequested
    signal selected(string value)
    signal collapsed

    implicitWidth: root.expanded ? expandedRow.implicitWidth : collapsedLabel.implicitWidth
    implicitHeight: Math.max(collapsedLabel.implicitHeight, expandedRow.implicitHeight)

    Text {
        id: collapsedLabel
        visible: !root.expanded
        anchors.verticalCenter: parent.verticalCenter
        textFormat: Text.PlainText
        text: root.collapsedText
        color: root.activeColor
        font.family: root.fontFamily
        font.pixelSize: root.fontSize
        font.bold: true

        MouseArea {
            anchors.fill: parent
            anchors.margins: -root.collapsedMargin
            cursorShape: Qt.PointingHandCursor
            hoverEnabled: true
            onClicked: root.expandRequested()
        }
    }

    Row {
        id: expandedRow
        visible: root.expanded
        spacing: root.spacing
        anchors.verticalCenter: parent.verticalCenter

        Repeater {
            model: root.model

            Text {
                required property string modelData
                textFormat: Text.PlainText
                text: modelData
                color: modelData === root.currentValue ? root.activeColor : Qt.rgba(root.dimColor.r, root.dimColor.g, root.dimColor.b, 0.45)
                font.family: root.fontFamily
                font.pixelSize: root.fontSize
                font.bold: modelData === root.currentValue

                MouseArea {
                    anchors.fill: parent
                    anchors.margins: -root.optionMargin
                    cursorShape: Qt.PointingHandCursor
                    hoverEnabled: true
                    onClicked: root.selected(modelData)
                }
            }
        }
    }

    HoverHandler {
        onHoveredChanged: {
            if (!hovered && root.expanded)
                root.collapsed();
        }
    }
}
