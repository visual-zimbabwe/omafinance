import QtQuick
import qs.Commons
import "Model.js" as Model

// Shared delayed spinner and optional determinate progress bar.
Item {
    id: root

    property bool active: false
    property string pendingKey: ""
    property int delayMs: Model.delayedLoaderDelayMs()
    property real progress: -1 // >= 0..1 renders progress bar mode; < 0 renders spinner mode
    property int spinnerSize: Style.font.body
    property color color: Color.muted
    property color trackColor: Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.12)

    property bool showSpinner: false
    property double loadStartedAt: 0

    readonly property bool isBarMode: progress >= 0
    readonly property string effectivePendingKey: active ? (pendingKey !== "" ? pendingKey : "active") : ""

    function armDelayedSpinner() {
        delayTimer.stop();
        showSpinner = false;
        if (!active || isBarMode) {
            loadStartedAt = 0;
            return;
        }
        if (delayMs <= 0) {
            loadStartedAt = Date.now();
            showSpinner = true;
            return;
        }
        loadStartedAt = Date.now();
        delayTimer.interval = delayMs;
        delayTimer.start();
    }

    onEffectivePendingKeyChanged: armDelayedSpinner()
    onIsBarModeChanged: armDelayedSpinner()

    visible: isBarMode ? active : showSpinner
    implicitWidth: isBarMode ? Style.space(120) : (showSpinner ? spinnerSize : 0)
    implicitHeight: isBarMode ? Style.space(2) : spinnerSize

    Timer {
        id: delayTimer
        interval: root.delayMs
        repeat: false
        onTriggered: {
            var remaining = root.delayMs - (Date.now() - root.loadStartedAt);
            if (remaining > 0 && root.active && !root.isBarMode) {
                interval = remaining;
                start();
                return;
            }
            root.showSpinner = Model.shouldShowDelayedLoader(root.active && !root.isBarMode, root.loadStartedAt, Date.now(), root.delayMs);
        }
    }

    // Spinner Mode
    Canvas {
        id: spinnerCanvas
        visible: !root.isBarMode && root.showSpinner
        width: root.spinnerSize
        height: root.spinnerSize
        anchors.centerIn: parent
        onWidthChanged: requestPaint()
        onHeightChanged: requestPaint()
        onVisibleChanged: if (visible)
            requestPaint()
        onPaint: {
            var ctx = getContext("2d");
            var line = Math.max(1.5, width * 0.14);
            var radius = Math.min(width, height) / 2 - line;
            ctx.reset();
            ctx.lineWidth = line;
            ctx.lineCap = "round";
            ctx.strokeStyle = root.color;
            ctx.beginPath();
            ctx.arc(width / 2, height / 2, radius, 0, Math.PI * 1.5);
            ctx.stroke();
        }

        RotationAnimation on rotation {
            running: spinnerCanvas.visible
            from: 0
            to: 360
            duration: 800
            loops: Animation.Infinite
        }
    }

    // Determinate Progress Bar Mode
    Rectangle {
        visible: root.isBarMode && root.active
        anchors.fill: parent
        color: root.trackColor
        radius: height / 2
        clip: true

        Rectangle {
            anchors.left: parent.left
            anchors.top: parent.top
            anchors.bottom: parent.bottom
            width: parent.width * Math.max(0, Math.min(1, root.progress))
            color: root.color
            radius: height / 2

            Behavior on width {
                NumberAnimation {
                    duration: Style.duration(120)
                }
            }
        }
    }
}
