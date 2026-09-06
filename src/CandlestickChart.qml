import QtQuick
import QtQuick.Shapes
import qs.Commons
import "Model.js" as Model

Item {
    id: root

    property string symbol: ""
    property var candles: []
    property color upColor: Color.foreground
    property color downColor: Color.foreground
    property color gridColor: Qt.rgba(Color.popups.text.r, Color.popups.text.g, Color.popups.text.b, 0.08)
    property color crosshairColor: Qt.rgba(Color.popups.text.r, Color.popups.text.g, Color.popups.text.b, 0.35)
    property color labelColor: Color.muted
    property string currency: "USD"
    property var priceHint: 2
    property string rangeKey: "1D"
    property bool interactive: true
    property int pad: Style.space(6)
    property string fontFamily: Style.font.family
    property bool showGridLines: true
    property bool showTooltipHeader: true
    property bool isSyncing: false

    property bool showPriceScale: true
    readonly property int scaleGutterWidth: showPriceScale ? Style.space(52) : 0
    property bool showTimeScale: true
    readonly property int timeScaleHeight: showTimeScale ? Style.space(18) : 0

    signal crosshairMoved(real timestamp, real price, var candle)
    signal crosshairCleared

    property int viewStart: 0
    property int viewCount: -1
    property real dragStartX: 0
    property int dragStartViewStart: 0
    property int dragStartViewCount: 0
    property real dragStartCenterIndex: 0
    property real dragStartRatio: 0.5
    property bool dragging: false
    property bool isShiftDrag: false

    property bool hovering: false
    property bool hoveringScale: false
    property int hoveredTickIndex: -1
    property real hoverPrice: 0
    property int hoverIndex: -1
    property var hoverCandle: null
    property real hoverX: 0
    property real hoverY: 0
    property real hoverPointerX: 0
    property real hoverPointerY: 0
    property var cachedGeometry: null

    function resetZoom() {
        viewStart = 0;
        viewCount = -1;
        refreshGeometry();
    }

    function yToPrice(y) {
        var g = cachedGeometry;
        if (!g || g.innerH <= 0 || !g.logSpan)
            return 0;
        var ratio = 1 - (y - g.top) / g.innerH;
        ratio = Math.max(0, Math.min(1, ratio));
        var lp = g.logMin + ratio * g.logSpan;
        return Math.exp(lp);
    }

    function syncToTimestamp(targetTimestamp) {
        var g = cachedGeometry;
        if (!g || !g.candles || g.candles.length === 0 || targetTimestamp === null || targetTimestamp === undefined || targetTimestamp < 0) {
            isSyncing = true;
            hovering = false;
            hoverIndex = -1;
            hoverCandle = null;
            isSyncing = false;
            return;
        }
        var candles = g.candles;
        var bestIdx = 0;
        var bestDiff = Math.abs(candles[0].timestamp - targetTimestamp);
        for (var i = 1; i < candles.length; i++) {
            var diff = Math.abs(candles[i].timestamp - targetTimestamp);
            if (diff < bestDiff) {
                bestDiff = diff;
                bestIdx = i;
            }
        }
        isSyncing = true;
        hoverIndex = bestIdx;
        hoverCandle = candles[bestIdx];
        hoverX = g.xs[bestIdx];
        hoverY = g.yCloses[bestIdx];
        hoverPrice = hoverCandle ? hoverCandle.close : 0;
        hovering = true;
        isSyncing = false;
    }

    function validCandles() {
        var src = root.candles || [];
        var out = [];
        for (var i = 0; i < src.length; i++) {
            var c = src[i];
            if (!c)
                continue;
            var o = Number(c.open);
            var h = Number(c.high);
            var l = Number(c.low);
            var cl = Number(c.close);
            if (isFinite(o) && isFinite(h) && isFinite(l) && isFinite(cl)) {
                out.push({
                    timestamp: c.timestamp,
                    open: o,
                    high: h,
                    low: l,
                    close: cl,
                    volume: c.volume || 0
                });
            }
        }
        return out;
    }

    function buildGeom() {
        var all = validCandles();
        var total = all.length;
        var w = width;
        var h = height;
        var topPad = root.pad + Style.space(16);
        var botPad = root.pad + (root.showTimeScale ? Style.space(18) : Style.space(4));
        var scaleGutter = root.showPriceScale ? Style.space(52) : 0;
        var left = root.pad;
        var right = Math.max(left + 1, w - root.pad - scaleGutter);
        var top = topPad;
        var bot = Math.max(top + 1, h - botPad);
        var unset = {
            candles: [],
            strats: [],
            min: 0,
            max: 1,
            span: 1,
            isLog: true,
            logMin: 0,
            logMax: 0,
            logSpan: 1,
            left: left,
            right: right,
            top: top,
            bot: bot,
            innerW: right - left,
            innerH: bot - top,
            slotW: 1,
            candleW: 1,
            vStart: 0,
            vCount: 0,
            totalCandles: 0,
            ticks: [],
            timeTicks: [],
            xs: [],
            yOpens: [],
            yHighs: [],
            yLows: [],
            yCloses: []
        };
        if (total === 0)
            return unset;

        var minBars = 8;
        var vCount = (root.viewCount > 0 && root.viewCount < total) ? Math.max(minBars, root.viewCount) : total;
        var maxStart = Math.max(0, total - vCount);
        var vStart = Math.max(0, Math.min(maxStart, root.viewStart));

        var list = all.slice(vStart, vStart + vCount);
        if (list.length === 0)
            return unset;

        var strats = [];
        for (var si = 0; si < list.length; si++) {
            var globalIdx = vStart + si;
            var prev = globalIdx > 0 ? all[globalIdx - 1] : null;
            var st = Model.stratScenario(list[si], prev);
            list[si].strat = st;
            strats.push(st);
        }

        var min = list[0].low;
        var max = list[0].high;
        var i;
        for (i = 1; i < list.length; i++) {
            if (list[i].low < min)
                min = list[i].low;
            if (list[i].high > max)
                max = list[i].high;
        }

        // Pure Logarithmic Coordinate Transformation
        var safeMin = Math.max(0.00001, min);
        var safeMax = Math.max(safeMin + 0.00001, max);
        var logMin = Math.log(safeMin);
        var logMax = Math.log(safeMax);
        var logSpan = logMax - logMin;
        if (logSpan === 0)
            logSpan = 0.01;
        logMin -= logSpan * 0.06;
        logMax += logSpan * 0.06;
        logSpan = logMax - logMin;
        min = Math.exp(logMin);
        max = Math.exp(logMax);
        var span = max - min;

        var innerW = right - left;
        var innerH = bot - top;
        var slotW = innerW / Math.max(1, list.length);
        var candleW = slotW >= 7 ? Math.max(1, slotW - 4) : (slotW >= 4 ? Math.max(1, slotW - 2) : (slotW >= 2.5 ? Math.max(1, slotW - 1) : Math.max(1, Math.round(slotW * 0.8))));

        function priceToY(price) {
            var lp = Math.log(Math.max(0.00001, price));
            return top + innerH * (1 - (lp - logMin) / logSpan);
        }

        var xs = [];
        var yOpens = [];
        var yHighs = [];
        var yLows = [];
        var yCloses = [];

        for (i = 0; i < list.length; i++) {
            var cx = left + (i + 0.5) * slotW;
            xs.push(cx);
            yOpens.push(priceToY(list[i].open));
            yHighs.push(priceToY(list[i].high));
            yLows.push(priceToY(list[i].low));
            yCloses.push(priceToY(list[i].close));
        }

        // Psychological Levels Quantizer for Right Price Scale Ticks
        var ticks = [];
        if (root.showPriceScale && max > min && logSpan > 0) {
            var minSpacing = Style.space(28);
            var targetTicks = Math.max(3, Math.min(7, Math.floor(innerH / Style.space(36))));
            var ratio = max / min;

            if (ratio >= 2.2) {
                // Multi-decade logarithmic tick quantization (1, 2, 5 series per decade)
                var minDecade = Math.floor(Math.log10(min));
                var maxDecade = Math.ceil(Math.log10(max));
                var pxPerDecade = innerH / Math.max(1, (logMax - logMin) / Math.LN10);
                var multipliers;
                if (pxPerDecade >= Style.space(160))
                    multipliers = [1, 2, 3, 4, 5, 6, 7, 8, 9];
                else if (pxPerDecade >= Style.space(40))
                    multipliers = [1, 2, 5];
                else
                    multipliers = [1];

                var candidates = [];
                for (var d = minDecade; d <= maxDecade; d++) {
                    var base = Math.pow(10, d);
                    for (var mi = 0; mi < multipliers.length; mi++) {
                        var val = Number((multipliers[mi] * base).toPrecision(12));
                        if (val >= min && val <= max) {
                            candidates.push(val);
                        }
                    }
                }

                candidates.sort(function (a, b) {
                    return a - b;
                });
                var lastY = -99999;
                for (var ci = 0; ci < candidates.length; ci++) {
                    var cp = candidates[ci];
                    var cty = priceToY(cp);
                    if (cty >= top - 2 && cty <= bot + 2) {
                        if (ticks.length === 0 || Math.abs(cty - lastY) >= minSpacing) {
                            ticks.push({
                                price: cp,
                                y: cty,
                                label: Model.formatPrice(cp, root.currency, root.priceHint)
                            });
                            lastY = cty;
                        }
                    }
                }
            } else {
                // Adaptive linear subdivision over local logarithmic space
                var rawSpan = max - min;
                var roughStep = rawSpan / targetTicks;
                var mag = Math.pow(10, Math.floor(Math.log10(roughStep)));
                var norm = roughStep / mag;
                var step;
                if (norm <= 1.25)
                    step = 1 * mag;
                else if (norm <= 2.5)
                    step = 2 * mag;
                else if (norm <= 3.75)
                    step = 2.5 * mag;
                else if (norm <= 7.5)
                    step = 5 * mag;
                else
                    step = 10 * mag;

                step = Number(step.toPrecision(12));
                var startPrice = Math.ceil(min / step) * step;
                for (var p = startPrice; p <= max; p += step) {
                    var ty = priceToY(p);
                    if (ty >= top - 2 && ty <= bot + 2) {
                        ticks.push({
                            price: p,
                            y: ty,
                            label: Model.formatPrice(p, root.currency, root.priceHint)
                        });
                    }
                }
            }
        }

        // Bottom Time Scale Axis Ticks
        var timeTicks = [];
        if (root.showTimeScale && list.length > 0 && innerW > 0) {
            var minTimeSpacing = root.rangeKey === "60" ? Style.space(68) : Style.space(55);
            var maxTimeTicks = Math.max(2, Math.floor(innerW / minTimeSpacing));
            var stepT = Math.max(1, Math.ceil(list.length / maxTimeTicks));
            var lastTx = -99999;
            var prevTs = null;
            for (var ti = 0; ti < list.length; ti += stepT) {
                var tx = xs[ti];
                if (tx >= left + Style.space(16) && tx <= right - Style.space(16)) {
                    if (Math.abs(tx - lastTx) >= minTimeSpacing) {
                        timeTicks.push({
                            timestamp: list[ti].timestamp,
                            x: tx,
                            label: Model.formatTimeAxisLabel(list[ti].timestamp, root.rangeKey, prevTs)
                        });
                        lastTx = tx;
                        prevTs = list[ti].timestamp;
                    }
                }
            }
        }

        return {
            candles: list,
            strats: strats,
            min: min,
            max: max,
            span: span,
            isLog: true,
            logMin: logMin,
            logMax: logMax,
            logSpan: logSpan,
            left: left,
            right: right,
            top: top,
            bot: bot,
            innerW: innerW,
            innerH: innerH,
            slotW: slotW,
            candleW: candleW,
            vStart: vStart,
            vCount: vCount,
            totalCandles: total,
            ticks: ticks,
            timeTicks: timeTicks,
            xs: xs,
            yOpens: yOpens,
            yHighs: yHighs,
            yLows: yLows,
            yCloses: yCloses
        };
    }

    function refreshGeometry() {
        cachedGeometry = buildGeom();
        canvas.requestPaint();
        if (hovering)
            updateHover(hoverPointerX, hoverPointerY);
    }

    function updateHover(px, py) {
        var g = cachedGeometry;
        hoverPointerX = px;
        if (py !== undefined && py !== null)
            hoverPointerY = py;
        else
            py = hoverPointerY;

        if (!g || g.candles.length === 0) {
            clearHover();
            return;
        }

        // Check if cursor is hovering over the right price scale gutter or psychological tick levels
        if (root.showPriceScale && px >= g.right) {
            hoveringScale = true;
            hovering = true;
            hoverIndex = -1;
            hoverCandle = null;

            // Find closest psychological tick if within snap distance
            var bestTick = -1;
            var bestDist = Style.space(12);
            if (g.ticks && g.ticks.length > 0) {
                for (var ti = 0; ti < g.ticks.length; ti++) {
                    var d = Math.abs(g.ticks[ti].y - py);
                    if (d < bestDist) {
                        bestDist = d;
                        bestTick = ti;
                    }
                }
            }

            hoveredTickIndex = bestTick;
            if (bestTick >= 0) {
                hoverY = g.ticks[bestTick].y;
                hoverPrice = g.ticks[bestTick].price;
            } else {
                hoverY = Math.max(g.top, Math.min(g.bot, py));
                hoverPrice = yToPrice(hoverY);
            }

            canvas.requestPaint();
            if (!isSyncing)
                root.crosshairMoved(-1, hoverPrice, null);
            return;
        }

        // Inside candlestick canvas area
        var wasHoveringScale = hoveringScale || (hoveredTickIndex !== -1);
        hoveringScale = false;
        hoveredTickIndex = -1;

        var offset = px - g.left;
        var idx = Math.floor(offset / Math.max(1, g.slotW));
        if (idx < 0)
            idx = 0;
        if (idx >= g.candles.length)
            idx = g.candles.length - 1;

        hoverIndex = idx;
        hoverCandle = g.candles[idx];
        hoverX = g.xs[idx];

        // Determine closest OHLC point on the hovered candle to py
        var oY = g.yOpens[idx];
        var hY = g.yHighs[idx];
        var lY = g.yLows[idx];
        var cY = g.yCloses[idx];

        var oDist = Math.abs(oY - py);
        var hDist = Math.abs(hY - py);
        var lDist = Math.abs(lY - py);
        var cDist = Math.abs(cY - py);

        var bestY = cY;
        var bestPrice = hoverCandle ? hoverCandle.close : 0;
        var minDist = cDist;

        if (oDist < minDist) {
            minDist = oDist;
            bestY = oY;
            bestPrice = hoverCandle ? hoverCandle.open : 0;
        }
        if (hDist < minDist) {
            minDist = hDist;
            bestY = hY;
            bestPrice = hoverCandle ? hoverCandle.high : 0;
        }
        if (lDist < minDist) {
            minDist = lDist;
            bestY = lY;
            bestPrice = hoverCandle ? hoverCandle.low : 0;
        }

        hoverY = bestY;
        hoverPrice = bestPrice;
        hovering = true;

        if (wasHoveringScale)
            canvas.requestPaint();

        if (!isSyncing && hoverCandle)
            root.crosshairMoved(hoverCandle.timestamp, hoverPrice, hoverCandle);
    }

    function clearHover() {
        var needsRepaint = hoveringScale || (hoveredTickIndex !== -1);
        hovering = false;
        hoveringScale = false;
        hoveredTickIndex = -1;
        hoverIndex = -1;
        hoverCandle = null;
        if (needsRepaint)
            canvas.requestPaint();
        if (!isSyncing)
            root.crosshairCleared();
    }

    Canvas {
        id: canvas
        anchors.fill: parent
        antialiasing: true

        onPaint: {
            var ctx = getContext("2d");
            var w = width;
            var h = height;
            ctx.clearRect(0, 0, w, h);

            var g = root.cachedGeometry;
            if (!g || g.candles.length === 0) {
                if (root.showGridLines) {
                    ctx.globalAlpha = 0.3;
                    ctx.strokeStyle = root.gridColor;
                    ctx.beginPath();
                    ctx.moveTo(root.pad, h / 2);
                    ctx.lineTo(Math.max(root.pad, w - root.pad), h / 2);
                    ctx.stroke();
                    ctx.globalAlpha = 1;
                }
                return;
            }

            // Right Price Scale Axis Ticks (Borderless - No Vertical Divider Line)
            if (root.showPriceScale && g.right < w) {
                for (var ti = 0; ti < g.ticks.length; ti++) {
                    var t = g.ticks[ti];
                    var isHoveredTick = (ti === root.hoveredTickIndex);

                    ctx.font = (isHoveredTick ? "bold " : "") + Style.font.bodySmall + "px " + root.fontFamily;
                    ctx.fillStyle = isHoveredTick ? Color.foreground : Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.45);
                    ctx.textAlign = "left";
                    ctx.textBaseline = "middle";
                    ctx.fillText(t.label, g.right + Style.space(6), Math.round(t.y));

                    if (root.showGridLines) {
                        ctx.strokeStyle = root.gridColor;
                        ctx.beginPath();
                        ctx.moveTo(g.left, Math.round(t.y) + 0.5);
                        ctx.lineTo(g.right, Math.round(t.y) + 0.5);
                        ctx.stroke();
                    }
                }
            }

            // Candlesticks rendering
            var len = g.candles.length;
            var cW = g.candleW;
            var halfW = cW / 2;

            for (var i = 0; i < len; i++) {
                var c = g.candles[i];
                var isUp = c.close >= c.open;
                var color = isUp ? root.upColor : root.downColor;
                var cx = Math.round(g.xs[i]) + 0.5;
                var yH = Math.round(g.yHighs[i]);
                var yL = Math.round(g.yLows[i]);
                var yO = Math.round(g.yOpens[i]);
                var yC = Math.round(g.yCloses[i]);

                ctx.strokeStyle = color;
                ctx.fillStyle = color;
                ctx.lineWidth = 1;

                // Wick (Upper & Lower)
                ctx.beginPath();
                ctx.moveTo(cx, yH);
                ctx.lineTo(cx, yL);
                ctx.stroke();

                // Candle Body
                var bodyTop = Math.min(yO, yC);
                var bodyHeight = Math.max(1.5, Math.abs(yC - yO));
                var bodyLeft = Math.round(cx - halfW);
                ctx.fillRect(bodyLeft, bodyTop, Math.max(1, Math.round(cW)), bodyHeight);
            }

            // Latest Price Marker in Right Price Scale Gutter
            if (root.showPriceScale && len > 0) {
                var lastC = g.candles[len - 1];
                var lastY = g.yCloses[len - 1];
                var isLastUp = lastC.close >= lastC.open;
                var badgeColor = isLastUp ? root.upColor : root.downColor;
                var lastLabel = Model.formatPrice(lastC.close, root.currency, root.priceHint);
                var badgeW = root.scaleGutterWidth - Style.space(4);
                var badgeH = Style.space(16);
                var badgeX = g.right + Style.space(2);
                var badgeY = Math.max(g.top, Math.min(g.bot - badgeH, Math.round(lastY - badgeH / 2)));

                ctx.fillStyle = badgeColor;
                ctx.fillRect(badgeX, badgeY, badgeW, badgeH);

                ctx.font = "bold " + Style.font.bodySmall + "px " + root.fontFamily;
                ctx.fillStyle = Color.background;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(lastLabel, badgeX + badgeW / 2, badgeY + badgeH / 2);
            }

            // Bottom Time Scale Axis Ticks
            if (root.showTimeScale && g.timeTicks && g.timeTicks.length > 0) {
                ctx.font = Style.font.bodySmall + "px " + root.fontFamily;
                ctx.fillStyle = Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.45);
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                var tickY = Math.round(g.bot + Style.space(9));
                for (var tti = 0; tti < g.timeTicks.length; tti++) {
                    var tt = g.timeTicks[tti];
                    ctx.fillText(tt.label, Math.round(tt.x), tickY);
                }
            }
        }
    }

    Component.onCompleted: refreshGeometry()
    onSymbolChanged: resetZoom()
    onRangeKeyChanged: resetZoom()
    onCandlesChanged: refreshGeometry()
    onUpColorChanged: canvas.requestPaint()
    onDownColorChanged: canvas.requestPaint()
    onGridColorChanged: canvas.requestPaint()
    onShowTimeScaleChanged: refreshGeometry()
    onShowPriceScaleChanged: refreshGeometry()
    onPadChanged: refreshGeometry()
    onWidthChanged: refreshGeometry()
    onHeightChanged: refreshGeometry()

    Keys.onPressed: function (event) {
        if (event.key === Qt.Key_R && (event.modifiers & Qt.AltModifier)) {
            root.resetZoom();
            event.accepted = true;
        }
    }

    MouseArea {
        id: chartMouseArea
        anchors.fill: parent
        enabled: root.interactive
        hoverEnabled: true
        preventStealing: true
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        cursorShape: root.dragging ? Qt.ClosedHandCursor : (enabled ? Qt.CrossCursor : Qt.ArrowCursor)

        onPressed: function (mouse) {
            if (mouse.button === Qt.LeftButton) {
                root.dragging = true;
                root.isShiftDrag = (mouse.modifiers & Qt.ShiftModifier) || (mouse.modifiers & Qt.ControlModifier);
                root.dragStartX = mouse.x;
                var all = root.validCandles();
                var total = all.length;
                var g = root.cachedGeometry;
                root.dragStartViewStart = g ? g.vStart : 0;
                root.dragStartViewCount = (g && g.vCount) ? g.vCount : total;
                var innerW = g ? g.innerW : Math.max(1, root.width - root.scaleGutterWidth);
                var leftBase = g ? g.left : root.pad;
                root.dragStartRatio = Math.max(0, Math.min(1, (mouse.x - leftBase) / innerW));
                root.dragStartCenterIndex = root.dragStartViewStart + root.dragStartViewCount * root.dragStartRatio;
            }
        }

        onPositionChanged: function (mouse) {
            if (root.dragging && root.cachedGeometry) {
                var all = root.validCandles();
                var total = all.length;
                var g = root.cachedGeometry;

                if (root.isShiftDrag && total > 8) {
                    // Shift+Drag = Zoom
                    var deltaX = mouse.x - root.dragStartX;
                    var countDelta = Math.round(deltaX * 0.25);
                    var nextCount = Math.max(8, Math.min(total, root.dragStartViewCount - countDelta));
                    var isAtLatestBar = (root.dragStartViewStart + root.dragStartViewCount >= total - 1) || root.dragStartRatio >= 0.85;
                    var nextStart = isAtLatestBar ? Math.max(0, total - nextCount) : Math.max(0, Math.min(total - nextCount, Math.round(root.dragStartCenterIndex - nextCount * root.dragStartRatio)));

                    root.viewCount = nextCount >= total ? -1 : nextCount;
                    root.viewStart = nextCount >= total ? 0 : nextStart;
                    root.refreshGeometry();
                } else if (g && g.totalCandles > g.vCount) {
                    // Normal Drag = PAN (Move left/right through time)
                    var deltaX = mouse.x - root.dragStartX;
                    var shiftBars = Math.round(deltaX / Math.max(1, g.slotW));
                    var maxStart = Math.max(0, g.totalCandles - g.vCount);
                    var nextStart = Math.max(0, Math.min(maxStart, root.dragStartViewStart - shiftBars));

                    if (nextStart !== root.viewStart) {
                        root.viewStart = nextStart;
                        root.refreshGeometry();
                    }
                }
            }
            root.updateHover(mouse.x, mouse.y);
        }

        onReleased: function (mouse) {
            root.dragging = false;
            root.isShiftDrag = false;
        }

        onCanceled: {
            root.dragging = false;
            root.isShiftDrag = false;
        }

        onWheel: function (wheel) {
            var all = root.validCandles();
            var total = all.length;
            if (total <= 8)
                return;
            var g = root.cachedGeometry;
            if (!g)
                return;
            var curCount = g.vCount ? g.vCount : total;
            var curStart = g.vStart ? g.vStart : 0;
            var innerW = g.innerW ? g.innerW : Math.max(1, root.width - root.scaleGutterWidth);
            var leftBase = g.left ? g.left : root.pad;
            var ratio = Math.max(0, Math.min(1, (wheel.x - leftBase) / innerW));

            var isHorizontal = Math.abs(wheel.angleDelta.x) > Math.abs(wheel.angleDelta.y);
            var isShiftVertical = (wheel.modifiers & Qt.ShiftModifier) && wheel.angleDelta.y !== 0;

            if (isHorizontal || isShiftVertical) {
                // Horizontal scroll or Shift+Scroll = PAN left/right (preserving zoom level)
                if (g.totalCandles > g.vCount) {
                    var delta = isShiftVertical ? -wheel.angleDelta.y : -wheel.angleDelta.x;
                    var bars = Math.round((delta / 120) * Math.max(1, Math.round(curCount * 0.10)));
                    if (bars === 0 && delta !== 0)
                        bars = delta > 0 ? 1 : -1;
                    var maxStart = Math.max(0, g.totalCandles - g.vCount);
                    var nextStart = Math.max(0, Math.min(maxStart, curStart + bars));
                    if (nextStart !== root.viewStart) {
                        root.viewStart = nextStart;
                        root.refreshGeometry();
                    }
                }
            } else if (wheel.angleDelta.y !== 0) {
                var deltaBars = Math.round((Math.abs(wheel.angleDelta.y) / 120) * Math.max(1, Math.round(curCount * 0.08)));
                if (deltaBars < 1)
                    deltaBars = 1;

                var anchorBar = curStart + Math.round(ratio * curCount);
                var isAtLatestBar = (curStart + curCount >= total - 1) || ratio >= 0.85;

                if (wheel.angleDelta.y > 0) {
                    // Zoom IN: reduce visible bar count, anchoring to latest bar or cursor bar
                    var nextCount = Math.max(8, curCount - deltaBars);
                    var nextStart = isAtLatestBar ? Math.max(0, total - nextCount) : Math.max(0, Math.min(total - nextCount, Math.round(anchorBar - ratio * nextCount)));
                    root.viewCount = nextCount;
                    root.viewStart = nextStart;
                    root.refreshGeometry();
                } else if (wheel.angleDelta.y < 0) {
                    // Zoom OUT: increase visible bar count, expanding symmetrically or outward from right edge
                    var nextCount = Math.min(total, curCount + deltaBars);
                    var nextStart = isAtLatestBar ? Math.max(0, total - nextCount) : Math.max(0, Math.min(total - nextCount, Math.round(anchorBar - ratio * nextCount)));
                    root.viewCount = nextCount >= total ? -1 : nextCount;
                    root.viewStart = nextCount >= total ? 0 : nextStart;
                    root.refreshGeometry();
                }
            }
            wheel.accepted = true;
        }

        onExited: {
            if (!root.dragging)
                root.clearHover();
        }
    }

    // Vertical Crosshair (Dashed Hairline [2, 3])
    Shape {
        id: verticalCrosshair
        visible: root.interactive && root.hovering && !root.hoveringScale
        anchors.fill: parent

        ShapePath {
            strokeColor: root.crosshairColor
            strokeWidth: 1
            strokeStyle: ShapePath.DashLine
            dashPattern: [2, 3]
            startX: Math.round(root.hoverX) + 0.5
            startY: root.cachedGeometry ? root.cachedGeometry.top : 0
            PathLine {
                x: Math.round(root.hoverX) + 0.5
                y: root.cachedGeometry ? (root.showTimeScale ? (root.cachedGeometry.bot + Style.space(16)) : root.cachedGeometry.bot) : parent.height
            }
        }
    }

    // Horizontal Crosshair (Faint Dotted Hairline [2, 3])
    Shape {
        id: horizontalCrosshair
        visible: root.interactive && root.hovering
        anchors.fill: parent

        ShapePath {
            strokeColor: root.hoveringScale ? root.foreground : root.crosshairColor
            strokeWidth: 1
            strokeStyle: ShapePath.DashLine
            dashPattern: [2, 3]
            startX: root.pad
            startY: Math.round(root.hoverY) + 0.5
            PathLine {
                x: root.cachedGeometry ? root.cachedGeometry.right : (root.width - root.pad)
                y: Math.round(root.hoverY) + 0.5
            }
        }
    }

    // Candle Selection Highlight Pip
    Rectangle {
        visible: root.interactive && root.hovering && !root.hoveringScale && root.hoverCandle !== null
        width: Style.space(6)
        height: Style.space(6)
        radius: width / 2
        x: root.hoverX - width / 2
        y: root.hoverY - height / 2
        color: root.hoverCandle && root.hoverCandle.close >= root.hoverCandle.open ? root.upColor : root.downColor
        border.width: 1
        border.color: Color.popups.background
    }

    // Crosshair Price Axis Badge on Right Scale
    Rectangle {
        id: axisPriceBadge
        visible: root.showPriceScale && root.interactive && root.hovering
        x: root.cachedGeometry ? (root.cachedGeometry.right + Style.space(2)) : (parent.width - root.scaleGutterWidth)
        y: Math.max(root.pad + Style.space(16), Math.min(root.height - height - root.pad, Math.round(root.hoverY - height / 2)))
        width: Math.max(Style.space(32), root.scaleGutterWidth - Style.space(4))
        height: Style.space(16)
        color: Color.popups.background
        border.width: 1
        border.color: root.hoveringScale ? root.foreground : root.crosshairColor
        z: 15

        Text {
            anchors.centerIn: parent
            textFormat: Text.PlainText
            text: (root.hoverCandle || root.hoveringScale) ? Model.formatPrice(root.hoverPrice, root.currency, root.priceHint) : ""
            color: Color.foreground
            font.family: root.fontFamily
            font.pixelSize: Style.font.bodySmall
            font.bold: true
        }
    }

    // Crosshair Date Axis Badge on Bottom Scale
    Rectangle {
        id: axisDateBadge
        visible: root.showTimeScale && root.interactive && root.hovering && root.hoverCandle !== null && !root.hoveringScale
        readonly property int maxX: (root.cachedGeometry ? root.cachedGeometry.right : (parent.width - root.scaleGutterWidth)) - width
        readonly property int minX: root.cachedGeometry ? root.cachedGeometry.left : root.pad
        x: Math.max(minX, Math.min(maxX, Math.round(root.hoverX - width / 2)))
        y: root.cachedGeometry ? (root.cachedGeometry.bot + Style.space(2)) : (parent.height - height - root.pad)
        implicitWidth: dateBadgeText.implicitWidth + Style.space(12)
        height: Style.space(16)
        color: Color.popups.background
        border.width: 1
        border.color: root.crosshairColor
        z: 15

        Text {
            id: dateBadgeText
            anchors.centerIn: parent
            textFormat: Text.PlainText
            text: root.hoverCandle ? Model.formatCandleTime(root.hoverCandle.timestamp, root.rangeKey) : ""
            color: Color.foreground
            font.family: root.fontFamily
            font.pixelSize: Style.font.bodySmall
            font.bold: true
        }
    }

    // Floating Tooltip / Status Readout Header
    Item {
        anchors.top: parent.top
        anchors.left: parent.left
        anchors.leftMargin: root.pad
        anchors.right: parent.right
        anchors.rightMargin: root.pad + root.scaleGutterWidth
        anchors.margins: root.pad
        height: Style.space(16)
        visible: root.showTooltipHeader && root.hovering && root.hoverCandle !== null

        Row {
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            spacing: Style.space(8)

            Text {
                textFormat: Text.PlainText
                text: root.hoverCandle ? Model.formatCandleTime(root.hoverCandle.timestamp, root.rangeKey) : ""
                color: Color.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                font.bold: true
            }

            Text {
                visible: root.hoverCandle && root.hoverCandle.strat && root.hoverCandle.strat !== "-"
                textFormat: Text.PlainText
                text: (root.hoverCandle && root.hoverCandle.strat && root.hoverCandle.strat !== "-") ? String(root.hoverCandle.strat).toUpperCase() : ""
                color: root.hoverCandle && root.hoverCandle.close >= root.hoverCandle.open ? root.upColor : root.downColor
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                font.bold: true
            }

            Text {
                textFormat: Text.PlainText
                text: {
                    if (!root.hoverCandle)
                        return "";
                    var c = root.hoverCandle;
                    return "O " + Model.formatPrice(c.open, root.currency, root.priceHint) + "   H " + Model.formatPrice(c.high, root.currency, root.priceHint) + "   L " + Model.formatPrice(c.low, root.currency, root.priceHint) + "   C " + Model.formatPrice(c.close, root.currency, root.priceHint);
                }
                color: root.hoverCandle && root.hoverCandle.close >= root.hoverCandle.open ? root.upColor : root.downColor
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
            }
        }
    }

    // Floating Close Price Badge (Used when showPriceScale is false)
    Rectangle {
        id: priceBadge
        visible: root.showTooltipHeader && !root.showPriceScale && root.interactive && root.hovering && root.hoverCandle !== null
        readonly property int maxX: Math.max(0, root.width - width - root.pad)
        x: Math.min(maxX, Math.max(root.pad, root.hoverX - width / 2))
        y: Math.max(root.pad + Style.space(18), Math.min(root.hoverY - height - Style.space(8), root.height - height - root.pad))
        radius: height / 2
        color: Color.popups.background
        border.width: 1
        border.color: Qt.rgba(Color.popups.text.r, Color.popups.text.g, Color.popups.text.b, 0.18)
        implicitWidth: badgeText.implicitWidth + Style.space(12)
        implicitHeight: badgeText.implicitHeight + Style.space(6)

        Text {
            id: badgeText
            anchors.centerIn: parent
            textFormat: Text.PlainText
            text: root.hoverCandle ? Model.formatPrice(root.hoverCandle.close, root.currency, root.priceHint) : ""
            color: root.hoverCandle && root.hoverCandle.close >= root.hoverCandle.open ? root.upColor : root.downColor
            font.family: root.fontFamily
            font.pixelSize: Style.font.bodySmall
            font.bold: true
        }
    }
}
