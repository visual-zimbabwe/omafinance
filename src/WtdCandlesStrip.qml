import QtQuick
import qs.Commons
import qs.Ui

Item {
    id: root

    property var wtdData: null
    property color upColor: Qt.rgba(0.22, 0.50, 0.30, 1)
    property color downColor: Qt.rgba(0.62, 0.22, 0.22, 1)
    property color foreground: Color.foreground
    property color dim: Color.muted
    property string fontFamily: Style.font.family
    property int hoverIndex: -1

    signal clicked

    implicitWidth: Style.space(160)
    implicitHeight: Style.space(76)

    readonly property bool showWeekdays: height >= Style.space(48)
    readonly property var candles: (root.wtdData && root.wtdData.candles) ? root.wtdData.candles : []
    readonly property var currentCandle: (candles && candles.length > 0) ? candles[candles.length - 1] : null
    readonly property var hoverCandle: (hoverIndex >= 0 && hoverIndex < candles.length) ? candles[hoverIndex] : null
    readonly property var activeCandle: hoverCandle !== null ? hoverCandle : currentCandle

    readonly property real minPrice: {
        if (!root.candles || root.candles.length === 0)
            return 1;
        var min = Number(root.candles[0].low);
        for (var i = 1; i < root.candles.length; i++) {
            var l = Number(root.candles[i].low);
            if (l > 0 && (min <= 0 || l < min))
                min = l;
        }
        return min > 0 ? min : 1;
    }

    readonly property real maxPrice: {
        if (!root.candles || root.candles.length === 0)
            return 1;
        var max = Number(root.candles[0].high);
        for (var i = 1; i < root.candles.length; i++) {
            var h = Number(root.candles[i].high);
            if (h > max)
                max = h;
        }
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

    onHoverIndexChanged: {
        if (candleCanvas.available)
            candleCanvas.requestPaint();
    }

    Column {
        anchors.fill: parent
        spacing: Style.space(2)

        Canvas {
            id: candleCanvas
            width: parent.width
            height: root.showWeekdays ? (parent.height - Style.space(16)) : parent.height
            antialiasing: true

            onPaint: {
                var ctx = getContext("2d");
                var w = width;
                var h = height;
                ctx.clearRect(0, 0, w, h);

                var list = root.candles;
                if (!list || list.length === 0)
                    return;

                var pad = Math.max(3, Math.min(6, Math.round(h * 0.08)));
                var chartH = h - pad * 2;
                var minP = root.minPrice;
                var span = root.priceSpan;

                function getY(price) {
                    var norm = (Number(price) - minP) / span;
                    return h - pad - (norm * chartH);
                }

                var count = list.length;
                var colW = w / count;
                var bodyW = Math.max(8, Math.min(22, Math.round(colW * 0.58)));
                var wickW = Math.max(1.5, Math.min(2.0, colW * 0.08));

                // Subtle vertical column highlight for hovered bar
                if (root.hoverIndex >= 0 && root.hoverIndex < count) {
                    var hx = Math.floor(root.hoverIndex * colW);
                    var cxHover = Math.floor(root.hoverIndex * colW + colW / 2);
                    ctx.fillStyle = Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.08);
                    ctx.fillRect(hx, 0, Math.ceil(colW), h);

                    ctx.strokeStyle = Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.20);
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(cxHover, 0);
                    ctx.lineTo(cxHover, h);
                    ctx.stroke();
                }

                // Draw OHLC candles: wicks and solid bodies
                for (var i = 0; i < count; i++) {
                    var c = list[i];
                    var cx = Math.floor(i * colW + colW / 2);
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

                    // High-low wick
                    ctx.strokeStyle = cColor;
                    ctx.lineWidth = wickW;
                    ctx.beginPath();
                    ctx.moveTo(cx, Math.round(yHi));
                    ctx.lineTo(cx, Math.round(yLo));
                    ctx.stroke();

                    // Open-close body
                    var bodyTop = Math.round(Math.min(yO, yC));
                    var bodyH = Math.max(3, Math.round(Math.abs(yC - yO)));
                    ctx.fillStyle = cColor;
                    ctx.fillRect(Math.round(cx - bodyW / 2), bodyTop, bodyW, bodyH);
                }
            }

            MouseArea {
                id: candleMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onPositionChanged: mouse => {
                    var count = root.candles.length;
                    if (count <= 0)
                        return;
                    var colW = width / count;
                    var idx = Math.floor(mouse.x / colW);
                    if (idx >= 0 && idx < count) {
                        if (root.hoverIndex !== idx)
                            root.hoverIndex = idx;
                    } else {
                        if (root.hoverIndex !== -1)
                            root.hoverIndex = -1;
                    }
                }
                onExited: {
                    root.hoverIndex = -1;
                }
                onClicked: {
                    root.clicked();
                }
            }
        }

        Item {
            visible: root.showWeekdays
            width: parent.width
            height: Style.space(14)

            Row {
                anchors.fill: parent

                Repeater {
                    model: root.candles

                    Item {
                        required property var modelData
                        required property int index
                        width: parent.width / Math.max(1, root.candles.length)
                        height: parent.height

                        Text {
                            anchors.centerIn: parent
                            text: parent.modelData.day
                            color: parent.index === root.hoverIndex ? root.foreground : root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: parent.index === root.hoverIndex || (root.hoverIndex < 0 && parent.index === root.candles.length - 1)
                        }
                    }
                }
            }
        }
    }
}
