import QtQuick
import QtQuick.Controls as QQC
import Quickshell
import qs.Commons
import qs.Ui
import "Model.js" as Model

FloatingWindow {
    id: root

    property var alertItems: []
    property var alertSources: ["@MARKET"]
    property var scannerStatus: ({
            hydrating: false,
            totalSymbols: 0,
            hydratedSymbols: 0,
            sources: [],
            resolvedBaskets: ({})
        })
    property bool alertsMuted: false
    property string alertsMuteStatus: ""
    property bool alertsAutoOpen: true

    property string tfFilter: "ALL"
    property bool inForceOnly: false
    property string searchQuery: ""
    property var sortSpecs: [
        {
            key: "inForce",
            asc: false,
            locked: false
        }
    ]
    property var collapsedGroups: ({})
    property double clockNowMs: Date.now()
    property string hoveredRowId: ""
    property var hoveredRowItem: null
    property real hoveredRowY: 0

    onVisibleChanged: {
        if (!visible)
            root.clearRowHover("");
    }

    signal openGridRequested(string symbol)
    signal alertSourcesChangedRequested(var nextSources)
    signal alertsAutoOpenToggled(bool enabled)
    signal alertsMuteModeRequested(string mode)
    signal refreshRequested

    title: "Omafinance Alerts"
    color: Color.background
    implicitWidth: Style.space(660)
    implicitHeight: Style.space(760)
    minimumSize: Qt.size(Style.space(500), Style.space(420))

    readonly property color foreground: Color.foreground
    readonly property color dim: Model.accessibleDimColor(foreground, Color.background)
    readonly property color upColor: Model.accessibleSemanticColor("up", Color.background)
    readonly property color downColor: Model.accessibleSemanticColor("down", Color.background)
    readonly property color warnColor: Model.accessibleSemanticColor("warning", Color.background)
    readonly property string fontFamily: Style.font.family
    readonly property bool isLightBg: Model.isLightColor(Color.background)

    readonly property int tfColW: Style.space(48)
    readonly property int inForceColW: Style.space(76)
    readonly property var quickSources: ["@MARKET", "SMH", "XLK", "@ENERGY"]
    readonly property var scenarioTfs: ["30", "60", "1D", "1W", "1M"]

    readonly property var lockedSortSpecs: {
        var list = root.sortSpecs || [];
        var out = [];
        for (var i = 0; i < list.length; i++) {
            if (list[i] && list[i].locked === true)
                out.push(list[i]);
        }
        return out;
    }

    readonly property bool hasLockedSort: lockedSortSpecs.length > 0

    readonly property var activeUnlockedSpec: {
        var list = root.sortSpecs || [];
        for (var i = list.length - 1; i >= 0; i--) {
            if (list[i] && list[i].locked !== true)
                return list[i];
        }
        return null;
    }

    readonly property bool isDefaultSort: {
        var list = root.sortSpecs || [];
        return list.length === 1 && list[0].key === "inForce" && list[0].asc === false && list[0].locked !== true;
    }

    readonly property var customSources: {
        var list = root.alertSources || [];
        var out = [];
        for (var i = 0; i < list.length; i++) {
            if (root.quickSources.indexOf(list[i]) === -1)
                out.push(list[i]);
        }
        return out;
    }

    readonly property var groupedData: Model.buildGroupedAlertWatchlist(root.alertItems || [], {
            tfFilter: root.tfFilter,
            inForceOnly: root.inForceOnly,
            searchQuery: root.searchQuery,
            collapsed: root.collapsedGroups,
            sourceOrder: root.alertSources || [],
            sortSpecs: root.sortSpecs
        })

    readonly property bool allCollapsed: {
        var ids = root.groupedData.groupIds || [];
        if (ids.length === 0)
            return false;
        for (var i = 0; i < ids.length; i++) {
            if (root.collapsedGroups[ids[i]] !== true)
                return false;
        }
        return true;
    }

    function hasSource(tok) {
        var list = root.alertSources || [];
        return list.indexOf(tok) !== -1;
    }

    function toggleSource(tok) {
        var list = (root.alertSources || []).slice();
        var idx = list.indexOf(tok);
        if (idx !== -1)
            list.splice(idx, 1);
        else
            list.push(tok);
        root.alertSourcesChangedRequested(Model.normalizeAlertSources(list));
    }

    function addCustomSource(rawText) {
        var trimmed = String(rawText || "").trim();
        if (!trimmed)
            return;
        var parts = trimmed.split(",");
        var list = (root.alertSources || []).slice();
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i].trim();
            if (p)
                list.push(p);
        }
        var normalized = Model.normalizeAlertSources(list);
        root.alertSourcesChangedRequested(normalized);
        addSourceBox.clearText();
    }

    function toggleGroupCollapsed(groupId) {
        if (!groupId)
            return;
        var next = Object.assign({}, root.collapsedGroups || ({}));
        if (next[groupId] === true)
            delete next[groupId];
        else
            next[groupId] = true;
        root.collapsedGroups = next;
    }

    function toggleAllGroups() {
        var ids = root.groupedData.groupIds || [];
        if (ids.length === 0)
            return;
        if (root.allCollapsed) {
            root.collapsedGroups = ({});
            return;
        }
        var next = ({});
        for (var i = 0; i < ids.length; i++) {
            next[ids[i]] = true;
        }
        root.collapsedGroups = next;
    }

    function sourceTooltip(src) {
        var map = (root.scannerStatus && root.scannerStatus.resolvedBaskets) ? root.scannerStatus.resolvedBaskets : ({});
        var meta = map[src];
        if (!meta)
            return "Toggle " + src + " setup alerts";
        if (meta.capped)
            return src + ": tracking top " + meta.count + " of " + meta.total + " holdings (capped)";
        return src + ": tracking " + meta.count + (meta.count === 1 ? " ticker" : " tickers");
    }

    function scenarioColor(tone) {
        if (tone === "up")
            return root.upColor;
        if (tone === "down")
            return root.downColor;
        return root.dim;
    }

    function formatShortTime(ms) {
        if (!ms || !isFinite(ms) || ms <= 0)
            return "";
        var d = new Date(Number(ms));
        var hh = d.getHours();
        var mm = d.getMinutes();
        var ss = d.getSeconds();
        function pad(v) {
            return v < 10 ? "0" + v : String(v);
        }
        return pad(hh) + ":" + pad(mm) + ":" + pad(ss);
    }

    function isFreshItem(item) {
        if (!item || !isFinite(item.triggeredAt) || item.triggeredAt <= 0)
            return false;
        return (root.clockNowMs - Number(item.triggeredAt)) < 120000;
    }

    function clearRowHover(rowId) {
        if (!rowId || root.hoveredRowId === rowId) {
            root.hoveredRowId = "";
            root.hoveredRowItem = null;
        }
    }

    function sortColumnLabel(key) {
        if (key === "ticker")
            return "TICKER";
        if (key === "inForce")
            return "IN-FORCE";
        return String(key || "");
    }

    function sortSpecInfo(key) {
        var list = root.sortSpecs || [];
        for (var i = 0; i < list.length; i++) {
            if (list[i] && list[i].key === key) {
                return {
                    index: i,
                    priority: i + 1,
                    asc: list[i].asc === true,
                    locked: list[i].locked === true
                };
            }
        }
        return null;
    }

    function sortHeaderSuffix(key) {
        var info = root.sortSpecInfo(key);
        if (!info)
            return "";
        var arrow = info.asc ? "↑" : "↓";
        if (info.locked || root.hasLockedSort)
            return " " + info.priority + arrow;
        return " " + arrow;
    }

    function sortHeaderTooltip(key) {
        var info = root.sortSpecInfo(key);
        if (info && info.locked)
            return "Locked sort #" + info.priority + " · Left-click: flip ↑/↓ · Right-click or Shift+click: unlock";
        return "Left-click: sort/flip ↑/↓ · Right-click or Shift+click: lock sort";
    }

    function toggleSortColumn(key, lockToggle) {
        if (!key)
            return;
        root.clearRowHover("");
        if (lockToggle === true)
            root.sortSpecs = Model.toggleAlertSortLock(root.sortSpecs, key);
        else
            root.sortSpecs = Model.applyAlertSortClick(root.sortSpecs, key);
    }

    function resetSortSpecs() {
        root.clearRowHover("");
        root.sortSpecs = [
            {
                key: "inForce",
                asc: false,
                locked: false
            }
        ];
    }

    function syncHoveredRow() {
        if (!root.visible || !listAreaHover.hovered) {
            root.clearRowHover("");
            return;
        }
        var pt = listAreaHover.point.position;
        var idx = watchlistView.indexAt(pt.x, pt.y + watchlistView.contentY);
        var rows = (root.groupedData && root.groupedData.rows) ? root.groupedData.rows : [];
        if (idx < 0 || idx >= rows.length) {
            root.clearRowHover("");
            return;
        }
        var row = rows[idx];
        if (!row || row.kind !== "row" || !row.item) {
            root.clearRowHover("");
            return;
        }
        var del = watchlistView.itemAtIndex(idx);
        root.hoveredRowId = row.id || "";
        root.hoveredRowItem = row.item;
        root.hoveredRowY = del ? (del.y - watchlistView.contentY + del.height / 2) : pt.y;
    }

    Timer {
        id: freshClockTimer
        interval: 10000
        running: root.visible
        repeat: true
        onTriggered: root.clockNowMs = Date.now()
    }

    Item {
        id: windowContainer
        anchors.fill: parent
        focus: true

        Keys.onPressed: function (event) {
            if (addSourceBox.inputActiveFocus || filterBox.inputActiveFocus)
                return;
            if (event.key === Qt.Key_Escape) {
                if (root.searchQuery !== "") {
                    root.searchQuery = "";
                    filterBox.clearText();
                } else {
                    root.visible = false;
                }
                event.accepted = true;
            } else if (event.key === Qt.Key_Slash) {
                filterBox.focusInput();
                event.accepted = true;
            } else if (event.key === Qt.Key_M && !(event.modifiers & (Qt.ControlModifier | Qt.AltModifier | Qt.MetaModifier))) {
                root.alertsMuteModeRequested(root.alertsMuted ? "" : "open");
                event.accepted = true;
            }
        }

        Column {
            anchors.fill: parent
            spacing: 0

            // Top Toolbar: Status + Auto-Open + Mute + Collapse/Expand
            Item {
                id: topBar
                width: parent.width
                height: Style.space(36)

                MouseArea {
                    anchors.fill: parent
                    z: -1
                    acceptedButtons: Qt.LeftButton
                    cursorShape: Qt.SizeAllCursor
                    onPressed: {
                        if (typeof root.startSystemMove === "function")
                            root.startSystemMove();
                    }
                }

                Row {
                    anchors.left: parent.left
                    anchors.leftMargin: Style.space(12)
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: Style.space(8)

                    Rectangle {
                        width: Style.space(7)
                        height: Style.space(7)
                        radius: width / 2
                        anchors.verticalCenter: parent.verticalCenter
                        color: root.alertsMuted ? Color.urgent : ((root.scannerStatus && root.scannerStatus.totalSymbols > 0) ? root.upColor : root.dim)
                    }

                    Text {
                        textFormat: Text.PlainText
                        text: "SETUP ALERTS (" + root.groupedData.totalCount + ")"
                        color: root.foreground
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.body
                        font.bold: true
                        anchors.verticalCenter: parent.verticalCenter
                    }

                    FinanceLoader {
                        active: Boolean(root.scannerStatus && root.scannerStatus.hydrating)
                        color: root.dim
                        spinnerSize: Style.font.bodySmall
                        anchors.verticalCenter: parent.verticalCenter
                    }

                    Text {
                        textFormat: Text.PlainText
                        text: {
                            var st = root.scannerStatus || ({});
                            var tot = st.totalSymbols || 0;
                            var hyd = st.hydratedSymbols || 0;
                            if (tot === 0)
                                return "0 TRACKED";
                            if (st.hydrating)
                                return hyd + "/" + tot + " SCANNING";
                            return tot + " LIVE";
                        }
                        color: root.dim
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.caption
                        font.bold: true
                        anchors.verticalCenter: parent.verticalCenter
                    }
                }

                Row {
                    anchors.right: parent.right
                    anchors.rightMargin: Style.space(10)
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: Style.space(6)

                    FinanceChipButton {
                        iconText: "\uf021"
                        bordered: true
                        foreground: root.foreground
                        dimColor: root.dim
                        fontFamily: root.fontFamily
                        fontSize: Style.font.caption
                        tooltipText: "Re-scan tracked sources now"
                        anchors.verticalCenter: parent.verticalCenter
                        onClicked: root.refreshRequested()
                    }

                    FinanceChipButton {
                        text: "AUTO-OPEN " + (root.alertsAutoOpen ? "[ON]" : "[OFF]")
                        checked: root.alertsAutoOpen
                        bordered: true
                        foreground: root.foreground
                        dimColor: root.dim
                        fontFamily: root.fontFamily
                        fontSize: Style.font.caption
                        tooltipText: "Auto-open this window when a live setup triggers"
                        anchors.verticalCenter: parent.verticalCenter
                        onClicked: root.alertsAutoOpenToggled(!root.alertsAutoOpen)
                    }

                    FinanceChipButton {
                        id: muteMenuBtn
                        text: "ALERTS " + (root.alertsMuted ? "[MUTED] ▾" : "[ON] ▾")
                        checked: true
                        bordered: true
                        foreground: root.alertsMuted ? Color.urgent : root.foreground
                        dimColor: root.dim
                        accentColor: root.alertsMuted ? Color.urgent : Color.accent
                        fontFamily: root.fontFamily
                        fontSize: Style.font.caption
                        tooltipText: root.alertsMuted ? root.alertsMuteStatus : "Configure alert mute"
                        anchors.verticalCenter: parent.verticalCenter
                        onClicked: {
                            if (mutePopup.visible)
                                mutePopup.close();
                            else
                                mutePopup.open();
                        }

                        QQC.Popup {
                            id: mutePopup
                            parent: muteMenuBtn
                            x: Math.min(0, muteMenuBtn.width - width)
                            y: muteMenuBtn.height + Style.space(4)
                            padding: Style.space(6)
                            closePolicy: QQC.Popup.CloseOnEscape | QQC.Popup.CloseOnPressOutsideParent

                            background: FinanceSurface {
                                elevation: 3
                                radiusToken: "md"
                                foregroundColor: root.foreground
                                surfaceColor: (Color.popups && Color.popups.background) ? Color.popups.background : Color.background
                            }

                            contentItem: Column {
                                spacing: Style.space(4)

                                Text {
                                    visible: root.alertsMuted && root.alertsMuteStatus !== ""
                                    text: root.alertsMuteStatus
                                    color: Color.urgent
                                    font.family: root.fontFamily
                                    font.pixelSize: Style.font.caption
                                    font.bold: true
                                    leftPadding: Style.space(4)
                                    bottomPadding: Style.space(2)
                                }

                                Repeater {
                                    model: root.alertsMuted ? [
                                        {
                                            mode: "",
                                            label: "Unmute alerts"
                                        }
                                    ] : [
                                        {
                                            mode: "open",
                                            label: "Mute until market open"
                                        },
                                        {
                                            mode: "1h",
                                            label: "Mute 1 hour"
                                        },
                                        {
                                            mode: "indefinite",
                                            label: "Mute until I unmute"
                                        }
                                    ]

                                    FinanceChipButton {
                                        required property var modelData
                                        width: Style.space(164)
                                        bordered: true
                                        text: modelData.label
                                        foreground: root.foreground
                                        dimColor: root.dim
                                        fontFamily: root.fontFamily
                                        fontSize: Style.font.caption
                                        onClicked: {
                                            root.alertsMuteModeRequested(modelData.mode);
                                            mutePopup.close();
                                        }
                                    }
                                }
                            }
                        }
                    }

                    FinanceChipButton {
                        text: root.allCollapsed ? "⊞" : "⊟"
                        bordered: true
                        foreground: root.foreground
                        dimColor: root.dim
                        fontFamily: root.fontFamily
                        fontSize: Style.font.caption
                        tooltipText: root.allCollapsed ? "Expand all groups" : "Collapse all groups"
                        anchors.verticalCenter: parent.verticalCenter
                        onClicked: root.toggleAllGroups()
                    }
                }
            }

            // Row 2: Tracked Sources Bar (@MARKET, SMH, XLK, @ENERGY + custom)
            Item {
                id: sourcesBar
                width: parent.width
                height: Math.max(Style.space(32), sourcesFlow.implicitHeight + Style.space(8))

                Flow {
                    id: sourcesFlow
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.leftMargin: Style.space(12)
                    anchors.rightMargin: Style.space(10)
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: Style.space(5)

                    Text {
                        textFormat: Text.PlainText
                        text: "TRACK:"
                        color: root.dim
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.caption
                        font.bold: true
                        height: Style.space(22)
                        verticalAlignment: Text.AlignVCenter
                    }

                    Repeater {
                        model: root.quickSources

                        FinanceChipButton {
                            required property string modelData
                            readonly property bool activeSrc: root.hasSource(modelData)
                            text: activeSrc ? (modelData + " ✓") : modelData
                            checked: activeSrc
                            bordered: true
                            foreground: root.foreground
                            dimColor: root.dim
                            fontFamily: root.fontFamily
                            fontSize: Style.font.caption
                            horizontalPadding: Style.space(7)
                            verticalPadding: Style.space(2)
                            tooltipText: root.sourceTooltip(modelData)
                            onClicked: root.toggleSource(modelData)
                        }
                    }

                    Repeater {
                        model: root.customSources

                        FinanceChipButton {
                            required property string modelData
                            text: modelData + " ×"
                            checked: true
                            bordered: true
                            foreground: root.foreground
                            dimColor: root.dim
                            fontFamily: root.fontFamily
                            fontSize: Style.font.caption
                            horizontalPadding: Style.space(7)
                            verticalPadding: Style.space(2)
                            tooltipText: root.sourceTooltip(modelData) + " · click to remove"
                            onClicked: root.toggleSource(modelData)
                        }
                    }

                    FinanceInputBox {
                        id: addSourceBox
                        width: Style.space(132)
                        height: Style.space(22)
                        placeholderText: "+ @set / ETF..."
                        uppercase: true
                        commitOnBlur: false
                        foregroundColor: root.foreground
                        dimColor: root.dim
                        fontFamily: root.fontFamily
                        fontPixelSize: Style.font.caption
                        onCommitted: function (txt) {
                            root.addCustomSource(txt);
                        }
                        onUnfocusRequested: windowContainer.forceActiveFocus()
                    }
                }
            }

            // Row 3: View Filter Bar (TF pills, IF ONLY, Search)
            Item {
                id: filterBar
                width: parent.width
                height: Style.space(30)

                Row {
                    anchors.left: parent.left
                    anchors.leftMargin: Style.space(12)
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: Style.space(4)

                    Repeater {
                        model: ["ALL", "30", "60", "1D", "1W", "1M"]

                        FinanceChipButton {
                            required property string modelData
                            text: modelData === "30" ? "30m" : (modelData === "60" ? "60m" : modelData)
                            checked: root.tfFilter === modelData
                            bordered: true
                            foreground: root.foreground
                            dimColor: root.dim
                            fontFamily: root.fontFamily
                            fontSize: Style.font.caption
                            horizontalPadding: Style.space(6)
                            verticalPadding: Style.space(2)
                            onClicked: root.tfFilter = modelData
                        }
                    }

                    Rectangle {
                        width: 1
                        height: Style.space(14)
                        anchors.verticalCenter: parent.verticalCenter
                        color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.14)
                    }

                    FinanceChipButton {
                        text: "IF ONLY (" + root.groupedData.inForceCount + ")"
                        checked: root.inForceOnly
                        bordered: true
                        foreground: root.foreground
                        dimColor: root.dim
                        accentColor: root.upColor
                        fontFamily: root.fontFamily
                        fontSize: Style.font.caption
                        horizontalPadding: Style.space(6)
                        verticalPadding: Style.space(2)
                        tooltipText: "Show only setups currently holding beyond trigger (In-Force)"
                        onClicked: root.inForceOnly = !root.inForceOnly
                    }
                }

                FinanceInputBox {
                    id: filterBox
                    anchors.right: parent.right
                    anchors.rightMargin: Style.space(10)
                    anchors.verticalCenter: parent.verticalCenter
                    width: Style.space(148)
                    height: Style.space(22)
                    value: root.searchQuery
                    placeholderText: "Filter ticker (/)"
                    clearable: true
                    uppercase: true
                    liveDebounceMs: 60
                    commitOnBlur: false
                    foregroundColor: root.foreground
                    dimColor: root.dim
                    fontFamily: root.fontFamily
                    fontPixelSize: Style.font.caption
                    onLiveDebounced: function (txt) {
                        root.searchQuery = txt;
                    }
                    onCommitted: function (txt) {
                        root.searchQuery = txt;
                    }
                    onCleared: root.searchQuery = ""
                    onUnfocusRequested: windowContainer.forceActiveFocus()
                }
            }

            // Row 4: Chained Sort Lock Strip (lock a sort column, then sub-sort by another column)
            Item {
                id: sortBar
                width: parent.width
                height: Math.max(Style.space(26), sortFlow.implicitHeight + Style.space(6))

                Flow {
                    id: sortFlow
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.leftMargin: Style.space(12)
                    anchors.rightMargin: Style.space(10)
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: Style.space(5)

                    Text {
                        textFormat: Text.PlainText
                        text: "SORT:"
                        color: root.dim
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.caption
                        font.bold: true
                        height: Style.space(20)
                        verticalAlignment: Text.AlignVCenter
                    }

                    Repeater {
                        model: root.lockedSortSpecs

                        Row {
                            required property var modelData
                            required property int index
                            spacing: Style.space(4)

                            Text {
                                visible: parent.index > 0
                                textFormat: Text.PlainText
                                text: "›"
                                color: root.dim
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.caption
                                anchors.verticalCenter: parent.verticalCenter
                            }

                            FinanceChipButton {
                                iconText: "\uf023"
                                text: (parent.index + 1) + ". " + root.sortColumnLabel(parent.modelData.key) + (parent.modelData.asc ? " ↑" : " ↓") + " ×"
                                checked: true
                                bordered: true
                                foreground: root.foreground
                                dimColor: root.dim
                                accentColor: Color.accent
                                fontFamily: root.fontFamily
                                fontSize: Style.font.caption
                                horizontalPadding: Style.space(6)
                                verticalPadding: Style.space(1)
                                tooltipText: "Locked sort #" + (parent.index + 1) + " · Click to unlock · Left-click column header to flip ↑/↓"
                                onClicked: root.toggleSortColumn(parent.modelData.key, true)
                            }
                        }
                    }

                    Text {
                        visible: root.hasLockedSort && root.activeUnlockedSpec !== null
                        textFormat: Text.PlainText
                        text: "›"
                        color: root.dim
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.caption
                        height: Style.space(20)
                        verticalAlignment: Text.AlignVCenter
                    }

                    FinanceChipButton {
                        visible: root.activeUnlockedSpec !== null
                        text: root.activeUnlockedSpec ? ((root.hasLockedSort ? ((root.lockedSortSpecs.length + 1) + ". ") : "") + root.sortColumnLabel(root.activeUnlockedSpec.key) + (root.activeUnlockedSpec.asc ? " ↑" : " ↓")) : ""
                        checked: false
                        bordered: true
                        foreground: root.foreground
                        dimColor: root.dim
                        fontFamily: root.fontFamily
                        fontSize: Style.font.caption
                        horizontalPadding: Style.space(6)
                        verticalPadding: Style.space(1)
                        tooltipText: "Active sort · Click to flip ↑/↓"
                        onClicked: {
                            if (root.activeUnlockedSpec)
                                root.toggleSortColumn(root.activeUnlockedSpec.key, false);
                        }
                    }

                    FinanceChipButton {
                        id: lockActiveSortBtn
                        visible: root.activeUnlockedSpec !== null
                        iconText: "\uf023"
                        text: "LOCK"
                        checked: false
                        bordered: true
                        foreground: root.foreground
                        dimColor: root.dim
                        accentColor: Color.accent
                        fontFamily: root.fontFamily
                        fontSize: Style.font.caption
                        horizontalPadding: Style.space(6)
                        verticalPadding: Style.space(1)
                        tooltipText: "Lock this sort column so clicking another column sub-sorts within it"
                        onClicked: {
                            if (root.activeUnlockedSpec)
                                root.toggleSortColumn(root.activeUnlockedSpec.key, true);
                        }
                    }

                    Text {
                        visible: root.activeUnlockedSpec === null
                        textFormat: Text.PlainText
                        text: "+ click another column to sub-sort"
                        color: root.dim
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.caption
                        height: Style.space(20)
                        verticalAlignment: Text.AlignVCenter
                    }

                    FinanceChipButton {
                        visible: !root.isDefaultSort
                        text: "RESET"
                        checked: false
                        bordered: true
                        foreground: root.dim
                        dimColor: root.dim
                        fontFamily: root.fontFamily
                        fontSize: Style.font.caption
                        horizontalPadding: Style.space(6)
                        verticalPadding: Style.space(1)
                        tooltipText: "Clear all sort locks and reset to default In-Force order"
                        onClicked: root.resetSortSpecs()
                    }
                }
            }

            Rectangle {
                width: parent.width
                height: 1
                color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.14)
            }

            // Sticky Thinkorswim Watchlist Column Header (Clickable & Lockable Sort Columns)
            Rectangle {
                id: columnHeader
                width: parent.width
                height: Style.space(24)
                color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.05)

                Item {
                    id: tickerHeaderCell
                    anchors.left: parent.left
                    anchors.right: headerColsRow.left
                    height: parent.height
                    readonly property var sortInfo: root.sortSpecInfo("ticker")
                    QQC.ToolTip.visible: tickerSortHover.containsMouse
                    QQC.ToolTip.delay: 500
                    QQC.ToolTip.text: root.sortHeaderTooltip("ticker")

                    Rectangle {
                        anchors.fill: parent
                        color: (tickerHeaderCell.sortInfo && tickerHeaderCell.sortInfo.locked) ? Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, tickerSortHover.containsMouse ? 0.16 : 0.09) : (tickerSortHover.containsMouse ? Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.06) : "transparent")
                    }

                    Rectangle {
                        visible: tickerHeaderCell.sortInfo !== null
                        anchors.bottom: parent.bottom
                        width: parent.width
                        height: Style.space(2)
                        color: (tickerHeaderCell.sortInfo && tickerHeaderCell.sortInfo.locked) ? Color.accent : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.35)
                    }

                    Text {
                        anchors.left: parent.left
                        anchors.leftMargin: Style.space(12)
                        anchors.verticalCenter: parent.verticalCenter
                        textFormat: Text.PlainText
                        text: "TICKER" + root.sortHeaderSuffix("ticker")
                        color: (tickerHeaderCell.sortInfo && tickerHeaderCell.sortInfo.locked) ? Color.accent : ((tickerHeaderCell.sortInfo || tickerSortHover.containsMouse) ? root.foreground : root.dim)
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.caption
                        font.bold: true
                        font.letterSpacing: 0.6
                    }

                    MouseArea {
                        id: tickerSortHover
                        anchors.fill: parent
                        acceptedButtons: Qt.LeftButton | Qt.RightButton
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onEntered: root.clearRowHover("")
                        onClicked: function (mouse) {
                            var isLock = (mouse.button === Qt.RightButton) || Boolean(mouse.modifiers & Qt.ShiftModifier);
                            root.toggleSortColumn("ticker", isLock);
                        }
                    }
                }

                Row {
                    id: headerColsRow
                    anchors.right: parent.right
                    anchors.rightMargin: Style.space(10)
                    height: parent.height
                    spacing: 0

                    Item {
                        id: inForceHeaderCell
                        width: root.inForceColW
                        height: parent.height
                        readonly property var sortInfo: root.sortSpecInfo("inForce")
                        QQC.ToolTip.visible: inForceSortHover.containsMouse
                        QQC.ToolTip.delay: 500
                        QQC.ToolTip.text: root.sortHeaderTooltip("inForce")

                        Rectangle {
                            anchors.fill: parent
                            color: (inForceHeaderCell.sortInfo && inForceHeaderCell.sortInfo.locked) ? Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, inForceSortHover.containsMouse ? 0.16 : 0.09) : (inForceSortHover.containsMouse ? Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.06) : "transparent")
                        }

                        Rectangle {
                            visible: inForceHeaderCell.sortInfo !== null
                            anchors.bottom: parent.bottom
                            width: parent.width
                            height: Style.space(2)
                            color: (inForceHeaderCell.sortInfo && inForceHeaderCell.sortInfo.locked) ? Color.accent : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.35)
                        }

                        Text {
                            anchors.centerIn: parent
                            textFormat: Text.PlainText
                            text: "IN-FORCE" + root.sortHeaderSuffix("inForce")
                            color: (inForceHeaderCell.sortInfo && inForceHeaderCell.sortInfo.locked) ? Color.accent : ((inForceHeaderCell.sortInfo || inForceSortHover.containsMouse) ? root.foreground : root.dim)
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                            font.letterSpacing: 0.3
                        }

                        MouseArea {
                            id: inForceSortHover
                            anchors.fill: parent
                            acceptedButtons: Qt.LeftButton | Qt.RightButton
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onEntered: root.clearRowHover("")
                            onClicked: function (mouse) {
                                var isLock = (mouse.button === Qt.RightButton) || Boolean(mouse.modifiers & Qt.ShiftModifier);
                                root.toggleSortColumn("inForce", isLock);
                            }
                        }
                    }

                    Repeater {
                        model: root.scenarioTfs

                        Item {
                            id: tfHeaderCell
                            required property string modelData
                            width: root.tfColW
                            height: parent.height
                            readonly property var sortInfo: root.sortSpecInfo(modelData)
                            QQC.ToolTip.visible: tfSortHover.containsMouse
                            QQC.ToolTip.delay: 500
                            QQC.ToolTip.text: root.sortHeaderTooltip(modelData)

                            Rectangle {
                                anchors.fill: parent
                                color: (tfHeaderCell.sortInfo && tfHeaderCell.sortInfo.locked) ? Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, tfSortHover.containsMouse ? 0.16 : 0.09) : (tfSortHover.containsMouse ? Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.06) : "transparent")
                            }

                            Rectangle {
                                visible: tfHeaderCell.sortInfo !== null
                                anchors.bottom: parent.bottom
                                width: parent.width
                                height: Style.space(2)
                                color: (tfHeaderCell.sortInfo && tfHeaderCell.sortInfo.locked) ? Color.accent : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.35)
                            }

                            Text {
                                anchors.centerIn: parent
                                textFormat: Text.PlainText
                                text: modelData + root.sortHeaderSuffix(modelData)
                                color: (tfHeaderCell.sortInfo && tfHeaderCell.sortInfo.locked) ? Color.accent : ((tfHeaderCell.sortInfo || tfSortHover.containsMouse) ? root.foreground : root.dim)
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.caption
                                font.bold: true
                            }

                            MouseArea {
                                id: tfSortHover
                                anchors.fill: parent
                                acceptedButtons: Qt.LeftButton | Qt.RightButton
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onEntered: root.clearRowHover("")
                                onClicked: function (mouse) {
                                    var isLock = (mouse.button === Qt.RightButton) || Boolean(mouse.modifiers & Qt.ShiftModifier);
                                    root.toggleSortColumn(tfHeaderCell.modelData, isLock);
                                }
                            }
                        }
                    }
                }
            }

            Rectangle {
                width: parent.width
                height: 1
                color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.12)
            }

            // Virtualized Flattened 4-Level Grouped Watchlist
            Item {
                id: listArea
                width: parent.width
                height: parent.height - topBar.height - sourcesBar.height - filterBar.height - sortBar.height - columnHeader.height - 2

                ListView {
                    id: watchlistView
                    anchors.fill: parent
                    model: root.groupedData.rows
                    clip: true
                    boundsBehavior: Flickable.StopAtBounds
                    cacheBuffer: Style.space(200)
                    onContentYChanged: root.clearRowHover("")
                    onModelChanged: {
                        if (!listAreaHover.hovered || !root.groupedData || root.groupedData.rows.length === 0)
                            root.clearRowHover("");
                        else
                            Qt.callLater(root.syncHoveredRow);
                    }

                    delegate: Item {
                        id: nodeDelegate
                        required property var modelData
                        required property int index
                        readonly property string kind: modelData.kind
                        width: ListView.view.width
                        height: {
                            if (kind === "tf")
                                return Style.space(28);
                            if (kind === "direction")
                                return Style.space(25);
                            if (kind === "basket")
                                return Style.space(23);
                            if (kind === "setup")
                                return Style.space(21);
                            return Style.space(27);
                        }

                        // Level 1: Timeframe Group Header
                        Rectangle {
                            visible: nodeDelegate.kind === "tf"
                            anchors.fill: parent
                            color: tfHover.containsMouse ? Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.12) : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.075)

                            Rectangle {
                                width: Style.space(3)
                                height: parent.height
                                anchors.left: parent.left
                                color: nodeDelegate.kind === "tf" ? Model.setupLineColor(nodeDelegate.modelData.tf, "trigger", root.isLightBg) : "transparent"
                            }

                            Row {
                                anchors.left: parent.left
                                anchors.leftMargin: Style.space(10)
                                anchors.verticalCenter: parent.verticalCenter
                                spacing: Style.space(6)

                                Text {
                                    textFormat: Text.PlainText
                                    text: nodeDelegate.modelData.collapsed ? "▸" : "▾"
                                    color: root.dim
                                    font.family: root.fontFamily
                                    font.pixelSize: Style.font.bodySmall
                                }

                                Text {
                                    textFormat: Text.PlainText
                                    text: nodeDelegate.modelData.label || ""
                                    color: nodeDelegate.kind === "tf" ? Model.setupLineColor(nodeDelegate.modelData.tf, "trigger", root.isLightBg) : root.foreground
                                    font.family: root.fontFamily
                                    font.pixelSize: Style.font.bodySmall
                                    font.bold: true
                                }
                            }

                            Text {
                                anchors.right: parent.right
                                anchors.rightMargin: Style.space(12)
                                anchors.verticalCenter: parent.verticalCenter
                                textFormat: Text.PlainText
                                text: "(" + (nodeDelegate.modelData.count || 0) + ")"
                                color: root.dim
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.caption
                                font.bold: true
                            }

                            Rectangle {
                                anchors.bottom: parent.bottom
                                width: parent.width
                                height: 1
                                color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.08)
                            }

                            MouseArea {
                                id: tfHover
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onEntered: root.clearRowHover("")
                                onClicked: root.toggleGroupCollapsed(nodeDelegate.modelData.id)
                            }
                        }

                        // Level 2: Breaking Up / Breaking Down Subheader
                        Rectangle {
                            visible: nodeDelegate.kind === "direction"
                            anchors.fill: parent
                            readonly property color dirColor: nodeDelegate.modelData.isLong ? root.upColor : root.downColor
                            color: dirHover.containsMouse ? Qt.rgba(dirColor.r, dirColor.g, dirColor.b, 0.14) : Qt.rgba(dirColor.r, dirColor.g, dirColor.b, 0.06)

                            Row {
                                anchors.left: parent.left
                                anchors.leftMargin: Style.space(20)
                                anchors.verticalCenter: parent.verticalCenter
                                spacing: Style.space(6)

                                Text {
                                    textFormat: Text.PlainText
                                    text: nodeDelegate.modelData.collapsed ? "▸" : "▾"
                                    color: parent.parent.dirColor
                                    font.family: root.fontFamily
                                    font.pixelSize: Style.font.caption
                                }

                                Text {
                                    textFormat: Text.PlainText
                                    text: (nodeDelegate.modelData.isLong ? "▲ " : "▼ ") + (nodeDelegate.modelData.label || "")
                                    color: parent.parent.dirColor
                                    font.family: root.fontFamily
                                    font.pixelSize: Style.font.bodySmall
                                    font.bold: true
                                    font.letterSpacing: 0.4
                                }
                            }

                            Text {
                                anchors.right: parent.right
                                anchors.rightMargin: Style.space(12)
                                anchors.verticalCenter: parent.verticalCenter
                                textFormat: Text.PlainText
                                text: "(" + (nodeDelegate.modelData.count || 0) + ")"
                                color: root.dim
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.caption
                            }

                            MouseArea {
                                id: dirHover
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onEntered: root.clearRowHover("")
                                onClicked: root.toggleGroupCollapsed(nodeDelegate.modelData.id)
                            }
                        }

                        // Level 3: Basket / Set Subheader
                        Rectangle {
                            visible: nodeDelegate.kind === "basket"
                            anchors.fill: parent
                            color: basketHover.containsMouse ? Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.08) : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.03)

                            Row {
                                anchors.left: parent.left
                                anchors.leftMargin: Style.space(32)
                                anchors.verticalCenter: parent.verticalCenter
                                spacing: Style.space(5)

                                Text {
                                    textFormat: Text.PlainText
                                    text: nodeDelegate.modelData.collapsed ? "▸" : "▾"
                                    color: root.dim
                                    font.family: root.fontFamily
                                    font.pixelSize: Style.font.caption
                                }

                                Text {
                                    textFormat: Text.PlainText
                                    text: nodeDelegate.modelData.label || ""
                                    color: root.foreground
                                    font.family: root.fontFamily
                                    font.pixelSize: Style.font.caption
                                    font.bold: true
                                }
                            }

                            Text {
                                anchors.right: parent.right
                                anchors.rightMargin: Style.space(12)
                                anchors.verticalCenter: parent.verticalCenter
                                textFormat: Text.PlainText
                                text: "(" + (nodeDelegate.modelData.count || 0) + ")"
                                color: root.dim
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.caption
                            }

                            MouseArea {
                                id: basketHover
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onEntered: root.clearRowHover("")
                                onClicked: root.toggleGroupCollapsed(nodeDelegate.modelData.id)
                            }
                        }

                        // Level 4: Setup Group Subheader
                        Rectangle {
                            visible: nodeDelegate.kind === "setup"
                            anchors.fill: parent
                            color: setupHover.containsMouse ? Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.06) : "transparent"

                            Row {
                                anchors.left: parent.left
                                anchors.leftMargin: Style.space(44)
                                anchors.verticalCenter: parent.verticalCenter
                                spacing: Style.space(5)

                                Text {
                                    textFormat: Text.PlainText
                                    text: nodeDelegate.modelData.collapsed ? "▸" : "▾"
                                    color: root.dim
                                    font.family: root.fontFamily
                                    font.pixelSize: Style.font.caption - 1
                                }

                                Text {
                                    textFormat: Text.PlainText
                                    text: nodeDelegate.modelData.label || ""
                                    color: root.dim
                                    font.family: root.fontFamily
                                    font.pixelSize: Style.font.caption
                                    font.bold: true
                                }
                            }

                            Text {
                                anchors.right: parent.right
                                anchors.rightMargin: Style.space(12)
                                anchors.verticalCenter: parent.verticalCenter
                                textFormat: Text.PlainText
                                text: "(" + (nodeDelegate.modelData.count || 0) + ")"
                                color: root.dim
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.caption
                            }

                            MouseArea {
                                id: setupHover
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onEntered: root.clearRowHover("")
                                onClicked: root.toggleGroupCollapsed(nodeDelegate.modelData.id)
                            }
                        }

                        // Leaf: Thinkorswim Watchlist Ticker Row
                        Rectangle {
                            id: tickerRow
                            visible: nodeDelegate.kind === "row"
                            anchors.fill: parent
                            readonly property var item: nodeDelegate.kind === "row" ? nodeDelegate.modelData.item : null
                            readonly property bool fresh: item ? root.isFreshItem(item) : false
                            color: {
                                if (rowHover.containsMouse)
                                    return Style.hoverFillFor(root.foreground, Color.accent);
                                if (fresh)
                                    return item.isLong ? Qt.rgba(root.upColor.r, root.upColor.g, root.upColor.b, 0.09) : Qt.rgba(root.downColor.r, root.downColor.g, root.downColor.b, 0.09);
                                return (nodeDelegate.index % 2 === 1) ? Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.025) : "transparent";
                            }

                            // Fresh-trigger left accent bar (for alerts triggered in last 2 min)
                            Rectangle {
                                visible: tickerRow.fresh
                                width: Style.space(3)
                                height: parent.height
                                anchors.left: parent.left
                                color: (tickerRow.item && tickerRow.item.isLong) ? root.upColor : root.downColor
                            }

                            Text {
                                anchors.left: parent.left
                                anchors.leftMargin: Style.space(54)
                                anchors.right: colsRow.left
                                anchors.rightMargin: Style.space(8)
                                anchors.verticalCenter: parent.verticalCenter
                                textFormat: Text.PlainText
                                text: tickerRow.item ? String(tickerRow.item.symbol || "").toUpperCase() : ""
                                color: root.foreground
                                font.family: root.fontFamily
                                font.pixelSize: Style.font.bodySmall
                                font.bold: true
                                elide: Text.ElideRight
                            }

                            Row {
                                id: colsRow
                                anchors.right: parent.right
                                anchors.rightMargin: Style.space(10)
                                anchors.verticalCenter: parent.verticalCenter
                                spacing: 0

                                // In-Force Column (checkmark if yes, blank if no)
                                Text {
                                    width: root.inForceColW
                                    horizontalAlignment: Text.AlignHCenter
                                    textFormat: Text.PlainText
                                    text: (tickerRow.item && tickerRow.item.inForce) ? "✓" : ""
                                    color: (tickerRow.item && tickerRow.item.isLong) ? root.upColor : root.downColor
                                    font.family: root.fontFamily
                                    font.pixelSize: Style.font.body
                                    font.bold: true
                                }

                                // Separate Timeframe Scenario Columns: 30, 60, 1D, 1W, 1M
                                Repeater {
                                    model: root.scenarioTfs

                                    Item {
                                        required property string modelData
                                        width: root.tfColW
                                        height: Style.space(22)
                                        readonly property var scObj: (tickerRow.item && tickerRow.item.scenarios && tickerRow.item.scenarios[modelData]) ? tickerRow.item.scenarios[modelData] : null
                                        readonly property bool isAlertTf: Boolean(tickerRow.item && tickerRow.item.timeframe === modelData)

                                        Rectangle {
                                            visible: parent.isAlertTf
                                            anchors.centerIn: parent
                                            width: parent.width - Style.space(6)
                                            height: Style.space(18)
                                            radius: Style.space(3)
                                            color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.08)
                                            border.width: 1
                                            border.color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.16)
                                        }

                                        Text {
                                            anchors.centerIn: parent
                                            textFormat: Text.PlainText
                                            text: parent.scObj ? String(parent.scObj.sc || "-").toUpperCase() : "-"
                                            color: parent.scObj ? root.scenarioColor(parent.scObj.colorTone) : root.dim
                                            font.family: root.fontFamily
                                            font.pixelSize: Style.font.bodySmall
                                            font.bold: true
                                        }
                                    }
                                }
                            }

                            Rectangle {
                                anchors.bottom: parent.bottom
                                width: parent.width
                                height: 1
                                color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.04)
                            }

                            MouseArea {
                                id: rowHover
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onEntered: {
                                    if (tickerRow.item) {
                                        root.hoveredRowId = nodeDelegate.modelData.id || "";
                                        root.hoveredRowItem = tickerRow.item;
                                        var pos = mapToItem(listArea, 0, height / 2);
                                        root.hoveredRowY = pos.y;
                                    }
                                }
                                onPositionChanged: {
                                    if (tickerRow.item && containsMouse) {
                                        root.hoveredRowId = nodeDelegate.modelData.id || "";
                                        root.hoveredRowItem = tickerRow.item;
                                        var pos = mapToItem(listArea, 0, height / 2);
                                        root.hoveredRowY = pos.y;
                                    }
                                }
                                onExited: root.clearRowHover(nodeDelegate.modelData ? nodeDelegate.modelData.id : "")
                                onContainsMouseChanged: {
                                    if (!containsMouse)
                                        root.clearRowHover(nodeDelegate.modelData ? nodeDelegate.modelData.id : "");
                                }
                                onClicked: {
                                    root.clearRowHover("");
                                    if (tickerRow.item && tickerRow.item.symbol)
                                        root.openGridRequested(tickerRow.item.symbol);
                                }
                            }
                        }
                    }
                }

                // Empty State Banner
                FinanceStatusBanner {
                    visible: root.groupedData.rows.length === 0
                    anchors.centerIn: parent
                    width: Math.min(Style.space(420), parent.width - Style.space(32))
                    compact: false
                    tone: "info"
                    title: {
                        if (!root.alertSources || root.alertSources.length === 0)
                            return qsTr("No tracked alert sources");
                        if (root.scannerStatus && root.scannerStatus.hydrating)
                            return qsTr("Scanning setup lines…");
                        if (root.tfFilter !== "ALL" || root.inForceOnly || root.searchQuery !== "")
                            return qsTr("No setups match current filters");
                        return qsTr("No triggered setups right now");
                    }
                    text: {
                        if (!root.alertSources || root.alertSources.length === 0)
                            return qsTr("Enable @MARKET, SMH, XLK, @ENERGY, or add any @ preset / ETF basket above.");
                        if (root.scannerStatus && root.scannerStatus.hydrating)
                            return qsTr("Hydrating 30m, 60m, 1D, 1W, and 1M candles in the background.");
                        if (root.tfFilter !== "ALL" || root.inForceOnly || root.searchQuery !== "")
                            return qsTr("Try switching back to ALL timeframes or disabling IF ONLY.");
                        return qsTr("Triggered setups across 30, 60, 1D, 1W, and 1M will appear automatically.");
                    }
                    actionText: {
                        if (!root.alertSources || root.alertSources.length === 0)
                            return qsTr("Track @MARKET");
                        if (root.tfFilter !== "ALL" || root.inForceOnly || root.searchQuery !== "")
                            return qsTr("Reset filters");
                        return "";
                    }
                    fontFamily: root.fontFamily
                    foreground: root.foreground
                    dimColor: root.dim
                    onActionTriggered: {
                        if (!root.alertSources || root.alertSources.length === 0) {
                            root.alertSourcesChangedRequested(["@MARKET"]);
                        } else {
                            root.tfFilter = "ALL";
                            root.inForceOnly = false;
                            root.searchQuery = "";
                            filterBox.clearText();
                        }
                    }
                }

                // Non-blocking hover tracker covering listArea so leaving the list,
                // moving onto headers/empty space, or live model rebuilds never leave
                // the execution details tooltip stuck on the last hovered ticker.
                Item {
                    id: listHoverOverlay
                    anchors.fill: parent
                    z: 1

                    HoverHandler {
                        id: listAreaHover
                        onHoveredChanged: root.syncHoveredRow()
                        onPointChanged: root.syncHoveredRow()
                    }
                }

                // Floating Execution Details Tooltip on Row Hover
                FinanceSurface {
                    id: rowTooltip
                    visible: root.visible && listAreaHover.hovered && root.hoveredRowItem !== null
                    elevation: 3
                    radiusToken: "md"
                    foregroundColor: root.foreground
                    surfaceColor: (Color.popups && Color.popups.background) ? Color.popups.background : Color.background
                    z: Model.Z_LAYER.TOOLTIP
                    width: tooltipContent.implicitWidth + Style.space(18)
                    height: tooltipContent.implicitHeight + Style.space(12)
                    x: Style.space(52)
                    y: {
                        var above = root.hoveredRowY - height - Style.space(16);
                        if (above >= Style.space(6))
                            return above;
                        return Math.min(listArea.height - height - Style.space(6), root.hoveredRowY + Style.space(18));
                    }

                    Column {
                        id: tooltipContent
                        anchors.centerIn: parent
                        spacing: Style.space(2)

                        Text {
                            textFormat: Text.PlainText
                            text: {
                                var it = root.hoveredRowItem;
                                if (!it)
                                    return "";
                                var dirTxt = it.isLong ? "▲ UP" : "▼ DOWN";
                                var timeTxt = root.formatShortTime(it.triggeredAt);
                                return it.symbol + " · " + (it.timeframeLabel || it.timeframe) + " " + (it.setupCode || it.setupGroup) + " " + dirTxt + (timeTxt ? (" · " + timeTxt) : "");
                            }
                            color: (root.hoveredRowItem && root.hoveredRowItem.isLong) ? root.upColor : root.downColor
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                            font.bold: true
                        }

                        Text {
                            textFormat: Text.PlainText
                            text: {
                                var it = root.hoveredRowItem;
                                if (!it)
                                    return "";
                                var trig = isFinite(it.triggerPrice) ? Model.formatPrice(it.triggerPrice, "USD", 2) : "-";
                                var last = isFinite(it.livePrice) ? Model.formatPrice(it.livePrice, "USD", 2) : "-";
                                var t1 = isFinite(it.t1Price) ? Model.formatPrice(it.t1Price, "USD", 2) : "-";
                                var ifTxt = it.inForce ? "In-Force ✓" : "Pulled back";
                                return "Trig " + trig + "  ·  Last " + last + "  ·  T1 " + t1 + "  ·  " + ifTxt;
                            }
                            color: root.foreground
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption
                        }

                        Text {
                            textFormat: Text.PlainText
                            text: {
                                var it = root.hoveredRowItem;
                                if (!it)
                                    return "";
                                var bTxt = (it.baskets && it.baskets.length > 0) ? it.baskets.join(", ") : "";
                                return (it.setupGroup || "") + (bTxt ? ("  ·  " + bTxt) : "") + "  ·  Click to open Grid";
                            }
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: Style.font.caption - 1
                        }
                    }
                }
            }
        }
    }
}
