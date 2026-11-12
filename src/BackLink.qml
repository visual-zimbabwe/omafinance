import QtQuick
import qs.Commons

Text {
    id: root
    property string label: qsTr("Watchlist")
    property color linkColor: Color.foreground
    property string fontFamily: Style.font.family
    signal triggered

    text: (LayoutMirroring.enabled ? "› " : "‹ ") + label
    textFormat: Text.PlainText
    color: (root.activeFocus || mouseArea.containsMouse) ? Color.foreground : linkColor
    font.family: fontFamily
    font.pixelSize: Style.font.body
    font.underline: root.activeFocus || mouseArea.containsMouse
    elide: Text.ElideRight
    activeFocusOnTab: true
    scale: mouseArea.pressed ? 0.97 : 1

    Behavior on color {
        ColorAnimation {
            duration: Style.duration(120)
        }
    }

    Behavior on scale {
        NumberAnimation {
            duration: Style.duration(90)
        }
    }

    Accessible.role: Accessible.Button
    Accessible.name: qsTr("Back to %1").arg(label)

    Keys.onReturnPressed: root.triggered()
    Keys.onSpacePressed: root.triggered()

    MouseArea {
        id: mouseArea
        anchors.fill: parent
        anchors.margins: -Style.space(6)
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: root.triggered()
    }
}
