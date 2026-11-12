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
    color: linkColor
    font.family: fontFamily
    font.pixelSize: Style.font.body
    elide: Text.ElideRight
    activeFocusOnTab: true

    Accessible.role: Accessible.Button
    Accessible.name: qsTr("Back to %1").arg(label)

    Keys.onReturnPressed: root.triggered()
    Keys.onSpacePressed: root.triggered()

    MouseArea {
        anchors.fill: parent
        anchors.margins: -Style.space(6)
        cursorShape: Qt.PointingHandCursor
        onClicked: root.triggered()
    }
}
