import QtQuick
import QtQuick.Shapes
import qs.Commons
import "Model.js" as Model

Item {
    id: root

    property string symbol: ""
    property var candles: []
    property var extendedPrice: null
    property color upColor: Color.foreground
    property color downColor: Color.foreground
    property color gridColor: Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.08)
    property color crosshairColor: Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.35)
    property color labelColor: Model.accessibleDimColor(Color.foreground, Color.background)
    property string currency: "USD"
    property var priceHint: 2
    property string rangeKey: "1D"
    property bool interactive: true
    property int pad: Style.space(6)
    property string fontFamily: Style.font.family
    property bool showGridLines: true
    property bool showTooltipHeader: true
    property bool isSyncing: false
    property bool renderActive: true
    property bool wheelZoomRequiresModifier: false
    property bool _geomDirty: false
    property bool _geomFlushScheduled: false

    property bool showPriceScale: true
    readonly property int scaleGutterWidth: showPriceScale ? Style.space(52) : 0
    property bool showTimeScale: true
    readonly property int timeScaleHeight: showTimeScale ? Style.space(18) : 0
    property bool showBroadening: false
    onShowBroadeningChanged: refreshGeometry()
    property var setupLines: []
    onSetupLinesChanged: refreshGeometry()

    signal crosshairMoved(real timestamp, real price, var candle)
    signal crosshairCleared
    signal replayRequested(real timestamp)
    signal zoomChangedManually(int nextViewCount)
    signal chartPressed
    signal chartDoubleClicked

    property int configuredZoom: -1
    property int viewStart: 0
    property int viewCount: -1
    property bool followLatest: true
    property int rightOffsetBars: -1 // -1 = TradingView-style default (~9 bars right margin)

    onConfiguredZoomChanged: {
        var target = (root.configuredZoom >= Model.MIN_BAR_COUNT) ? root.configuredZoom : -1;
        if (root.viewCount !== target) {
            root.viewCount = target;
            root.followLatest = true;
            root.refreshGeometry();
        }
    }
    property bool autoPriceScale: true
    property real manualLogMin: 0
    property real manualLogMax: 0
    property bool draggingPriceScale: false
    property string priceScaleDragMode: ""
    property real dragStartX: 0
    property real dragStartY: 0
    property real dragStartLogMin: 0
    property real dragStartLogMax: 0
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
    property string hoverOhlcField: "close"
    property int hoverIndex: -1
    property var hoverCandle: null
    property real hoverX: 0
    property real hoverY: 0
    property real hoverPointerX: 0
    property real hoverPointerY: 0
    property var cachedGeometry: null

    function resetPriceScale() {
        if (!root.autoPriceScale || root.draggingPriceScale) {
            root.autoPriceScale = true;
            root.draggingPriceScale = false;
            root.priceScaleDragMode = "";
            root.refreshGeometry();
        }
    }

    function resetZoom() {
        viewStart = 0;
        viewCount = (root.configuredZoom >= Model.MIN_BAR_COUNT) ? root.configuredZoom : -1;
        followLatest = true;
        rightOffsetBars = -1;
        autoPriceScale = true;
        draggingPriceScale = false;
        priceScaleDragMode = "";
        refreshGeometry();
    }

    function followLatestEdge() {
        followLatest = true;
        refreshGeometry();
    }

    function globalIndexToX(globalIdx, g) {
        if (!g)
            return 0;
        return g.left + (globalIdx - g.vStart + 0.5) * g.slotW;
    }

    function priceToYVal(price, g) {
        if (!g || g.innerH <= 0 || !g.logSpan)
            return 0;
        var lp = Math.log(Math.max(0.00001, price));
        return g.top + g.innerH * (1 - (lp - g.logMin) / g.logSpan);
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
        if (hovering && hoverIndex === bestIdx)
            return;
        isSyncing = true;
        hoverIndex = bestIdx;
        hoverCandle = candles[bestIdx];
        hoverX = g.xs[bestIdx];
        hoverY = g.yCloses[bestIdx];
        hoverPrice = hoverCandle ? hoverCandle.close : 0;
        hovering = true;
        isSyncing = false;
    }

    property var _cachedCandlesSource: null
    property int _cachedCandlesLen: -1
    property string _cachedLastCandleSig: ""
    property var _cachedValidCandles: []
    property var _cachedBfValidRef: null
    property string _cachedBfAnchor: ""
    property var _cachedBfResult: null

    function validCandles() {
        var src = root.candles || [];
        var srcLen = src.length;
        var last = srcLen > 0 ? src[srcLen - 1] : null;
        var lastSig = last ? (last.timestamp + ":" + last.open + ":" + last.high + ":" + last.low + ":" + last.close) : "";
        if (src === root._cachedCandlesSource && srcLen === root._cachedCandlesLen && lastSig === root._cachedLastCandleSig) {
            return root._cachedValidCandles;
        }
        // Incremental fast path: live tick updated only the developing rightmost candle
        if (srcLen >= 2 && srcLen === root._cachedCandlesLen && root._cachedValidCandles && root._cachedValidCandles.length === srcLen) {
            var firstC = src[0];
            var prevC = src[srcLen - 2];
            var cachedFirst = root._cachedValidCandles[0];
            var cachedPrev = root._cachedValidCandles[srcLen - 2];
            var cachedLast = root._cachedValidCandles[srcLen - 1];
            if (firstC && prevC && last && cachedFirst && cachedPrev && cachedLast
                && firstC.timestamp === cachedFirst.timestamp
                && prevC.timestamp === cachedPrev.timestamp
                && Number(prevC.close) === cachedPrev.close
                && last.timestamp === cachedLast.timestamp) {
                var lo = Number(last.open);
                var lh = Number(last.high);
                var ll = Number(last.low);
                var lc = Number(last.close);
                if (isFinite(lo) && isFinite(lh) && isFinite(ll) && isFinite(lc)) {
                    var rangeChanged = (lh !== cachedLast.high || ll !== cachedLast.low);
                    cachedLast.open = lo;
                    cachedLast.high = lh;
                    cachedLast.low = ll;
                    cachedLast.close = lc;
                    cachedLast.volume = last.volume || 0;
                    cachedLast.strat = Model.stratScenario(cachedLast, cachedPrev);
                    root._cachedCandlesSource = src;
                    root._cachedLastCandleSig = lastSig;
                    if (rangeChanged) {
                        root._cachedBfValidRef = null;
                        root._cachedBfResult = null;
                    }
                    return root._cachedValidCandles;
                }
            }
        }
        var out = [];
        for (var i = 0; i < srcLen; i++) {
            var c = src[i];
            if (!c)
                continue;
            var o = Number(c.open);
            var h = Number(c.high);
            var l = Number(c.low);
            var cl = Number(c.close);
            if (isFinite(o) && isFinite(h) && isFinite(l) && isFinite(cl)) {
                var prevValid = out.length > 0 ? out[out.length - 1] : null;
                var item = {
                    timestamp: c.timestamp,
                    open: o,
                    high: h,
                    low: l,
                    close: cl,
                    volume: c.volume || 0,
                    strat: ""
                };
                item.strat = Model.stratScenario(item, prevValid);
                out.push(item);
            }
        }
        root._cachedCandlesSource = src;
        root._cachedCandlesLen = srcLen;
        root._cachedLastCandleSig = lastSig;
        root._cachedValidCandles = out;
        root._cachedBfValidRef = null;
        root._cachedBfResult = null;
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
            allCandles: [],
            candles: [],
            broadening: null,
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
            flushStart: 0,
            maxStart: 0,
            rightOffsetBars: 0,
            totalCandles: 0,
            ticks: [],
            timeTicks: [],
            xs: [],
            yOpens: [],
            yHighs: [],
            yLows: [],
            yCloses: [],
            lastClose: null,
            extendedPrice: null,
            yExtended: null
        };
        if (total === 0)
            return unset;

        var isDaily = (root.rangeKey === "1D" || root.rangeKey === "D" || root.rangeKey === "day" || root.rangeKey === "1d");
        var isWeekly = (root.rangeKey === "1W" || root.rangeKey === "W" || root.rangeKey === "week" || root.rangeKey === "1w");
        var defaultCount = (isDaily || isWeekly) ? Math.min(total, 140) : total;
        var vp = Model.resolveHorizontalViewport(total, root.viewCount, defaultCount, root.viewStart, root.followLatest, root.rightOffsetBars);
        var vCount = vp.vCount;
        var vStart = vp.vStart;

        var list = all.slice(vStart, Math.min(total, vStart + vCount));
        if (list.length === 0)
            return unset;

        var strats = [];
        for (var si = 0; si < list.length; si++) {
            strats.push(list[si].strat || "");
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

        var candleMin = min;
        var candleMax = max;

        if (root.setupLines && root.setupLines.length > 0) {
            for (var sli = 0; sli < root.setupLines.length; sli++) {
                var sl = root.setupLines[sli];
                if (sl && isFinite(sl.price) && sl.price > 0) {
                    if (sl.price >= candleMin * 0.85 && sl.price <= candleMax * 1.15) {
                        if (sl.price < min)
                            min = sl.price;
                        if (sl.price > max)
                            max = sl.price;
                    }
                }
            }
        }

        var extVal = Model.finiteOrNull(root.extendedPrice);
        var hasExtended = (extVal !== null && extVal > 0 && (vStart + vCount >= total));
        if (hasExtended) {
            if (extVal < min)
                min = extVal;
            if (extVal > max)
                max = extVal;
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
        if (!root.autoPriceScale && isFinite(root.manualLogMin) && isFinite(root.manualLogMax) && root.manualLogMax > root.manualLogMin) {
            logMin = root.manualLogMin;
            logMax = root.manualLogMax;
            logSpan = logMax - logMin;
        }
        min = Math.exp(logMin);
        max = Math.exp(logMax);
        var span = max - min;

        var innerW = right - left;
        var innerH = bot - top;
        var slotW = innerW / Math.max(1, vCount);
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
                            var cpStep = cp > 0 ? Math.pow(10, Math.floor(Math.log10(cp))) : 1;
                            ticks.push({
                                price: cp,
                                y: cty,
                                label: Model.formatScalePrice(cp, cpStep, root.priceHint)
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
                if (step > 0 && isFinite(step)) {
                    var startPrice = Math.ceil(min / step) * step;
                    var lastLinY = -99999;
                    var tickGuard = 0;
                    for (var p = startPrice; p <= max && tickGuard < 64; p += step, tickGuard++) {
                        var ty = priceToY(p);
                        if (ty >= top - 2 && ty <= bot + 2) {
                            if (ticks.length === 0 || Math.abs(ty - lastLinY) >= minSpacing) {
                                ticks.push({
                                    price: p,
                                    y: ty,
                                    label: Model.formatScalePrice(p, step, root.priceHint)
                                });
                                lastLinY = ty;
                            }
                        }
                    }
                }
            }
        }

        // Bottom Time Scale Axis Ticks
        var timeTicks = [];
        if (root.showTimeScale && list.length > 0 && innerW > 0) {
            var minTimeSpacing = (root.rangeKey === "60" || root.rangeKey === "30") ? Style.space(68) : Style.space(55);
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

        var isThirtyMinChart = (root.rangeKey === "30" || root.rangeKey === "30m");
        var isDailyChart = (root.rangeKey === "1D" || root.rangeKey === "D" || root.rangeKey === "day" || root.rangeKey === "1d");
        var isHourlyChart = (root.rangeKey === "60" || root.rangeKey === "60m" || root.rangeKey === "1h");
        var isWeeklyChart = (root.rangeKey === "1W" || root.rangeKey === "W" || root.rangeKey === "1w" || root.rangeKey === "week");
        var isMonthlyChart = (root.rangeKey === "1M" || root.rangeKey === "M" || root.rangeKey === "month");
        var bf = null;
        if (root.showBroadening && (isThirtyMinChart || isDailyChart || isHourlyChart || isWeeklyChart || isMonthlyChart) && all && all.length >= 3 && innerW > 0) {
            var anchorMode = isThirtyMinChart ? "day" : (isHourlyChart ? "week" : (isWeeklyChart ? "quarter" : (isMonthlyChart ? "year" : "month")));
            if (root._cachedBfValidRef === all && root._cachedBfAnchor === anchorMode) {
                bf = root._cachedBfResult;
            } else {
                bf = Model.computeActiveBroadening(all, null, anchorMode);
                root._cachedBfValidRef = all;
                root._cachedBfAnchor = anchorMode;
                root._cachedBfResult = bf;
            }
        }

        return {
            allCandles: all,
            candles: list,
            broadening: bf,
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
            flushStart: vp.flushStart,
            maxStart: vp.maxStart,
            rightOffsetBars: vp.rightOffsetBars,
            totalCandles: total,
            ticks: ticks,
            timeTicks: timeTicks,
            xs: xs,
            yOpens: yOpens,
            yHighs: yHighs,
            yLows: yLows,
            yCloses: yCloses,
            lastClose: all[total - 1].close,
            extendedPrice: hasExtended ? extVal : null,
            yExtended: hasExtended ? priceToY(extVal) : null
        };
    }

    function _flushGeometry() {
        root._geomFlushScheduled = false;
        if (!root.visible || !root.renderActive || root.width <= 0 || root.height <= 0) {
            root._geomDirty = true;
            return;
        }
        root._geomDirty = false;
        cachedGeometry = buildGeom();
        canvas.requestPaint();
        if (hovering && !dragging && !draggingPriceScale)
            updateHover(hoverPointerX, hoverPointerY);
    }

    function refreshGeometry() {
        root._geomDirty = true;
        if (!root.visible || !root.renderActive || root.width <= 0 || root.height <= 0)
            return;
        if (!root._geomFlushScheduled) {
            root._geomFlushScheduled = true;
            Qt.callLater(root._flushGeometry);
        }
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
            var prevHoveringScale = hoveringScale;
            var prevHoveredTick = hoveredTickIndex;
            hoveringScale = true;
            hovering = true;
            hoverIndex = -1;
            hoverCandle = null;
            hoverOhlcField = "scale";

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

            if (!prevHoveringScale || prevHoveredTick !== hoveredTickIndex)
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

        // Cursor hovering in the empty TradingView-style right margin past the latest bar
        if (idx >= g.candles.length) {
            hoverIndex = -1;
            hoverCandle = null;
            hoverX = Math.max(g.left, Math.min(g.right, px));
            hoverY = Math.max(g.top, Math.min(g.bot, py));
            hoverPrice = yToPrice(hoverY);
            hoverOhlcField = "scale";
            hovering = true;
            if (wasHoveringScale)
                canvas.requestPaint();
            if (!isSyncing)
                root.crosshairMoved(-1, hoverPrice, null);
            return;
        }

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
        var bestField = "close";
        var minDist = cDist;

        if (oDist < minDist) {
            minDist = oDist;
            bestY = oY;
            bestPrice = hoverCandle ? hoverCandle.open : 0;
            bestField = "open";
        }
        if (hDist <= minDist) {
            minDist = hDist;
            bestY = hY;
            bestPrice = hoverCandle ? hoverCandle.high : 0;
            bestField = "high";
        }
        if (lDist <= minDist) {
            minDist = lDist;
            bestY = lY;
            bestPrice = hoverCandle ? hoverCandle.low : 0;
            bestField = "low";
        }

        hoverY = bestY;
        hoverPrice = bestPrice;
        hoverOhlcField = bestField;
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

            var len = g.candles.length;
            var hasExt = (g.extendedPrice !== null && g.yExtended !== null && g.lastClose !== null);
            var isExtUp = hasExt ? (g.extendedPrice >= g.lastClose) : false;
            var extColor = isExtUp ? root.upColor : root.downColor;
            var badgeW = root.scaleGutterWidth - Style.space(4);
            var badgeH = Style.space(16);
            var badgeX = g.right + Style.space(2);
            var lastC = len > 0 ? g.candles[len - 1] : null;
            var lastY = len > 0 ? g.yCloses[len - 1] : 0;
            var badgeY = len > 0 ? Math.max(g.top, Math.min(g.bot - badgeH, Math.round(lastY - badgeH / 2))) : -99999;
            var extBadgeY = hasExt ? Math.max(g.top, Math.min(g.bot - badgeH, Math.round(g.yExtended - badgeH / 2))) : -99999;
            var drawRthBadge = (len > 0) && (!hasExt || Math.abs(extBadgeY - badgeY) >= badgeH + 2);

            // Right Price Scale Axis Ticks (Borderless at rest; subtle hover/drag gutter affordance)
            var quotedFont = Model.quotedFontFamily(root.fontFamily);
            if (root.showPriceScale && g.right < w) {
                if (root.hoveringScale || root.draggingPriceScale) {
                    ctx.save();
                    ctx.fillStyle = Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, root.draggingPriceScale ? 0.07 : 0.035);
                    ctx.fillRect(g.right, g.top, w - g.right, g.innerH);
                    ctx.strokeStyle = Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.14);
                    ctx.lineWidth = 1;
                    var sepX = Math.round(g.right) + 0.5;
                    ctx.beginPath();
                    ctx.moveTo(sepX, g.top);
                    ctx.lineTo(sepX, g.bot);
                    ctx.stroke();
                    ctx.restore();
                }

                var normalTickFont = Style.font.bodySmall + "px " + quotedFont;
                var boldTickFont = "bold " + normalTickFont;
                ctx.textAlign = "left";
                ctx.textBaseline = "middle";
                if (root.showGridLines && g.ticks.length > 0) {
                    ctx.strokeStyle = root.gridColor;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    for (var gi = 0; gi < g.ticks.length; gi++) {
                        var gy = Math.round(g.ticks[gi].y) + 0.5;
                        ctx.moveTo(g.left, gy);
                        ctx.lineTo(g.right, gy);
                    }
                    ctx.stroke();
                }
                var badgeCenterRth = badgeY + badgeH / 2;
                var badgeCenterExt = extBadgeY + badgeH / 2;
                var badgeOverlapPad = badgeH * 0.75;
                for (var ti = 0; ti < g.ticks.length; ti++) {
                    var t = g.ticks[ti];
                    var isHoveredTick = (ti === root.hoveredTickIndex && !root.draggingPriceScale);
                    if (!isHoveredTick) {
                        if (drawRthBadge && Math.abs(t.y - badgeCenterRth) < badgeOverlapPad)
                            continue;
                        if (hasExt && Math.abs(t.y - badgeCenterExt) < badgeOverlapPad)
                            continue;
                    }
                    ctx.font = isHoveredTick ? boldTickFont : normalTickFont;
                    ctx.fillStyle = isHoveredTick ? Color.foreground : root.labelColor;
                    ctx.fillText(t.label, g.right + Style.space(5), Math.round(t.y));
                }
            }

            // Clip chart plot area so vertically zoomed/panned candles, rays, and levels never bleed into headers or time axis
            ctx.save();
            ctx.beginPath();
            ctx.rect(Math.max(0, g.left - Style.space(4)), g.top, g.innerW + Style.space(4), g.innerH);
            ctx.clip();

            // Candlesticks rendering (batched by color: 2 wick stroke calls instead of N)
            var cW = g.candleW;
            var halfW = cW / 2;
            var bodyW = Math.max(1, Math.round(cW));

            ctx.lineWidth = 1;
            for (var pass = 0; pass < 2; pass++) {
                var drawUp = (pass === 0);
                var passColor = drawUp ? root.upColor : root.downColor;
                ctx.strokeStyle = passColor;
                ctx.fillStyle = passColor;

                // Batch all wicks for this polarity into a single Canvas path
                ctx.beginPath();
                for (var wi = 0; wi < len; wi++) {
                    var wc = g.candles[wi];
                    if ((wc.close >= wc.open) !== drawUp)
                        continue;
                    var wcx = Math.round(g.xs[wi]) + 0.5;
                    ctx.moveTo(wcx, Math.round(g.yHighs[wi]));
                    ctx.lineTo(wcx, Math.round(g.yLows[wi]));
                }
                ctx.stroke();

                // Draw candle bodies for this polarity
                for (var i = 0; i < len; i++) {
                    var c = g.candles[i];
                    if ((c.close >= c.open) !== drawUp)
                        continue;
                    var cx = Math.round(g.xs[i]) + 0.5;
                    var yO = Math.round(g.yOpens[i]);
                    var yC = Math.round(g.yCloses[i]);
                    var bodyTop = Math.min(yO, yC);
                    var bodyHeight = Math.max(1.5, Math.abs(yC - yO));
                    var bodyLeft = Math.round(cx - halfW);
                    ctx.fillRect(bodyLeft, bodyTop, bodyW, bodyHeight);
                }
            }

            // Extended-Hours (Pre-Market / After-Hours) Horizontal Price Line
            if (hasExt && g.yExtended >= g.top && g.yExtended <= g.bot) {
                var extLineY = Math.round(g.yExtended) + 0.5;
                ctx.save();
                ctx.lineWidth = 1;
                ctx.globalAlpha = 0.85;
                ctx.strokeStyle = extColor;
                if (ctx.setLineDash)
                    ctx.setLineDash([2, 3]);
                ctx.beginPath();
                ctx.moveTo(g.left, extLineY);
                ctx.lineTo(g.right, extLineY);
                ctx.stroke();
                ctx.restore();
            }

            // TheStrat Broadening Formation (BF) Lines (30m: daily/10d; 60m: weekly; 1D: monthly; 1W: quarterly; 1M: yearly)
            var bf = g.broadening;
            if (bf) {
                    var rightEdgeX = g.right;
                    var strokeColor = Model.isLightColor(Color.background) ? Color.foreground : "#FFFFFF";

                    var forms = (bf.formations && Array.isArray(bf.formations) && bf.formations.length > 0)
                        ? bf.formations
                        : [bf.major, bf.minor].filter(Boolean);

                    var getAnchorX = function(idx) {
                        var localIdx = idx - g.vStart;
                        if (localIdx >= 0 && localIdx < g.xs.length) {
                            return Math.round(g.xs[localIdx]) + 0.5;
                        }
                        return Math.round(g.xs[0] + localIdx * g.slotW) + 0.5;
                    };

                    var drawBFRay = function(ray, isUpper, formIdx) {
                        if (!ray) return;
                        var a1X = getAnchorX(ray.anchor1.index);
                        var a1Y = Math.round(root.priceToYVal(ray.anchor1.price, g)) + 0.5;
                        var a2X = getAnchorX(ray.anchor2.index);
                        var a2Y = Math.round(root.priceToYVal(ray.anchor2.price, g)) + 0.5;

                        var dx = a2X - a1X;
                        if (dx <= 0) return;

                        var screenSlope = (a2Y - a1Y) / dx;
                        var projY = Math.round(a1Y + screenSlope * (rightEdgeX - a1X)) + 0.5;

                        var startX = a1X;
                        var startY = a1Y;
                        if (startX < g.left) {
                            startX = g.left;
                            startY = Math.round(a1Y + screenSlope * (startX - a1X)) + 0.5;
                        }

                        var lvl = (typeof formIdx === "number") ? formIdx : 0;
                        var lineWidth = (lvl === 0) ? 0.60 : ((lvl === 1) ? 0.50 : 0.45);
                        var dotRadius = (lvl === 0) ? 1.8 : ((lvl === 1) ? 1.5 : 1.3);
                        var dashPattern = (lvl === 0) ? [] : ((lvl === 1) ? [6, 4] : [2, 3]);
                        var lineAlpha = (lvl === 0) ? 1.0 : ((lvl === 1) ? 0.75 : 0.40);

                        ctx.save();
                        ctx.globalAlpha = lineAlpha;
                        ctx.strokeStyle = strokeColor;
                        ctx.lineWidth = lineWidth;
                        if (ctx.setLineDash) ctx.setLineDash(dashPattern);

                        ctx.beginPath();
                        ctx.moveTo(startX, startY);
                        if (a2X > startX && a2X < rightEdgeX) {
                            ctx.lineTo(a2X, a2Y);
                        }
                        ctx.lineTo(rightEdgeX, projY);
                        ctx.stroke();

                        // Anchor Rings / Dots
                        if (ctx.setLineDash) ctx.setLineDash([]);
                        ctx.fillStyle = strokeColor;
                        if (a1X >= g.left && a1X <= g.right) {
                            ctx.beginPath();
                            ctx.arc(a1X, a1Y, dotRadius, 0, Math.PI * 2);
                            ctx.fill();
                        }
                        if (a2X >= g.left && a2X <= g.right) {
                            ctx.beginPath();
                            ctx.arc(a2X, a2Y, dotRadius, 0, Math.PI * 2);
                            ctx.fill();
                        }
                        ctx.restore();
                    };

                    // Draw all detected active broadening formations
                    for (var fi = 0; fi < forms.length; fi++) {
                        var f = forms[fi];
                        if (!f) continue;
                        if (f.upper) drawBFRay(f.upper, true, fi);
                        if (f.lower) drawBFRay(f.lower, false, fi);
                    }
                }

            // Automatic Triggered Strat Setup Lines (GridWindow Only: all solid; triggers colored by TF, targets green)
            if (root.setupLines && root.setupLines.length > 0 && g.innerW > 0) {
                var slIsLight = Model.isLightColor(Color.background);
                var slPlacedPillYs = [];
                var slFont = "bold " + Style.font.bodySmall + "px " + quotedFont;
                var slPadX = Style.space(4);
                var slPillH = Style.space(14);
                for (var si = 0; si < root.setupLines.length; si++) {
                    var sLine = root.setupLines[si];
                    if (!sLine || !isFinite(sLine.price) || sLine.price <= 0)
                        continue;

                    var sLyRaw = root.priceToYVal(sLine.price, g);
                    if (sLyRaw < g.top - Style.space(6) || sLyRaw > g.bot + Style.space(6))
                        continue;

                    var sAnchorIdx = Model.resolveLevelAnchorIndex(sLine, g.allCandles, root.rangeKey);
                    var sRawX1 = root.globalIndexToX(sAnchorIdx, g);
                    var sDrawX1 = Math.max(g.left, Math.min(g.right - Style.space(8), sRawX1));
                    var sDrawX2 = g.right;
                    if (sDrawX2 <= sDrawX1)
                        sDrawX1 = g.left;

                    var sLy = Math.round(sLyRaw) + 0.5;
                    var sColor = Model.setupLineColor(sLine.timeframe, sLine.kind, slIsLight);

                    ctx.save();
                    ctx.strokeStyle = sColor;
                    ctx.lineWidth = 1;
                    ctx.globalAlpha = 0.92;
                    if (typeof ctx.setLineDash === "function")
                        ctx.setLineDash([]);
                    ctx.beginPath();
                    ctx.moveTo(Math.round(sDrawX1), sLy);
                    ctx.lineTo(Math.round(sDrawX2), sLy);
                    ctx.stroke();

                    var sPriceStr = Model.formatPrice(sLine.price, root.currency, root.priceHint);
                    var sBaseTxt = (sLine.label !== undefined && sLine.label !== null) ? String(sLine.label).trim() : "";
                    var sFullLabel = sBaseTxt.length > 0 ? (sBaseTxt + " · " + sPriceStr) : sPriceStr;

                    ctx.font = slFont;
                    var sTextW = ctx.measureText(sFullLabel).width;
                    var sPillW = sTextW + slPadX * 2;
                    var sPillX = Math.max(g.left + Style.space(2), Math.round(sDrawX2 - sPillW - Style.space(2)));
                    var sPillY = (sLy - slPillH - Style.space(2) >= g.top) ? Math.round(sLy - slPillH - Style.space(2)) : Math.round(sLy + Style.space(2));

                    for (var pi = 0; pi < slPlacedPillYs.length; pi++) {
                        if (Math.abs(sPillY - slPlacedPillYs[pi]) < slPillH) {
                            var belowCand = Math.round(sLy + Style.space(2));
                            var aboveCand = Math.round(slPlacedPillYs[pi] - slPillH - 1);
                            if (Math.abs(belowCand - slPlacedPillYs[pi]) >= slPillH && belowCand + slPillH <= g.bot)
                                sPillY = belowCand;
                            else if (aboveCand >= g.top)
                                sPillY = aboveCand;
                            else if (slPlacedPillYs[pi] + slPillH + 1 + slPillH <= g.bot)
                                sPillY = slPlacedPillYs[pi] + slPillH + 1;
                        }
                    }
                    slPlacedPillYs.push(sPillY);

                    ctx.globalAlpha = 0.84;
                    ctx.fillStyle = Color.background;
                    ctx.fillRect(sPillX, sPillY, sPillW, slPillH);

                    ctx.globalAlpha = 1.0;
                    ctx.fillStyle = sColor;
                    ctx.textAlign = "left";
                    ctx.textBaseline = "middle";
                    ctx.fillText(sFullLabel, sPillX + slPadX, sPillY + slPillH / 2);
                    ctx.restore();
                }
            }

            // End plot-area clip before drawing right-scale badges and bottom time scale
            ctx.restore();

            // Latest Price Marker in Right Price Scale Gutter
            if (root.showPriceScale && len > 0) {
                var isLastUp = lastC.close >= lastC.open;
                var badgeColor = isLastUp ? root.upColor : root.downColor;
                var isLastAbove = lastY < g.top;
                var isLastBelow = lastY > g.bot;
                var isLastOffscreen = isLastAbove || isLastBelow;
                var lastPrefix = isLastAbove ? "▲" : (isLastBelow ? "▼" : "");
                var lastLabel = lastPrefix + Model.formatScalePrice(lastC.close, null, root.priceHint);

                if (drawRthBadge) {
                    ctx.save();
                    if (hasExt)
                        ctx.globalAlpha = 0.55;
                    else if (isLastOffscreen)
                        ctx.globalAlpha = 0.85;
                    ctx.fillStyle = badgeColor;
                    ctx.fillRect(badgeX, badgeY, badgeW, badgeH);

                    ctx.font = "bold " + Style.font.bodySmall + "px " + quotedFont;
                    ctx.fillStyle = Color.background;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(lastLabel, badgeX + badgeW / 2, badgeY + badgeH / 2);
                    ctx.restore();
                }

                if (hasExt) {
                    var isExtAbove = g.yExtended < g.top;
                    var isExtBelow = g.yExtended > g.bot;
                    var extPrefix = isExtAbove ? "▲" : (isExtBelow ? "▼" : "");
                    var extLabel = extPrefix + Model.formatScalePrice(g.extendedPrice, null, root.priceHint);
                    ctx.save();
                    if (isExtAbove || isExtBelow)
                        ctx.globalAlpha = 0.85;
                    ctx.fillStyle = extColor;
                    ctx.fillRect(badgeX, extBadgeY, badgeW, badgeH);

                    ctx.font = "bold " + Style.font.bodySmall + "px " + quotedFont;
                    ctx.fillStyle = Color.background;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(extLabel, badgeX + badgeW / 2, extBadgeY + badgeH / 2);
                    ctx.restore();
                }
            }

            // Bottom Time Scale Axis Ticks
            if (root.showTimeScale && g.timeTicks && g.timeTicks.length > 0) {
                ctx.font = Style.font.bodySmall + "px " + Model.quotedFontFamily(root.fontFamily);
                ctx.fillStyle = root.labelColor;
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
    onExtendedPriceChanged: refreshGeometry()
    onUpColorChanged: canvas.requestPaint()
    onDownColorChanged: canvas.requestPaint()
    onGridColorChanged: canvas.requestPaint()
    onShowTimeScaleChanged: refreshGeometry()
    onShowPriceScaleChanged: refreshGeometry()
    onPadChanged: refreshGeometry()
    onWidthChanged: refreshGeometry()
    onHeightChanged: refreshGeometry()
    onVisibleChanged: if (visible && _geomDirty) refreshGeometry()
    onRenderActiveChanged: if (renderActive && _geomDirty) refreshGeometry()
    onDraggingPriceScaleChanged: canvas.requestPaint()

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
        acceptedButtons: Qt.LeftButton
        cursorShape: {
            if (root.draggingPriceScale)
                return Qt.SizeVerCursor;
            if (root.hoveringScale)
                return Qt.SizeVerCursor;
            if (root.dragging)
                return Qt.ClosedHandCursor;
            return enabled ? Qt.CrossCursor : Qt.ArrowCursor;
        }

        onPressed: function (mouse) {
            root.chartPressed();
            var g = root.cachedGeometry;

            if (mouse.button === Qt.LeftButton) {
                if (mouse.modifiers & Qt.AltModifier) {
                    root.updateHover(mouse.x, mouse.y);
                    if (!root.hoveringScale && root.hoverCandle && isFinite(root.hoverCandle.timestamp)) {
                        root.replayRequested(root.hoverCandle.timestamp);
                        return;
                    }
                }

                if (root.showPriceScale && g && g.candles.length > 0 && g.innerH > 0 && mouse.x >= g.right) {
                    root.draggingPriceScale = true;
                    root.priceScaleDragMode = (mouse.modifiers & Qt.ShiftModifier) ? "pan" : "zoom";
                    root.dragStartY = mouse.y;
                    root.dragStartLogMin = g.logMin;
                    root.dragStartLogMax = g.logMax;
                    if (root.autoPriceScale) {
                        root.manualLogMin = g.logMin;
                        root.manualLogMax = g.logMax;
                    }
                    return;
                }

                root.dragging = true;
                root.isShiftDrag = (mouse.modifiers & Qt.ShiftModifier) || (mouse.modifiers & Qt.ControlModifier);
                root.dragStartX = mouse.x;
                root.dragStartY = mouse.y;
                root.dragStartLogMin = g ? g.logMin : 0;
                root.dragStartLogMax = g ? g.logMax : 0;
                var all = root.validCandles();
                var total = all.length;
                root.dragStartViewStart = g ? g.vStart : 0;
                root.dragStartViewCount = (g && g.vCount) ? g.vCount : total;
                var innerW = g ? g.innerW : Math.max(1, root.width - root.scaleGutterWidth);
                var leftBase = g ? g.left : root.pad;
                root.dragStartRatio = Math.max(0, Math.min(1, (mouse.x - leftBase) / innerW));
                root.dragStartCenterIndex = root.dragStartViewStart + root.dragStartViewCount * root.dragStartRatio;
            }
        }

        onPositionChanged: function (mouse) {
            var g = root.cachedGeometry;

            if (root.draggingPriceScale && g && g.innerH > 0) {
                var dyScale = mouse.y - root.dragStartY;
                if (Math.abs(dyScale) < 1)
                    return;
                var nextScaleRange = (root.priceScaleDragMode === "pan")
                    ? Model.panPriceLogRange(root.dragStartLogMin, root.dragStartLogMax, dyScale, g.innerH)
                    : Model.zoomPriceLogRange(root.dragStartLogMin, root.dragStartLogMax, Model.priceScaleDragFactor(dyScale, g.innerH));
                root.autoPriceScale = false;
                root.manualLogMin = nextScaleRange.logMin;
                root.manualLogMax = nextScaleRange.logMax;
                root.refreshGeometry();
                return;
            }

            if (root.dragging && g) {
                var all = root.validCandles();
                var total = all.length;

                if (root.isShiftDrag && total > Model.MIN_BAR_COUNT) {
                    // Shift+Drag = Zoom (preserving right-side whitespace when at latest edge)
                    var deltaX = mouse.x - root.dragStartX;
                    var countDelta = Math.round(deltaX * 0.25);
                    var nextCount = Math.max(Model.MIN_BAR_COUNT, Math.min(total, root.dragStartViewCount - countDelta));
                    var nextMaxStart = Model.maxChartViewStart(total, nextCount);
                    var nextFlush = Math.max(0, total - nextCount);
                    var isAtLatestBar = root.followLatest || (root.dragStartViewStart + root.dragStartViewCount >= total - 1) || root.dragStartRatio >= 0.85;
                    var preservedRight = isAtLatestBar ? Math.min(g.rightOffsetBars, Math.max(0, nextMaxStart - nextFlush)) : 0;
                    var nextStart = isAtLatestBar
                        ? Math.min(nextMaxStart, nextFlush + preservedRight)
                        : Math.max(0, Math.min(nextMaxStart, Math.round(root.dragStartCenterIndex - nextCount * root.dragStartRatio)));

                    var targetViewCount = nextCount >= total ? -1 : nextCount;
                    var targetFollow = (nextStart >= nextFlush);
                    var targetRightOffset = targetFollow ? Math.max(0, nextStart - nextFlush) : 0;
                    var targetViewStart = targetFollow ? nextStart : nextStart;
                    if (targetViewCount !== root.viewCount || targetViewStart !== root.viewStart || targetFollow !== root.followLatest || targetRightOffset !== root.rightOffsetBars) {
                        var zoomChanged = (targetViewCount !== root.viewCount);
                        root.viewCount = targetViewCount;
                        root.viewStart = targetViewStart;
                        root.followLatest = targetFollow;
                        root.rightOffsetBars = targetRightOffset;
                        root.refreshGeometry();
                        if (zoomChanged)
                            root.zoomChangedManually(root.viewCount);
                    }
                } else if (!root.isShiftDrag) {
                    // Normal Drag = PAN horizontally (including left into TradingView-style right margin) + vertically when manual Y-scale is active
                    var panChanged = false;
                    if (g.maxStart > 0) {
                        var deltaX = mouse.x - root.dragStartX;
                        var shiftBars = Math.round(deltaX / Math.max(1, g.slotW));
                        var nextStart = Math.max(0, Math.min(g.maxStart, root.dragStartViewStart - shiftBars));
                        var nextFollow = (nextStart >= g.flushStart);
                        var nextRightOffset = nextFollow ? Math.max(0, nextStart - g.flushStart) : 0;

                        if (nextStart !== root.viewStart || root.followLatest !== nextFollow || root.rightOffsetBars !== nextRightOffset) {
                            root.viewStart = nextStart;
                            root.followLatest = nextFollow;
                            root.rightOffsetBars = nextRightOffset;
                            panChanged = true;
                        }
                    }
                    if (!root.autoPriceScale && g.innerH > 0) {
                        var dyPan = mouse.y - root.dragStartY;
                        var panned = Model.panPriceLogRange(root.dragStartLogMin, root.dragStartLogMax, dyPan, g.innerH);
                        if (panned.logMin !== root.manualLogMin || panned.logMax !== root.manualLogMax) {
                            root.manualLogMin = panned.logMin;
                            root.manualLogMax = panned.logMax;
                            panChanged = true;
                        }
                    }
                    if (panChanged)
                        root.refreshGeometry();
                }
            } else {
                root.updateHover(mouse.x, mouse.y);
            }
        }

        onReleased: function (mouse) {
            root.draggingPriceScale = false;
            root.priceScaleDragMode = "";
            root.dragging = false;
            root.isShiftDrag = false;
            root.updateHover(mouse.x, mouse.y);
        }

        onCanceled: {
            root.draggingPriceScale = false;
            root.priceScaleDragMode = "";
            root.dragging = false;
            root.isShiftDrag = false;
        }

        onDoubleClicked: function (mouse) {
            if (mouse.button !== Qt.LeftButton)
                return;
            if (mouse.modifiers & Qt.AltModifier)
                return;
            root.draggingPriceScale = false;
            root.priceScaleDragMode = "";
            root.dragging = false;
            root.isShiftDrag = false;
            root.chartDoubleClicked();
        }

        onWheel: function (wheel) {
            var g = root.cachedGeometry;
            if (root.showPriceScale && g && g.candles.length > 0 && g.innerH > 0 && wheel.x >= g.right) {
                var dyWheel = (wheel.angleDelta.y !== 0) ? wheel.angleDelta.y : (wheel.pixelDelta ? wheel.pixelDelta.y * 2 : 0);
                if (dyWheel !== 0) {
                    var baseLogMin = root.autoPriceScale ? g.logMin : root.manualLogMin;
                    var baseLogMax = root.autoPriceScale ? g.logMax : root.manualLogMax;
                    var nextWheelRange = Model.zoomPriceLogRange(baseLogMin, baseLogMax, Model.priceScaleWheelFactor(dyWheel));
                    root.autoPriceScale = false;
                    root.manualLogMin = nextWheelRange.logMin;
                    root.manualLogMax = nextWheelRange.logMax;
                    root.refreshGeometry();
                }
                wheel.accepted = true;
                return;
            }

            if (root.wheelZoomRequiresModifier && !(wheel.modifiers & Qt.ControlModifier)) {
                wheel.accepted = false;
                return;
            }
            var all = root.validCandles();
            var total = all.length;
            if (total <= Model.MIN_BAR_COUNT)
                return;
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
                // Horizontal scroll or Shift+Scroll = PAN left/right (including right-side margin, preserving zoom level)
                if (g.maxStart > 0) {
                    var delta = isShiftVertical ? -wheel.angleDelta.y : -wheel.angleDelta.x;
                    var bars = Math.round((delta / 120) * Math.max(1, Math.round(curCount * 0.10)));
                    if (bars === 0 && delta !== 0)
                        bars = delta > 0 ? 1 : -1;
                    var nextStart = Math.max(0, Math.min(g.maxStart, curStart + bars));
                    var nextFollow = (nextStart >= g.flushStart);
                    var nextRightOffset = nextFollow ? Math.max(0, nextStart - g.flushStart) : 0;
                    if (nextStart !== root.viewStart || root.followLatest !== nextFollow || root.rightOffsetBars !== nextRightOffset) {
                        root.viewStart = nextStart;
                        root.followLatest = nextFollow;
                        root.rightOffsetBars = nextRightOffset;
                        root.refreshGeometry();
                    }
                }
            } else if (wheel.angleDelta.y !== 0) {
                var deltaBars = Math.round((Math.abs(wheel.angleDelta.y) / 120) * Math.max(1, Math.round(curCount * 0.08)));
                if (deltaBars < 1)
                    deltaBars = 1;

                var anchorBar = curStart + Math.round(ratio * curCount);
                var isAtLatestBar = root.followLatest || (curStart + curCount >= total - 1) || ratio >= 0.85;

                if (wheel.angleDelta.y > 0) {
                    // Zoom IN: reduce visible bar count, anchoring to latest bar (with preserved right margin) or cursor bar
                    var nextCount = Math.max(Model.MIN_BAR_COUNT, curCount - deltaBars);
                    var nextMaxStartIn = Model.maxChartViewStart(total, nextCount);
                    var nextFlushIn = Math.max(0, total - nextCount);
                    var preservedRightIn = isAtLatestBar ? Math.min(g.rightOffsetBars, Math.max(0, nextMaxStartIn - nextFlushIn)) : 0;
                    var nextStart = isAtLatestBar
                        ? Math.min(nextMaxStartIn, nextFlushIn + preservedRightIn)
                        : Math.max(0, Math.min(nextMaxStartIn, Math.round(anchorBar - ratio * nextCount)));
                    var nextFollowIn = (nextStart >= nextFlushIn);
                    root.viewCount = nextCount;
                    root.viewStart = nextStart;
                    root.followLatest = nextFollowIn;
                    root.rightOffsetBars = nextFollowIn ? Math.max(0, nextStart - nextFlushIn) : 0;
                    root.refreshGeometry();
                    root.zoomChangedManually(root.viewCount);
                } else if (wheel.angleDelta.y < 0) {
                    // Zoom OUT: increase visible bar count, preserving right margin when at latest edge
                    var nextCount = Math.min(total, curCount + deltaBars);
                    var nextMaxStartOut = Model.maxChartViewStart(total, nextCount);
                    var nextFlushOut = Math.max(0, total - nextCount);
                    var preservedRightOut = isAtLatestBar ? Math.min(g.rightOffsetBars, Math.max(0, nextMaxStartOut - nextFlushOut)) : 0;
                    var nextStart = isAtLatestBar
                        ? Math.min(nextMaxStartOut, nextFlushOut + preservedRightOut)
                        : Math.max(0, Math.min(nextMaxStartOut, Math.round(anchorBar - ratio * nextCount)));
                    var targetViewCount = nextCount >= total ? -1 : nextCount;
                    var targetFollow = (nextStart >= nextFlushOut);
                    var targetRightOffset = targetFollow ? Math.max(0, nextStart - nextFlushOut) : 0;
                    var targetViewStart = nextStart;
                    if (targetViewCount !== root.viewCount || targetViewStart !== root.viewStart || targetFollow !== root.followLatest || targetRightOffset !== root.rightOffsetBars) {
                        var zoomChanged = (targetViewCount !== root.viewCount);
                        root.viewCount = targetViewCount;
                        root.viewStart = targetViewStart;
                        root.followLatest = targetFollow;
                        root.rightOffsetBars = targetRightOffset;
                        root.refreshGeometry();
                        if (zoomChanged)
                            root.zoomChangedManually(root.viewCount);
                    }
                }
            }
            wheel.accepted = true;
        }

        onExited: {
            if (!root.dragging && !root.draggingPriceScale)
                root.clearHover();
        }
    }

    // Vertical Crosshair (Dashed Hairline [2, 3])
    Shape {
        id: verticalCrosshair
        visible: root.interactive && root.hovering && !root.hoveringScale && !root.draggingPriceScale
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
        visible: root.interactive && root.hovering && !root.draggingPriceScale && (!root.cachedGeometry || (root.hoverY >= root.cachedGeometry.top && root.hoverY <= root.cachedGeometry.bot))
        anchors.fill: parent

        ShapePath {
            strokeColor: root.hoveringScale ? Color.foreground : root.crosshairColor
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
        visible: root.interactive && root.hovering && !root.hoveringScale && !root.draggingPriceScale && root.hoverCandle !== null && (!root.cachedGeometry || (root.hoverY >= root.cachedGeometry.top && root.hoverY <= root.cachedGeometry.bot))
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
        visible: root.showPriceScale && root.interactive && root.hovering && !root.draggingPriceScale
        x: root.cachedGeometry ? (root.cachedGeometry.right + Style.space(2)) : (parent.width - root.scaleGutterWidth)
        y: root.cachedGeometry ? Math.max(root.cachedGeometry.top, Math.min(root.cachedGeometry.bot - height, Math.round(root.hoverY - height / 2))) : Math.max(root.pad + Style.space(16), Math.min(root.height - height - root.pad, Math.round(root.hoverY - height / 2)))
        width: Math.max(Style.space(32), root.scaleGutterWidth - Style.space(4))
        height: Style.space(16)
        color: Color.popups.background
        border.width: 1
        border.color: root.hoveringScale ? Color.foreground : root.crosshairColor
        z: Model.Z_LAYER.CROSSHAIR

        Text {
            anchors.centerIn: parent
            textFormat: Text.PlainText
            text: (root.hoverCandle || root.hoveringScale) ? Model.formatScalePrice(root.hoverPrice, null, root.priceHint) : ""
            color: Color.foreground
            font.family: root.fontFamily
            font.pixelSize: Style.font.bodySmall
            font.bold: true
        }
    }

    // Compact Auto-Scale Reset Button (visible only while manual Y-scale is active)
    Rectangle {
        id: autoScaleResetBtn
        visible: root.showPriceScale && root.interactive && !root.autoPriceScale && root.cachedGeometry !== null
        width: Math.max(Style.space(18), Math.min(Style.space(22), root.scaleGutterWidth - Style.space(6)))
        height: Style.space(15)
        x: root.cachedGeometry ? Math.round(root.cachedGeometry.right + (root.scaleGutterWidth - width) / 2) : (parent.width - width - Style.space(4))
        y: root.cachedGeometry ? Math.min(root.height - height - Style.space(2), Math.round(root.cachedGeometry.bot + Style.space(2))) : (parent.height - height - Style.space(2))
        radius: Style.space(2)
        color: autoScaleMouse.containsMouse ? Color.accent : Color.popups.background
        border.width: 1
        border.color: autoScaleMouse.containsMouse ? Color.accent : root.crosshairColor
        z: Model.Z_LAYER.CROSSHAIR + 1

        Behavior on color {
            ColorAnimation {
                duration: Style.duration(120)
                easing.type: Easing.OutCubic
            }
        }

        Text {
            anchors.centerIn: parent
            textFormat: Text.PlainText
            text: "A"
            color: autoScaleMouse.containsMouse ? Color.background : Color.foreground
            font.family: root.fontFamily
            font.pixelSize: Style.font.bodySmall - 1
            font.bold: true
        }

        MouseArea {
            id: autoScaleMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: root.resetPriceScale()
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
        z: Model.Z_LAYER.CROSSHAIR

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
    FinanceSurface {
        id: priceBadge
        elevation: 2
        radiusToken: "pill"
        visible: root.showTooltipHeader && !root.showPriceScale && root.interactive && root.hovering && root.hoverCandle !== null
        readonly property int maxX: Math.max(0, root.width - width - root.pad)
        x: Math.min(maxX, Math.max(root.pad, root.hoverX - width / 2))
        y: Math.max(root.pad + Style.space(18), Math.min(root.hoverY - height - Style.space(8), root.height - height - root.pad))
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
