import QtQuick
import qs.Commons

Row {
    id: root
    required property var controller
    property var quote: null
    readonly property var timeframes: ["60", "D", "W", "M"]

    spacing: Style.space(3)
    LayoutMirroring.enabled: false

    Accessible.role: Accessible.StaticText
    Accessible.name: {
        var parts = [];
        for (var i = 0; i < timeframes.length; i++) {
            var tf = timeframes[i];
            var st = (quote && quote.ftfc && quote.ftfc[tf]) ? quote.ftfc[tf] : "neutral";
            parts.push(tf + ": " + st);
        }
        return qsTr("Full timeframe continuity: %1").arg(parts.join(", "));
    }

    Repeater {
        model: root.timeframes

        Row {
            required property int index
            required property string modelData
            spacing: Style.space(3)

            Text {
                textFormat: Text.PlainText
                text: "|"
                visible: index > 0
                color: controller.dim
                font.family: controller.contentFontFamily
                font.pixelSize: Style.font.bodySmall
            }

            Text {
                textFormat: Text.PlainText
                text: modelData + (controller.timeframeColor(root.quote, modelData) === controller.upColor ? "▲" : (controller.timeframeColor(root.quote, modelData) === controller.downColor ? "▼" : ""))
                color: controller.timeframeColor(root.quote, modelData)
                font.family: controller.contentFontFamily
                font.pixelSize: Style.font.bodySmall
                font.letterSpacing: 1
                font.bold: true
            }
        }
    }
}
