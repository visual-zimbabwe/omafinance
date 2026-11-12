import QtQuick
import QtQuick.Effects
import qs.Commons

Rectangle {
    id: root

    // Elevation tiers:
    //   0 = flat / hairline
    //   1 = inline card (subtle sheen + 0.15 border)
    //   2 = floating overlay / pill (soft shadow + 0.22 border)
    //   3 = popup / modal / tooltip (deep shadow + 0.22 border)
    property int elevation: 1
    property string radiusToken: "md" // "sm" (4) | "md" (6) | "lg" (8) | "pill"
    property bool active: false
    property bool sheen: elevation >= 1
    property bool shadowEnabled: elevation >= 2
    property color foregroundColor: (elevation >= 2 && Color.popups && Color.popups.text) ? Color.popups.text : Color.foreground
    property color surfaceColor: elevation >= 2
        ? ((Color.popups && Color.popups.background) ? Color.popups.background : Color.background)
        : Qt.rgba(foregroundColor.r, foregroundColor.g, foregroundColor.b, 0.06)
    property color borderColorOverride: "transparent"

    radius: radiusToken === "pill"
        ? height / 2
        : (radiusToken === "sm"
            ? Style.space(4)
            : (radiusToken === "lg" ? Style.space(8) : Style.space(6)))
    color: surfaceColor
    border.width: Style.normalBorderWidth
    border.color: {
        if (active)
            return Color.accent;
        if (borderColorOverride.a > 0)
            return borderColorOverride;
        var alpha = elevation === 0 ? 0.12 : (elevation === 1 ? 0.15 : 0.22);
        return Qt.rgba(foregroundColor.r, foregroundColor.g, foregroundColor.b, alpha);
    }

    layer.enabled: root.shadowEnabled
    layer.effect: MultiEffect {
        shadowEnabled: true
        shadowBlur: root.elevation >= 3 ? 0.65 : 0.45
        shadowVerticalOffset: root.elevation >= 3 ? Style.space(4) : Style.space(2)
        shadowHorizontalOffset: 0
        shadowColor: Qt.rgba(0, 0, 0, root.elevation >= 3 ? 0.40 : 0.24)
    }

    // Subtle top-to-bottom sheen for depth without fighting theme colors.
    Rectangle {
        anchors.fill: parent
        anchors.margins: root.border.width
        radius: Math.max(0, root.radius - root.border.width)
        visible: root.sheen
        z: -1
        gradient: Gradient {
            GradientStop {
                position: 0.0
                color: Qt.rgba(1, 1, 1, 0.05)
            }
            GradientStop {
                position: 0.55
                color: Qt.rgba(1, 1, 1, 0.0)
            }
        }
    }
}
