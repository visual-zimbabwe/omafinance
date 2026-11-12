import QtQuick
import QtQuick.Controls as QQC
import qs.Commons

// Compact interactive chip/toggle for dense chart toolbars and inline badges.
Rectangle {
    id: root

    property string text: ""
    property string iconText: ""
    property bool checked: false
    property bool bordered: false
    property bool focusable: false
    property string tooltipText: ""
    property color foreground: Color.foreground
    property color dimColor: Color.muted
    property color accentColor: Color.accent
    property string fontFamily: Style.font.family
    property int fontSize: Style.font.bodySmall
    property bool boldWhenChecked: true
    property int horizontalPadding: Style.space(6)
    property int verticalPadding: Style.space(3)
    property int cornerRadius: Style.space(4)

    readonly property bool hovered: mouseArea.containsMouse
    readonly property bool pressed: mouseArea.pressed && root.enabled

    signal clicked

    implicitWidth: contentRow.implicitWidth + horizontalPadding * 2
    implicitHeight: Math.max(Style.space(18), contentRow.implicitHeight + verticalPadding * 2)
    radius: cornerRadius
    opacity: enabled ? 1.0 : 0.45
    activeFocusOnTab: focusable && enabled
    scale: pressed ? 0.97 : 1.0

    Accessible.role: Accessible.Button
    Accessible.name: root.text || root.tooltipText
    Accessible.checkable: true
    Accessible.checked: root.checked

    Keys.onReturnPressed: if (focusable && enabled)
        root.clicked()
    Keys.onEnterPressed: if (focusable && enabled)
        root.clicked()
    Keys.onSpacePressed: if (focusable && enabled)
        root.clicked()

    color: {
        if (!root.enabled)
            return "transparent";
        if (root.pressed)
            return Style.pressedFillFor(root.foreground, root.accentColor);
        if (root.focusable && root.activeFocus)
            return Style.focusFillFor(root.foreground, root.accentColor);
        if (root.hovered)
            return Style.hoverFillFor(root.foreground, root.accentColor);
        if (root.checked)
            return Style.selectedFillFor(root.foreground, root.accentColor);
        return root.bordered ? Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.08) : "transparent";
    }

    border.width: (root.bordered || root.checked || (root.focusable && root.activeFocus) || root.hovered) ? Style.normalBorderWidth : 0
    border.color: {
        if (root.focusable && root.activeFocus)
            return root.accentColor;
        if (root.checked)
            return Qt.rgba(root.accentColor.r, root.accentColor.g, root.accentColor.b, 0.45);
        if (root.hovered)
            return Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.25);
        return root.bordered ? Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.20) : "transparent";
    }

    Behavior on color {
        ColorAnimation {
            duration: Style.duration(120)
        }
    }

    Behavior on border.color {
        ColorAnimation {
            duration: Style.duration(120)
        }
    }

    Behavior on scale {
        NumberAnimation {
            duration: Style.duration(90)
        }
    }

    Row {
        id: contentRow
        anchors.centerIn: parent
        spacing: Style.space(4)

        Text {
            visible: root.iconText !== ""
            textFormat: Text.PlainText
            text: root.iconText
            color: root.checked ? root.foreground : root.dimColor
            font.family: root.fontFamily
            font.pixelSize: root.fontSize
            font.bold: root.boldWhenChecked && root.checked
            anchors.verticalCenter: parent.verticalCenter
        }

        Text {
            visible: root.text !== ""
            textFormat: Text.PlainText
            text: root.text
            color: root.checked ? root.foreground : root.dimColor
            font.family: root.fontFamily
            font.pixelSize: root.fontSize
            font.bold: root.boldWhenChecked && root.checked
            anchors.verticalCenter: parent.verticalCenter
        }
    }

    MouseArea {
        id: mouseArea
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: root.enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
        onClicked: if (root.enabled)
            root.clicked()
    }

    QQC.ToolTip.visible: root.tooltipText !== "" && mouseArea.containsMouse
    QQC.ToolTip.delay: 400
    QQC.ToolTip.text: root.tooltipText
}
