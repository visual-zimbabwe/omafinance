import QtQuick
import qs.Commons

Item {
    id: root

    property int orientation: Qt.Horizontal // Qt.Horizontal splits rows (drags Y), Qt.Vertical splits columns (drags X)
    property real ratio: 0.5
    property real defaultRatio: 0.5
    property real minRatio: 0.15
    property real maxRatio: 0.85
    property real totalSpan: 100

    property color subtleBorderColor: Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.12)
    property color activeBorderColor: Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.40)

    signal ratioChangedManually(real nextRatio)

    implicitWidth: orientation === Qt.Vertical ? Style.space(6) : parent.width
    implicitHeight: orientation === Qt.Horizontal ? Style.space(6) : parent.height
    z: 100

    property real dragStartMousePos: 0
    property real dragStartRatio: 0.5
    property bool dragging: false

    readonly property bool isHovered: mouseArea.containsMouse

    Rectangle {
        id: line
        x: root.orientation === Qt.Vertical ? Math.round((root.width - 1) / 2) : 0
        y: root.orientation === Qt.Horizontal ? Math.round((root.height - 1) / 2) : 0
        width: root.orientation === Qt.Vertical ? 1 : parent.width
        height: root.orientation === Qt.Horizontal ? 1 : parent.height
        color: (root.isHovered || root.dragging) ? root.activeBorderColor : root.subtleBorderColor
    }

    MouseArea {
        id: mouseArea
        anchors.fill: parent
        hoverEnabled: true
        preventStealing: true
        cursorShape: root.orientation === Qt.Horizontal ? Qt.SplitVCursor : Qt.SplitHCursor

        onPressed: function (mouse) {
            root.dragging = true;
            root.dragStartRatio = root.ratio;
            root.dragStartMousePos = root.orientation === Qt.Horizontal ? mouse.y : mouse.x;
        }

        onPositionChanged: function (mouse) {
            if (!root.dragging || root.totalSpan <= 0)
                return;
            var currentPos = root.orientation === Qt.Horizontal ? mouse.y : mouse.x;
            var delta = currentPos - root.dragStartMousePos;
            var deltaRatio = delta / root.totalSpan;
            var newRatio = Math.max(root.minRatio, Math.min(root.maxRatio, root.ratio + deltaRatio));
            if (Math.abs(newRatio - root.ratio) > 0.001) {
                root.ratio = newRatio;
                root.ratioChangedManually(newRatio);
            }
        }

        onReleased: {
            root.dragging = false;
        }

        onCanceled: {
            root.dragging = false;
        }

        onDoubleClicked: {
            root.ratio = root.defaultRatio;
            root.ratioChangedManually(root.defaultRatio);
        }
    }
}
