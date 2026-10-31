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
    property bool showBroadening: false
    onShowBroadeningChanged: refreshGeometry()

    signal crosshairMoved(real timestamp, real price, var candle)
    signal crosshairCleared
    signal priceLevelsModified(var nextLevels)
    signal replayRequested(real timestamp)
    signal zoomChangedManually(int nextViewCount)

    property int configuredZoom: -1
    property int viewStart: 0
    property int viewCount: -1
    property bool followLatest: true

    onConfiguredZoomChanged: {
        var target = (root.configuredZoom >= 8) ? root.configuredZoom : -1;
        if (root.viewCount !== target) {
            root.viewCount = target;
            root.followLatest = true;
            root.refreshGeometry();
        }
    }
    property real dragStartX: 0
    property int dragStartViewStart: 0
    property int dragStartViewCount: 0
    property real dragStartCenterIndex: 0
    property real dragStartRatio: 0.5
    property bool dragging: false
    property bool isShiftDrag: false

    property string _lastLevelSymbol: ""
    property bool externalLevels: false
    property var priceLevels: []
    property int hoveredLevelIndex: -1
    property string hoveredLevelPart: ""
    property int draggingLevelIndex: -1
    property string levelDragMode: ""
    property int levelDragAnchorIdx: 0
    property real levelDragStartX: 0
    property real levelDragStartIdx1: 0
    property real levelDragStartIdx2: 0
    property bool levelDragMoved: false
    property int editingLevelIndex: -1
    readonly property bool editingLevel: editingLevelIndex >= 0

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

    function resetZoom() {
        if (symbol !== _lastLevelSymbol) {
            _lastLevelSymbol = symbol;
            clearLevels();
        }
        viewStart = 0;
        viewCount = (root.configuredZoom >= 8) ? root.configuredZoom : -1;
        followLatest = true;
        refreshGeometry();
    }

    function followLatestEdge() {
        followLatest = true;
        refreshGeometry();
    }

    function setPriceLevels(next) {
        if (!root.externalLevels)
            root.priceLevels = next;
        root.priceLevelsModified(next);
        refreshGeometry();
    }

    function globalIndexToX(globalIdx, g) {
        if (!g)
            return 0;
        return g.left + (globalIdx - g.vStart + 0.5) * g.slotW;
    }

    function xToGlobalIndex(px, g) {
        if (!g || g.slotW <= 0)
            return 0;
        return g.vStart + (px - g.left) / g.slotW - 0.5;
    }

    function resolveLevelEndpoints(lvl, g) {
        if (!lvl || !g || !g.allCandles || g.allCandles.length === 0)
            return null;
        if (!Model.isLevelVisibleOnTimeframe(lvl, root.rangeKey))
            return null;

        var all = g.allCandles;
        var total = all.length;
        var anchorIdx = Model.resolveLevelAnchorIndex(lvl, all, root.rangeKey);
        var tfOff = (lvl.offsets && lvl.offsets[root.rangeKey]) ? lvl.offsets[root.rangeKey] : null;

        var idx1 = (tfOff && tfOff.startDelta !== undefined) ? (anchorIdx + tfOff.startDelta) : anchorIdx;
        var idx2 = (tfOff && tfOff.endDelta !== undefined) ? (anchorIdx + tfOff.endDelta) : (total - 1 + 0.45);

        var rawX1 = globalIndexToX(idx1, g);
        var rawX2 = globalIndexToX(idx2, g);
        var leftX = Math.min(rawX1, rawX2);
        var rightX = Math.max(rawX1, rawX2);

        if (rightX < g.left || leftX > g.right)
            return null;

        var drawX1 = Math.max(g.left, Math.min(g.right, leftX));
        var drawX2 = Math.max(g.left, Math.min(g.right, rightX));

        return {
            anchorIdx: anchorIdx,
            idx1: idx1,
            idx2: idx2,
            rawX1: rawX1,
            rawX2: rawX2,
            drawX1: drawX1,
            drawX2: drawX2
        };
    }

    function priceToYVal(price, g) {
        if (!g || g.innerH <= 0 || !g.logSpan)
            return 0;
        var lp = Math.log(Math.max(0.00001, price));
        return g.top + g.innerH * (1 - (lp - g.logMin) / g.logSpan);
    }

    function levelToneColor(tone) {
        if (tone === "up")
            return root.upColor;
        if (tone === "down")
            return root.downColor;
        return Color.foreground;
    }

    function hitTestLevel(px, py) {
        var g = cachedGeometry;
        if (!g || !root.priceLevels || root.priceLevels.length === 0 || g.innerW <= 0)
            return null;
        var bestIdx = -1;
        var bestDist = Style.space(7);
        var bestPart = "move";
        var handleRadius = Style.space(8);
        for (var i = root.priceLevels.length - 1; i >= 0; i--) {
            var lvl = root.priceLevels[i];
            var ep = resolveLevelEndpoints(lvl, g);
            if (!ep)
                continue;
            var ly = priceToYVal(lvl.price, g);
            if (ly < g.top - Style.space(6) || ly > g.bot + Style.space(6))
                continue;
            var leftX = ep.drawX1;
            var rightX = ep.drawX2;
            if (px < leftX - handleRadius || px > rightX + handleRadius)
                continue;
            var dy = Math.abs(py - ly);
            if (dy <= bestDist) {
                bestDist = dy;
                bestIdx = i;
                if (Math.abs(px - leftX) <= handleRadius)
                    bestPart = (ep.rawX1 <= ep.rawX2) ? "x1" : "x2";
                else if (Math.abs(px - rightX) <= handleRadius)
                    bestPart = (ep.rawX2 >= ep.rawX1) ? "x2" : "x1";
                else
                    bestPart = "move";
            }
        }
        if (bestIdx < 0)
            return null;
        return {
            index: bestIdx,
            part: bestPart
        };
    }

    function startLevelEdit(index) {
        if (index < 0 || index >= root.priceLevels.length)
            return;
        root.editingLevelIndex = index;
        levelTextInput.text = root.priceLevels[index].text || "";
        levelTextInput.forceActiveFocus();
        levelTextInput.selectAll();
        canvas.requestPaint();
    }

    function commitLevelEdit() {
        if (root.editingLevelIndex >= 0 && root.editingLevelIndex < root.priceLevels.length) {
            var next = root.priceLevels.slice();
            var item = Object.assign({}, next[root.editingLevelIndex]);
            item.text = levelTextInput.text.trim();
            next[root.editingLevelIndex] = item;
            root.setPriceLevels(next);
        }
        root.editingLevelIndex = -1;
        canvas.requestPaint();
    }

    function dismissLevelEdit() {
        root.editingLevelIndex = -1;
        canvas.requestPaint();
    }

    function cycleEditingLevelTone() {
        if (root.editingLevelIndex < 0 || root.editingLevelIndex >= root.priceLevels.length)
            return;
        var next = root.priceLevels.slice();
        var item = Object.assign({}, next[root.editingLevelIndex]);
        var cur = item.tone || "fg";
        item.tone = (cur === "fg") ? "up" : (cur === "up" ? "down" : "fg");
        next[root.editingLevelIndex] = item;
        root.setPriceLevels(next);
    }

    function removeLevel(index) {
        if (index < 0 || index >= root.priceLevels.length)
            return;
        var next = root.priceLevels.slice();
        next.splice(index, 1);
        if (root.editingLevelIndex === index)
            root.editingLevelIndex = -1;
        else if (root.editingLevelIndex > index)
            root.editingLevelIndex -= 1;
        root.hoveredLevelIndex = -1;
        root.hoveredLevelPart = "";
        root.setPriceLevels(next);
    }

    function clearLevels() {
        if (!root.externalLevels)
            root.priceLevels = [];
        root.editingLevelIndex = -1;
        root.hoveredLevelIndex = -1;
        root.hoveredLevelPart = "";
        root.draggingLevelIndex = -1;
        canvas.requestPaint();
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
            allCandles: [],
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
            yCloses: [],
            lastClose: null,
            extendedPrice: null,
            yExtended: null
        };
        if (total === 0)
            return unset;

        var minBars = 8;
        var isDaily = (root.rangeKey === "1D" || root.rangeKey === "D" || root.rangeKey === "day" || root.rangeKey === "1d");
        var defaultCount = isDaily ? Math.min(total, 140) : total;
        var vCount = (root.viewCount > 0 && root.viewCount < total) ? Math.max(minBars, root.viewCount) : defaultCount;
        var maxStart = Math.max(0, total - vCount);
        var vStart = root.followLatest ? maxStart : Math.max(0, Math.min(maxStart, root.viewStart));

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

        var candleMin = min;
        var candleMax = max;
        if (root.priceLevels && root.priceLevels.length > 0) {
            for (var pli = 0; pli < root.priceLevels.length; pli++) {
                var pl = root.priceLevels[pli];
                if (pl && Model.isLevelVisibleOnTimeframe(pl, root.rangeKey) && isFinite(pl.price) && pl.price > 0) {
                    if (pl.price >= candleMin * 0.85 && pl.price <= candleMax * 1.15) {
                        if (pl.price < min)
                            min = pl.price;
                        if (pl.price > max)
                            max = pl.price;
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

        return {
            allCandles: all,
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
            yCloses: yCloses,
            lastClose: all[total - 1].close,
            extendedPrice: hasExtended ? extVal : null,
            yExtended: hasExtended ? priceToY(extVal) : null
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

            // Extended-Hours (Pre-Market / After-Hours) Horizontal Price Line
            var hasExt = (g.extendedPrice !== null && g.yExtended !== null && g.lastClose !== null);
            var isExtUp = hasExt ? (g.extendedPrice >= g.lastClose) : false;
            var extColor = isExtUp ? root.upColor : root.downColor;
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

            // TheStrat Broadening Formation (BF) Lines (Daily timeframe)
            var isDailyChart = (root.rangeKey === "1D" || root.rangeKey === "D" || root.rangeKey === "day" || root.rangeKey === "1d");
            if (root.showBroadening && isDailyChart && g.allCandles && g.allCandles.length >= 3 && g.innerW > 0) {
                var bf = Model.computeActiveBroadening(g.allCandles);
                if (bf) {
                    var rightEdgeX = g.right;
                    var futureIdxAtRight = g.vStart + Math.round((rightEdgeX - g.xs[0]) / g.slotW);
                    var drawnBadgeYs = [];

                    var drawBFRay = function(ray, isUpper, isMinor) {
                        if (!ray) return;
                        var a1X = Math.round(g.xs[0] + (ray.anchor1.index - g.vStart) * g.slotW) + 0.5;
                        var a1Y = Math.round(root.priceToYVal(ray.anchor1.price, g)) + 0.5;
                        var a2X = Math.round(g.xs[0] + (ray.anchor2.index - g.vStart) * g.slotW) + 0.5;
                        var a2Y = Math.round(root.priceToYVal(ray.anchor2.price, g)) + 0.5;

                        var projPrice = ray.anchor1.price + ray.slope * (futureIdxAtRight - ray.anchor1.index);
                        var projY = Math.round(root.priceToYVal(projPrice, g)) + 0.5;

                        var strokeColor = isUpper ? (isMinor ? "#00B4D8" : "#3879E3") : (isMinor ? "#FB7185" : "#FE0000");
                        var lineWidth = isMinor ? 0.5 : 0.6;
                        var dotRadius = isMinor ? 1.5 : 1.8;
                        var dashPattern = isMinor ? [4, 3] : [6, 4];

                        ctx.save();
                        ctx.strokeStyle = strokeColor;
                        ctx.lineWidth = lineWidth;
                        if (ctx.setLineDash) ctx.setLineDash(dashPattern);

                        ctx.beginPath();
                        ctx.moveTo(a1X, a1Y);
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

                        // Right Gutter Price Badge
                        if (root.showPriceScale && projY >= g.top && projY <= g.bot) {
                            var badgeW = root.scaleGutterWidth - Style.space(4);
                            var badgeH = Style.space(13);
                            var badgeX = g.right + Style.space(2);
                            var targetY = Math.max(g.top, Math.min(g.bot - badgeH, Math.round(projY - badgeH / 2)));

                            for (var bi = 0; bi < drawnBadgeYs.length; bi++) {
                                if (Math.abs(targetY - drawnBadgeYs[bi]) < badgeH + 2) {
                                    targetY = (targetY <= drawnBadgeYs[bi]) ? (drawnBadgeYs[bi] - badgeH - 2) : (drawnBadgeYs[bi] + badgeH + 2);
                                }
                            }
                            targetY = Math.max(g.top, Math.min(g.bot - badgeH, targetY));
                            drawnBadgeYs.push(targetY);

                            var badgeLabel = Model.formatPrice(projPrice, root.currency, root.priceHint);
                            ctx.fillStyle = strokeColor;
                            ctx.fillRect(badgeX, targetY, badgeW, badgeH);
                            ctx.font = "bold " + (Style.font.bodySmall - 1) + "px " + root.fontFamily;
                            ctx.fillStyle = "#FFFFFF";
                            ctx.textAlign = "center";
                            ctx.textBaseline = "middle";
                            ctx.fillText(badgeLabel, badgeX + badgeW / 2, targetY + badgeH / 2);
                        }
                        ctx.restore();
                    };

                    // Draw Major Formation Rays
                    if (bf.major) {
                        if (bf.major.upper) drawBFRay(bf.major.upper, true, false);
                        if (bf.major.lower) drawBFRay(bf.major.lower, false, false);
                    } else {
                        if (bf.upper) drawBFRay(bf.upper, true, false);
                        if (bf.lower) drawBFRay(bf.lower, false, false);
                    }

                    // Draw Minor (Nested) Formation Rays
                    if (bf.minor) {
                        if (bf.minor.upper) drawBFRay(bf.minor.upper, true, true);
                        if (bf.minor.lower) drawBFRay(bf.minor.lower, false, true);
                    }
                }
            }

            // User-Drawn Trigger / Target Price Level Lines
            if (root.priceLevels && root.priceLevels.length > 0 && g.innerW > 0) {
                for (var li = 0; li < root.priceLevels.length; li++) {
                    var lvl = root.priceLevels[li];
                    var ep = root.resolveLevelEndpoints(lvl, g);
                    if (!ep)
                        continue;

                    var lyRaw = root.priceToYVal(lvl.price, g);
                    if (lyRaw < g.top - Style.space(6) || lyRaw > g.bot + Style.space(6))
                        continue;

                    var ly = Math.round(lyRaw) + 0.5;
                    var lx1 = ep.drawX1;
                    var lx2 = ep.drawX2;
                    var isLvlActive = (li === root.hoveredLevelIndex || li === root.draggingLevelIndex || li === root.editingLevelIndex);
                    var lvlColor = root.levelToneColor(lvl.tone);

                    ctx.save();
                    ctx.strokeStyle = lvlColor;
                    ctx.lineWidth = isLvlActive ? 1.5 : 1;
                    ctx.globalAlpha = isLvlActive ? 1.0 : 0.9;
                    ctx.beginPath();
                    ctx.moveTo(Math.round(lx1), ly);
                    ctx.lineTo(Math.round(lx2), ly);
                    ctx.stroke();

                    // Endpoint Drag Handles when hovered, dragging, or editing
                    if (isLvlActive) {
                        var r = Style.space(3);
                        ctx.fillStyle = lvlColor;
                        ctx.beginPath();
                        ctx.arc(Math.round(lx1), ly, r, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.beginPath();
                        ctx.arc(Math.round(lx2), ly, r, 0, Math.PI * 2);
                        ctx.fill();
                    }

                    // Inline Label: Custom Trigger/Target Text + Formatted Price
                    if (li !== root.editingLevelIndex) {
                        var priceStr = Model.formatPrice(lvl.price, root.currency, root.priceHint);
                        var customTxt = (lvl.text !== undefined && lvl.text !== null) ? String(lvl.text).trim() : "";
                        var fullLabel = customTxt.length > 0 ? (customTxt + " · " + priceStr) : priceStr;

                        ctx.font = "bold " + Style.font.bodySmall + "px " + root.fontFamily;
                        var textW = ctx.measureText(fullLabel).width;
                        var padX = Style.space(4);
                        var pillW = textW + padX * 2;
                        var pillH = Style.space(14);
                        var preferredX = Math.max(lx1 + Style.space(2), lx2 - pillW - Style.space(2));
                        var pillX = Math.max(g.left + Style.space(2), Math.min(g.right - pillW - Style.space(2), Math.round(preferredX)));
                        var pillY = (ly - pillH - Style.space(2) >= g.top) ? Math.round(ly - pillH - Style.space(2)) : Math.round(ly + Style.space(2));

                        ctx.globalAlpha = 0.84;
                        ctx.fillStyle = Color.background;
                        ctx.fillRect(pillX, pillY, pillW, pillH);

                        ctx.globalAlpha = 1.0;
                        ctx.fillStyle = lvlColor;
                        ctx.textAlign = "left";
                        ctx.textBaseline = "middle";
                        ctx.fillText(fullLabel, pillX + padX, pillY + pillH / 2);
                    }
                    ctx.restore();
                }
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
                var extBadgeY = hasExt ? Math.max(g.top, Math.min(g.bot - badgeH, Math.round(g.yExtended - badgeH / 2))) : -99999;
                var drawRthBadge = !hasExt || Math.abs(extBadgeY - badgeY) >= badgeH + 2;

                if (drawRthBadge) {
                    ctx.save();
                    if (hasExt)
                        ctx.globalAlpha = 0.55;
                    ctx.fillStyle = badgeColor;
                    ctx.fillRect(badgeX, badgeY, badgeW, badgeH);

                    ctx.font = "bold " + Style.font.bodySmall + "px " + root.fontFamily;
                    ctx.fillStyle = Color.background;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(lastLabel, badgeX + badgeW / 2, badgeY + badgeH / 2);
                    ctx.restore();
                }

                if (hasExt) {
                    var extLabel = Model.formatPrice(g.extendedPrice, root.currency, root.priceHint);
                    ctx.fillStyle = extColor;
                    ctx.fillRect(badgeX, extBadgeY, badgeW, badgeH);

                    ctx.font = "bold " + Style.font.bodySmall + "px " + root.fontFamily;
                    ctx.fillStyle = Color.background;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(extLabel, badgeX + badgeW / 2, extBadgeY + badgeH / 2);
                }
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
    onExtendedPriceChanged: refreshGeometry()
    onPriceLevelsChanged: refreshGeometry()
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
        cursorShape: {
            if (root.draggingLevelIndex >= 0)
                return (root.levelDragMode === "x1" || root.levelDragMode === "x2") ? Qt.SizeHorCursor : Qt.ClosedHandCursor;
            if (root.hoveredLevelIndex >= 0)
                return (root.hoveredLevelPart === "x1" || root.hoveredLevelPart === "x2") ? Qt.SizeHorCursor : Qt.PointingHandCursor;
            if (root.dragging)
                return Qt.ClosedHandCursor;
            return enabled ? Qt.CrossCursor : Qt.ArrowCursor;
        }

        onPressed: function (mouse) {
            var g = root.cachedGeometry;
            if (mouse.button === Qt.RightButton) {
                var rightHit = root.hitTestLevel(mouse.x, mouse.y);
                if (rightHit) {
                    root.removeLevel(rightHit.index);
                    return;
                }
                root.updateHover(mouse.x, mouse.y);
                if (g && g.innerW > 0 && root.hoverPrice > 0) {
                    if (root.editingLevel)
                        root.commitLevelEdit();
                    var anchorTs = (!root.hoveringScale && root.hoverCandle) ? root.hoverCandle.timestamp : (g.candles.length > 0 ? g.candles[0].timestamp : 0);
                    var ohlcField = root.hoveringScale ? "scale" : root.hoverOhlcField;
                    var nextLevels = root.priceLevels ? root.priceLevels.slice() : [];
                    nextLevels.push({
                        price: root.hoverPrice,
                        sourceTf: root.rangeKey,
                        anchorTs: anchorTs,
                        ohlcField: ohlcField,
                        text: "",
                        tone: "fg",
                        offsets: ({})
                    });
                    root.setPriceLevels(nextLevels);
                    root.startLevelEdit(nextLevels.length - 1);
                }
                return;
            }

            if (mouse.button === Qt.LeftButton) {
                if (root.editingLevel)
                    root.commitLevelEdit();

                if (mouse.modifiers & Qt.AltModifier) {
                    root.updateHover(mouse.x, mouse.y);
                    if (!root.hoveringScale && root.hoverCandle && isFinite(root.hoverCandle.timestamp)) {
                        root.replayRequested(root.hoverCandle.timestamp);
                        return;
                    }
                }

                var leftHit = root.hitTestLevel(mouse.x, mouse.y);
                if (leftHit && g && g.innerW > 0) {
                    var targetLvl = root.priceLevels[leftHit.index];
                    var ep = root.resolveLevelEndpoints(targetLvl, g);
                    if (ep) {
                        root.draggingLevelIndex = leftHit.index;
                        root.levelDragMode = leftHit.part;
                        root.levelDragStartX = mouse.x;
                        root.levelDragAnchorIdx = ep.anchorIdx;
                        var startIdx1 = ep.idx1;
                        var startIdx2 = ep.idx2;
                        if (leftHit.part === "x1" && (ep.rawX1 < g.left || ep.rawX1 > g.right))
                            startIdx1 = root.xToGlobalIndex(ep.drawX1, g);
                        if (leftHit.part === "x2" && (ep.rawX2 < g.left || ep.rawX2 > g.right))
                            startIdx2 = root.xToGlobalIndex(ep.drawX2, g);
                        root.levelDragStartIdx1 = startIdx1;
                        root.levelDragStartIdx2 = startIdx2;
                        root.levelDragMoved = false;
                        canvas.requestPaint();
                        return;
                    }
                }

                root.dragging = true;
                root.isShiftDrag = (mouse.modifiers & Qt.ShiftModifier) || (mouse.modifiers & Qt.ControlModifier);
                root.dragStartX = mouse.x;
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
            if (root.draggingLevelIndex >= 0 && g && g.innerW > 0) {
                var clampedX = Math.max(g.left, Math.min(g.right, mouse.x));
                var dx = clampedX - root.levelDragStartX;
                if (Math.abs(mouse.x - root.levelDragStartX) >= 2)
                    root.levelDragMoved = true;
                var dBars = dx / Math.max(1, g.slotW);
                var nextLevels = root.priceLevels.slice();
                var item = Object.assign({}, nextLevels[root.draggingLevelIndex]);
                var nextOffsets = Object.assign({}, item.offsets || {});
                var minBarsSpan = Math.max(0.25, 12 / Math.max(1, g.slotW));
                var nextIdx1 = root.levelDragStartIdx1;
                var nextIdx2 = root.levelDragStartIdx2;

                if (root.levelDragMode === "x1") {
                    nextIdx1 = root.levelDragStartIdx1 + dBars;
                    if (Math.abs(nextIdx2 - nextIdx1) < minBarsSpan)
                        nextIdx1 = nextIdx2 >= root.levelDragStartIdx1 ? nextIdx2 - minBarsSpan : nextIdx2 + minBarsSpan;
                } else if (root.levelDragMode === "x2") {
                    nextIdx2 = root.levelDragStartIdx2 + dBars;
                    if (Math.abs(nextIdx2 - nextIdx1) < minBarsSpan)
                        nextIdx2 = nextIdx1 <= root.levelDragStartIdx2 ? nextIdx1 + minBarsSpan : nextIdx1 - minBarsSpan;
                } else {
                    nextIdx1 = root.levelDragStartIdx1 + dBars;
                    nextIdx2 = root.levelDragStartIdx2 + dBars;
                }

                nextOffsets[root.rangeKey] = {
                    startDelta: nextIdx1 - root.levelDragAnchorIdx,
                    endDelta: nextIdx2 - root.levelDragAnchorIdx
                };
                item.offsets = nextOffsets;
                nextLevels[root.draggingLevelIndex] = item;
                root.setPriceLevels(nextLevels);
                root.updateHover(mouse.x, mouse.y);
                return;
            }

            if (root.dragging && g) {
                var all = root.validCandles();
                var total = all.length;

                if (root.isShiftDrag && total > 8) {
                    // Shift+Drag = Zoom
                    var deltaX = mouse.x - root.dragStartX;
                    var countDelta = Math.round(deltaX * 0.25);
                    var nextCount = Math.max(8, Math.min(total, root.dragStartViewCount - countDelta));
                    var isAtLatestBar = (root.dragStartViewStart + root.dragStartViewCount >= total - 1) || root.dragStartRatio >= 0.85;
                    var nextStart = isAtLatestBar ? Math.max(0, total - nextCount) : Math.max(0, Math.min(total - nextCount, Math.round(root.dragStartCenterIndex - nextCount * root.dragStartRatio)));

                    root.viewCount = nextCount >= total ? -1 : nextCount;
                    root.viewStart = nextCount >= total ? 0 : nextStart;
                    root.followLatest = (nextCount >= total) || (nextStart >= Math.max(0, total - nextCount));
                    root.refreshGeometry();
                    root.zoomChangedManually(root.viewCount);
                } else if (g.totalCandles > g.vCount) {
                    // Normal Drag = PAN (Move left/right through time)
                    var deltaX = mouse.x - root.dragStartX;
                    var shiftBars = Math.round(deltaX / Math.max(1, g.slotW));
                    var maxStart = Math.max(0, g.totalCandles - g.vCount);
                    var nextStart = Math.max(0, Math.min(maxStart, root.dragStartViewStart - shiftBars));

                    if (nextStart !== root.viewStart || root.followLatest !== (nextStart >= maxStart)) {
                        root.viewStart = nextStart;
                        root.followLatest = (nextStart >= maxStart);
                        root.refreshGeometry();
                    }
                }
            } else {
                var hoverHit = root.hitTestLevel(mouse.x, mouse.y);
                var nextHoverIdx = hoverHit ? hoverHit.index : -1;
                var nextHoverPart = hoverHit ? hoverHit.part : "";
                if (nextHoverIdx !== root.hoveredLevelIndex || nextHoverPart !== root.hoveredLevelPart) {
                    root.hoveredLevelIndex = nextHoverIdx;
                    root.hoveredLevelPart = nextHoverPart;
                    canvas.requestPaint();
                }
            }
            root.updateHover(mouse.x, mouse.y);
        }

        onReleased: function (mouse) {
            if (root.draggingLevelIndex >= 0) {
                var releasedIdx = root.draggingLevelIndex;
                var wasMoved = root.levelDragMoved;
                root.draggingLevelIndex = -1;
                root.levelDragMode = "";
                root.levelDragMoved = false;
                if (!wasMoved)
                    root.startLevelEdit(releasedIdx);
                else
                    canvas.requestPaint();
                return;
            }
            root.dragging = false;
            root.isShiftDrag = false;
        }

        onCanceled: {
            root.draggingLevelIndex = -1;
            root.levelDragMode = "";
            root.levelDragMoved = false;
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
                    if (nextStart !== root.viewStart || root.followLatest !== (nextStart >= maxStart)) {
                        root.viewStart = nextStart;
                        root.followLatest = (nextStart >= maxStart);
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
                    root.followLatest = (nextStart >= Math.max(0, total - nextCount));
                    root.refreshGeometry();
                    root.zoomChangedManually(root.viewCount);
                } else if (wheel.angleDelta.y < 0) {
                    // Zoom OUT: increase visible bar count, expanding symmetrically or outward from right edge
                    var nextCount = Math.min(total, curCount + deltaBars);
                    var nextStart = isAtLatestBar ? Math.max(0, total - nextCount) : Math.max(0, Math.min(total - nextCount, Math.round(anchorBar - ratio * nextCount)));
                    root.viewCount = nextCount >= total ? -1 : nextCount;
                    root.viewStart = nextCount >= total ? 0 : nextStart;
                    root.followLatest = (nextCount >= total) || (nextStart >= Math.max(0, total - nextCount));
                    root.refreshGeometry();
                    root.zoomChangedManually(root.viewCount);
                }
            }
            wheel.accepted = true;
        }

        onExited: {
            if (root.hoveredLevelIndex !== -1) {
                root.hoveredLevelIndex = -1;
                root.hoveredLevelPart = "";
                canvas.requestPaint();
            }
            if (!root.dragging && root.draggingLevelIndex < 0)
                root.clearHover();
        }
    }

    // Inline Trigger / Target Level Text Editor Overlay
    Rectangle {
        id: levelEditOverlay
        visible: root.editingLevel && root.cachedGeometry !== null
        readonly property var activeLvl: (root.editingLevelIndex >= 0 && root.editingLevelIndex < root.priceLevels.length) ? root.priceLevels[root.editingLevelIndex] : null
        readonly property var activeEp: (activeLvl && root.cachedGeometry) ? root.resolveLevelEndpoints(activeLvl, root.cachedGeometry) : null
        readonly property real lvlY: (activeLvl && root.cachedGeometry) ? root.priceToYVal(activeLvl.price, root.cachedGeometry) : 0
        readonly property real lvlRightX: activeEp ? activeEp.drawX2 : (root.cachedGeometry ? root.cachedGeometry.right : root.width)
        readonly property int minX: root.cachedGeometry ? (root.cachedGeometry.left + Style.space(4)) : root.pad
        readonly property int maxX: Math.max(minX, (root.cachedGeometry ? root.cachedGeometry.right : (root.width - root.pad)) - width - Style.space(4))
        x: Math.max(minX, Math.min(maxX, Math.round(lvlRightX - width)))
        y: {
            if (!root.cachedGeometry)
                return root.pad;
            var aboveY = Math.round(lvlY - height - Style.space(4));
            return aboveY >= root.cachedGeometry.top ? aboveY : Math.round(lvlY + Style.space(4));
        }
        width: Math.min(Math.max(Style.space(160), levelEditRow.implicitWidth + Style.space(14)), Math.max(Style.space(120), (root.cachedGeometry ? root.cachedGeometry.innerW : root.width) - Style.space(8)))
        height: Style.space(22)
        radius: Style.space(3)
        color: Color.popups.background
        border.width: 1
        border.color: activeLvl ? root.levelToneColor(activeLvl.tone) : Color.foreground
        z: 35

        Row {
            id: levelEditRow
            anchors.left: parent.left
            anchors.leftMargin: Style.space(6)
            anchors.right: parent.right
            anchors.rightMargin: Style.space(6)
            anchors.verticalCenter: parent.verticalCenter
            spacing: Style.space(6)

            Rectangle {
                id: toneDot
                width: Style.space(7)
                height: Style.space(7)
                radius: width / 2
                anchors.verticalCenter: parent.verticalCenter
                color: levelEditOverlay.activeLvl ? root.levelToneColor(levelEditOverlay.activeLvl.tone) : Color.foreground

                MouseArea {
                    anchors.fill: parent
                    anchors.margins: -Style.space(3)
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.cycleEditingLevelTone()
                }
            }

            Item {
                width: Math.max(Style.space(76), Math.min(Style.space(180), levelTextInput.contentWidth + Style.space(12)))
                height: parent.height

                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    visible: levelTextInput.text.length === 0
                    text: "Label (Tab=color)..."
                    color: Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.4)
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                }

                TextInput {
                    id: levelTextInput
                    anchors.fill: parent
                    verticalAlignment: TextInput.AlignVCenter
                    color: levelEditOverlay.activeLvl ? root.levelToneColor(levelEditOverlay.activeLvl.tone) : Color.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                    font.bold: true
                    clip: true
                    selectByMouse: true

                    onTextEdited: {
                        if (root.editingLevelIndex >= 0 && root.editingLevelIndex < root.priceLevels.length) {
                            var next = root.priceLevels.slice();
                            var item = Object.assign({}, next[root.editingLevelIndex]);
                            item.text = text;
                            next[root.editingLevelIndex] = item;
                            root.setPriceLevels(next);
                        }
                    }

                    Keys.onPressed: function (event) {
                        if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
                            root.commitLevelEdit();
                            event.accepted = true;
                        } else if (event.key === Qt.Key_Escape) {
                            root.dismissLevelEdit();
                            event.accepted = true;
                        } else if (event.key === Qt.Key_Tab) {
                            root.cycleEditingLevelTone();
                            event.accepted = true;
                        }
                    }
                }
            }

            Text {
                anchors.verticalCenter: parent.verticalCenter
                textFormat: Text.PlainText
                text: levelEditOverlay.activeLvl ? ("· " + Model.formatPrice(levelEditOverlay.activeLvl.price, root.currency, root.priceHint)) : ""
                color: levelEditOverlay.activeLvl ? root.levelToneColor(levelEditOverlay.activeLvl.tone) : Color.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                font.bold: true
            }
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
