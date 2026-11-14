import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model

// Shared inline status banner, transient toast, and centered empty-state card.
FinanceSurface {
    id: root

    // "info" | "success" | "warning" | "error"
    property string tone: "info"
    property string title: ""
    property string text: ""
    property string actionText: ""
    property string secondaryActionText: ""
    property bool compact: true
    property int autoHideMs: 0
    property string fontFamily: Style.font.family
    property color foreground: Color.foreground
    property color dimColor: Model.accessibleDimColor(root.foreground, Color.background)
    property color successColor: Model.accessibleSemanticColor("success", Color.background)
    property color warningColor: Model.accessibleSemanticColor("warning", Color.background)
    property color errorColor: Model.accessibleSemanticColor("error", Color.background)
    property color infoColor: Model.accessibleSemanticColor("info", Color.background)

    signal actionTriggered
    signal secondaryActionTriggered
    signal dismissed

    readonly property color toneColor: {
        if (tone === "success")
            return successColor;
        if (tone === "warning")
            return warningColor;
        if (tone === "error")
            return errorColor;
        return infoColor;
    }

    readonly property string toneIcon: {
        if (tone === "success")
            return "\uf058"; // check-circle
        if (tone === "warning")
            return "\uf071"; // exclamation-triangle
        if (tone === "error")
            return "\uf06a"; // exclamation-circle
        return "\uf05a"; // info-circle
    }

    readonly property bool hasContent: text !== "" || title !== ""

    visible: hasContent
    opacity: hasContent ? 1.0 : 0.0
    elevation: compact ? 0 : 1
    radiusToken: compact ? "md" : "lg"
    sheen: !compact
    foregroundColor: root.foreground
    surfaceColor: tone === "info" && !compact
        ? Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.04)
        : Qt.rgba(toneColor.r, toneColor.g, toneColor.b, 0.10)
    borderColorOverride: Qt.rgba(toneColor.r, toneColor.g, toneColor.b, compact ? 0.35 : 0.25)

    implicitHeight: hasContent ? (compact ? compactRow.implicitHeight + Style.space(12) : emptyCol.implicitHeight + Style.space(28)) : 0

    Accessible.role: Accessible.AlertMessage
    Accessible.name: (title ? title + ". " : "") + text

    Behavior on opacity {
        NumberAnimation {
            duration: Style.duration(150)
        }
    }

    onTextChanged: restartAutoHide()
    onTitleChanged: restartAutoHide()
    onVisibleChanged: restartAutoHide()

    function restartAutoHide() {
        autoHideTimer.stop();
        if (autoHideMs > 0 && hasContent && visible)
            autoHideTimer.start();
    }

    Timer {
        id: autoHideTimer
        interval: Math.max(500, root.autoHideMs)
        repeat: false
        onTriggered: root.dismissed()
    }

    // Compact Inline Banner / Toast Layout
    Row {
        id: compactRow
        visible: root.compact
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        anchors.margins: Style.space(8)
        spacing: Style.space(8)

        Text {
            textFormat: Text.PlainText
            text: root.toneIcon
            color: root.toneColor
            font.family: root.fontFamily
            font.pixelSize: Style.font.bodySmall
            anchors.verticalCenter: parent.verticalCenter
        }

        Text {
            textFormat: Text.PlainText
            text: root.text || root.title
            color: root.tone === "info" ? root.foreground : root.toneColor
            font.family: root.fontFamily
            font.pixelSize: Style.font.bodySmall
            wrapMode: Text.WordWrap
            width: Math.max(Style.space(40), compactRow.width - Style.space(24) - (compactActionBtn.visible ? compactActionBtn.width + Style.space(8) : 0))
            anchors.verticalCenter: parent.verticalCenter
        }

        Button {
            id: compactActionBtn
            visible: root.actionText !== ""
            bordered: true
            text: root.actionText
            foreground: root.foreground
            accent: root.toneColor
            fontFamily: root.fontFamily
            fontSize: Style.font.caption
            horizontalPadding: Style.space(8)
            verticalPadding: Style.space(2)
            anchors.verticalCenter: parent.verticalCenter
            onClicked: root.actionTriggered()
        }
    }

    // Centered Empty-State Card Layout
    Column {
        id: emptyCol
        visible: !root.compact
        anchors.centerIn: parent
        width: parent.width - Style.space(24)
        spacing: Style.space(8)

        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            textFormat: Text.PlainText
            text: root.toneIcon
            color: root.tone === "info" ? root.dimColor : root.toneColor
            font.family: root.fontFamily
            font.pixelSize: Style.font.heading
        }

        Text {
            visible: root.title !== ""
            width: parent.width
            horizontalAlignment: Text.AlignHCenter
            textFormat: Text.PlainText
            text: root.title
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: Style.font.title
            font.bold: true
            wrapMode: Text.WordWrap
        }

        Text {
            visible: root.text !== ""
            width: parent.width
            horizontalAlignment: Text.AlignHCenter
            textFormat: Text.PlainText
            text: root.text
            color: root.dimColor
            font.family: root.fontFamily
            font.pixelSize: Style.font.bodySmall
            wrapMode: Text.WordWrap
            lineHeight: 1.3
        }

        Row {
            visible: root.actionText !== "" || root.secondaryActionText !== ""
            anchors.horizontalCenter: parent.horizontalCenter
            spacing: Style.space(8)
            topPadding: Style.space(4)

            Button {
                visible: root.actionText !== ""
                bordered: true
                focusable: true
                text: root.actionText
                foreground: root.foreground
                accent: root.toneColor
                fontFamily: root.fontFamily
                fontSize: Style.font.bodySmall
                onClicked: root.actionTriggered()
            }

            Button {
                visible: root.secondaryActionText !== ""
                bordered: true
                focusable: true
                text: root.secondaryActionText
                foreground: root.dimColor
                fontFamily: root.fontFamily
                fontSize: Style.font.bodySmall
                onClicked: root.secondaryActionTriggered()
            }
        }
    }
}
