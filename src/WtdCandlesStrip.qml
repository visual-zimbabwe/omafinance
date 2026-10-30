import QtQuick
import qs.Commons
import qs.Ui

Item {
    id: root

    property var wtdData: null
    property color upColor: Qt.rgba(0.22, 0.50, 0.30, 1)
    property color downColor: Qt.rgba(0.62, 0.22, 0.22, 1)
    property color triggerColor: Color.accent
    property color dim: Color.muted
    property string fontFamily: Style.font.family

    implicitWidth: Style.space(96)
    implicitHeight: Style.space(34)

    readonly property var candles: (root.wtdData && root.wtdData.candles) ? root.wtdData.candles : []
    readonly property real triggerPrice: root.wtdData && root.wtdData.triggerPrice ? Number(root.wtdData.triggerPrice) : 0
    readonly property string triggerDirection: root.wtdData && root.wtdData.triggerDirection ? root.wtdData.triggerDirection : "neutral"

    readonly property real minPrice: {
        var min = root.wtdData && root.wtdData.weekLow ? Number(root.wtdData.weekLow) : 0;
        if (root.triggerPrice > 0 && (min <= 0 || root.triggerPrice < min))
            min = root.triggerPrice;
        return min > 0 ? min : 1;
    }

    readonly property real maxPrice: {
        var max = root.wtdData && root.wtdData.weekHigh ? Number(root.wtdData.weekHigh) : 0;
        if (root.triggerPrice > 0 && root.triggerPrice > max)
            max = root.triggerPrice;
        return max > 0 ? max : 1;
    }

    readonly property real priceSpan: Math.max(0.001, root.maxPrice - root.minPrice)

    onWtdDataChanged: {
        if (candleCanvas.available)
            candleCanvas.requestPaint();
    }

    onWidthChanged: {
        if (candleCanvas.available)
            candleCanvas.requestPaint();
    }

    onHeightChanged: {
        if (candleCanvas.available)
            candleCanvas.requestPaint();
    }

    Column {
        anchors.fill: parent
        spacing: Style.space(1)

        Canvas {
            id: candleCanvas
            width: parent.width
            height: parent.height - Style.space(11)
            antialiasing: true

            onPaint: {
                var ctx = getContext("2d");
                var w = width;
                var h = height;
                ctx.clearRect(0, 0, w, h);

                var list = root.candles;
                if (!list || list.length === 0)
                    return;

                var pad = 4;
                var chartH = h - pad * 2;
                var minP = root.minPrice;
                var span = root.priceSpan;

                function getY(price) {
                    var norm = (Number(price) - minP) / span;
                    return h - pad - (norm * chartH);
                }

                // 1. Draw horizontal dashed trigger line if present
                if (root.triggerPrice > 0) {
                    var ty = getY(root.triggerPrice);
                    ctx.save();
                    ctx.strokeStyle = root.triggerColor;
                    ctx.lineWidth = 1;
                    ctx.globalAlpha = 0.65;
                    if (typeof ctx.setLineDash === "function")
                        ctx.setLineDash([2, 2]);
                    ctx.beginPath();
                    ctx.moveTo(2, ty);
                    ctx.lineTo(w - 2, ty);
                    ctx.stroke();
                    ctx.restore();
                }

                // 2. Draw candles
                var count = list.length;
                var colW = w / count;
                var bodyW = Math.max(4, Math.min(10, colW * 0.45));

                for (var i = 0; i < count; i++) {
                    var c = list[i];
                    var cx = i * colW + colW / 2;
                    var o = Number(c.open);
                    var hi = Number(c.high);
                    var lo = Number(c.low);
                    var cl = Number(c.close);
                    var isUp = cl >= o;
                    var cColor = isUp ? root.upColor : root.downColor;

                    var yHi = getY(hi);
                    var yLo = getY(lo);
                    var yO = getY(o);
                    var yC = getY(cl);

                    // Wick
                    ctx.strokeStyle = cColor;
                    ctx.lineWidth = 1.2;
                    ctx.beginPath();
                    ctx.moveTo(cx, yHi);
                    ctx.lineTo(cx, yLo);
                    ctx.stroke();

                    // Body
                    var bodyTop = Math.min(yO, yC);
                    var bodyH = Math.max(2, Math.abs(yC - yO));
                    ctx.fillStyle = cColor;
                    ctx.fillRect(cx - bodyW / 2, bodyTop, bodyW, bodyH);
                }
            }
        }

        Item {
            width: parent.width
            height: Style.space(10)

            Row {
                anchors.fill: parent

                Repeater {
                    model: root.candles

                    Item {
                        required property var modelData
                        width: parent.width / Math.max(1, root.candles.length)
                        height: parent.height

                        Text {
                            anchors.centerIn: parent
                            text: modelData.day
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                        }
                    }
                }
            }
        }
    }
}
