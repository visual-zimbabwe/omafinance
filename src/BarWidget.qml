import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model

BarWidget {
    id: root
    moduleName: "mohamedmansour.finance"

    readonly property color barBg: (bar && bar.background) ? bar.background : Color.background
    readonly property color upColor: Model.accessibleSemanticColor("up", barBg)
    readonly property color downColor: Model.accessibleSemanticColor("down", barBg)
    readonly property string labelTone: panelLoader.item ? String(panelLoader.item.labelTone || "flat") : "flat"
    readonly property color pillColor: labelTone === "up" ? upColor : (labelTone === "down" ? downColor : (bar ? bar.barForeground : Color.foreground))

    function injectPanel() {
        var target = panelLoader.item;
        if (!target)
            return;
        if ("bar" in target)
            target.bar = root.bar;
        if ("settings" in target)
            target.settings = root.settings;
        if ("anchorItem" in target)
            target.anchorItem = button;
        if ("hostWidget" in target)
            target.hostWidget = root;
    }

    function refresh() {
        if (panelLoader.item && panelLoader.item.refresh)
            panelLoader.item.refresh();
    }

    function togglePanel() {
        if (panelLoader.item && panelLoader.item.toggle)
            panelLoader.item.toggle();
    }

    readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false

    function open() {
        if (panelLoader.item && panelLoader.item.openFromHotkey)
            panelLoader.item.openFromHotkey();
    }

    function close() {
        if (panelLoader.item && panelLoader.item.close)
            panelLoader.item.close();
    }

    readonly property bool popoutSwitchClosing: panelLoader.item ? panelLoader.item.popoutSwitchClosing === true : false

    function closeForPopoutSwitch() {
        if (panelLoader.item)
            panelLoader.item.closeForPopoutSwitch();
    }

    readonly property bool alertsMuted: panelLoader.item ? panelLoader.item.alertsMuted === true : false
    readonly property real openPanelIndicatorWidth: statusLabel.implicitWidth

    implicitWidth: button.implicitWidth
    implicitHeight: button.implicitHeight

    onBarChanged: injectPanel()
    onSettingsChanged: injectPanel()

    Loader {
        id: panelLoader
        active: true
        source: Qt.resolvedUrl("Panel.qml")
        visible: false
        onLoaded: {
            root.injectPanel();
            Qt.callLater(root.injectPanel);
        }
    }

    WidgetButton {
        id: button
        anchors.fill: parent
        bar: root.bar
        text: {
            if (!panelLoader.item)
                return "-";
            var base = root.vertical ? panelLoader.item.verticalLabel : panelLoader.item.label;
            // Bell-slash prefix while alerts are muted
            return root.alertsMuted ? ("\uf1f6 " + base) : base;
        }
        labelVisible: false
        hasVisualContent: button.text !== ""
        fixedWidth: root.vertical ? -1 : statusLabel.implicitWidth + button.scaledHorizontalMargin * 2
        foreground: root.pillColor
        useActiveColor: false
        tooltipText: root.alertsMuted && panelLoader.item ? (panelLoader.item.alertsMuteStatus + " · right-click to unmute") : ""
        horizontalMargin: 8.75
        verticalPadding: 8.75
        Accessible.role: Accessible.Button
        Accessible.name: panelLoader.item ? qsTr("Omafinance: %1").arg(button.text) : qsTr("Omafinance")

        Text {
            id: statusLabel
            anchors.centerIn: parent
            text: button.text
            color: button.foreground
            font.family: button.fontFamily
            font.pixelSize: button.fontSize
            font.bold: true
            renderType: Text.NativeRendering
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter

            Behavior on color {
                enabled: !root.bar || root.bar.foregroundAnimationEnabled
                ColorAnimation {
                    duration: 160
                }
            }
        }

        onPressed: function (b) {
            if (!root.bar)
                return;
            if (b === Qt.MiddleButton)
                root.refresh();
            else if (b === Qt.RightButton && panelLoader.item && panelLoader.item.toggleAlertsMute)
                panelLoader.item.toggleAlertsMute();
            else
                root.togglePanel();
        }
    }
}
