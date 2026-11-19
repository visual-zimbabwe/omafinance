.pragma library

// Process-wide singleton shared across per-monitor Panel.qml instances inside omarchy-shell.
// Ensures only one leader Panel owns the persistent market-stream.js daemon and background
// timers while mirroring live quotes, candles, and stream status to every monitor bar.
var _panels = [];
var _leader = null;

function register(panel) {
    if (!panel)
        return false;
    if (_panels.indexOf(panel) === -1)
        _panels.push(panel);
    if (!_leader) {
        _leader = panel;
    }
    var isLeader = (_leader === panel);
    if (!isLeader && _leader) {
        try {
            if (_leader.quotes)
                panel.quotes = _leader.quotes;
            if (_leader.chartCache)
                panel.chartCache = _leader.chartCache;
            if (_leader.streamFetchedAt)
                panel.streamFetchedAt = _leader.streamFetchedAt;
            panel.streamReady = Boolean(_leader.streamReady);
            panel.streamConnected = Boolean(_leader.streamConnected);
            panel.streamYahooConnected = Boolean(_leader.streamYahooConnected);
            panel.streamCoinbaseConnected = Boolean(_leader.streamCoinbaseConnected);
            panel.streamHyperliquidConnected = Boolean(_leader.streamHyperliquidConnected);
        } catch (e) {}
    }
    return isLeader;
}

function unregister(panel) {
    var idx = _panels.indexOf(panel);
    if (idx !== -1)
        _panels.splice(idx, 1);
    if (_leader === panel) {
        _leader = _panels.length > 0 ? _panels[0] : null;
        if (_leader && typeof _leader.promoteToStreamLeader === "function") {
            try {
                _leader.promoteToStreamLeader();
            } catch (e) {}
        }
    }
}

function leader() {
    return _leader;
}

function isLeader(panel) {
    return _leader === panel;
}

function peers(excludePanel) {
    var out = [];
    for (var i = 0; i < _panels.length; i++) {
        if (_panels[i] && _panels[i] !== excludePanel)
            out.push(_panels[i]);
    }
    return out;
}

function allPanels() {
    return _panels.slice();
}

function broadcastQuotes(sourcePanel, quotesMap, changedSymbols, updatedAt) {
    for (var i = 0; i < _panels.length; i++) {
        var p = _panels[i];
        if (!p || p === sourcePanel)
            continue;
        try {
            p.quotes = quotesMap;
            p.quotesUpdatedAt = updatedAt;
            p.quoteFailureCount = 0;
            p.quoteError = "";
            if (typeof p.applyLiveQuotesToDetailAndCache === "function")
                p.applyLiveQuotesToDetailAndCache(changedSymbols);
            p.quotesUpdated(changedSymbols);
        } catch (e) {}
    }
}

function broadcastCandleKey(sourcePanel, cacheMap, key) {
    for (var i = 0; i < _panels.length; i++) {
        var p = _panels[i];
        if (!p || p === sourcePanel)
            continue;
        try {
            if (p.chartCache !== cacheMap)
                p.chartCache = cacheMap;
            if (sourcePanel && sourcePanel.streamFetchedAt && p.streamFetchedAt !== sourcePanel.streamFetchedAt)
                p.streamFetchedAt = sourcePanel.streamFetchedAt;
            p.candleCacheUpdated(key);
        } catch (e) {}
    }
}

function broadcastSessionBoundary(sourcePanel, sessionState) {
    for (var i = 0; i < _panels.length; i++) {
        var p = _panels[i];
        if (!p || p === sourcePanel)
            continue;
        try {
            if (typeof p.handleSessionBoundary === "function")
                p.handleSessionBoundary(sessionState);
        } catch (e) {}
    }
}

function broadcastStreamStatus(sourcePanel, ready, connected, yahoo, coinbase, hl) {
    for (var i = 0; i < _panels.length; i++) {
        var p = _panels[i];
        if (!p || p === sourcePanel)
            continue;
        try {
            p.streamReady = Boolean(ready);
            p.streamConnected = Boolean(connected);
            p.streamYahooConnected = Boolean(yahoo);
            p.streamCoinbaseConnected = Boolean(coinbase);
            p.streamHyperliquidConnected = Boolean(hl);
        } catch (e) {}
    }
}
