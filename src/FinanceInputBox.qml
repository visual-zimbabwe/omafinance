import QtQuick
import qs.Commons

/**
 * Shared toolbar input box built on FinanceSurface + TextInput.
 * Supports commit-on-Enter/blur, Escape-to-revert, optional clear button,
 * right-click action, uppercase normalization, and opt-in live debounce.
 */
FinanceSurface {
    id: root

    property string value: ""
    property string placeholderText: ""
    property bool clearable: false
    property bool allowRightClick: false
    property bool commitOnBlur: true
    property bool unfocusOnNavKeys: false
    property bool uppercase: false
    property int liveDebounceMs: 0

    property string fontFamily: Style.font.family
    property int fontPixelSize: Style.font.caption
    property bool fontBold: false
    property color dimColor: Color.foreground
    property int horizontalAlignment: TextInput.AlignLeft
    property int inputMethodHints: Qt.ImhNone
    property var validator: null
    property real leftPadding: Style.space(6)
    property real rightPadding: clearable ? Style.space(22) : Style.space(6)

    readonly property alias inputText: textInput.text
    readonly property alias inputActiveFocus: textInput.activeFocus
    readonly property alias inputContentWidth: textInput.contentWidth

    signal committed(string text)
    signal liveDebounced(string text)
    signal unfocusRequested()
    signal rightClicked()
    signal cleared()

    function clearText() {
        debounceTimer.stop();
        textInput.text = "";
    }

    elevation: 0
    radiusToken: "sm"
    sheen: false
    active: textInput.activeFocus
    surfaceColor: Qt.rgba(foregroundColor.r, foregroundColor.g, foregroundColor.b, 0.08)
    height: Style.space(24)
    clip: true

    TextInput {
        id: textInput
        anchors.fill: parent
        anchors.leftMargin: root.leftPadding
        anchors.rightMargin: root.rightPadding
        horizontalAlignment: root.horizontalAlignment
        verticalAlignment: TextInput.AlignVCenter
        clip: true
        text: root.value
        color: root.foregroundColor
        font.family: root.fontFamily
        font.pixelSize: root.fontPixelSize
        font.bold: root.fontBold
        font.capitalization: root.uppercase ? Font.AllUppercase : Font.MixedCase
        inputMethodHints: root.inputMethodHints
        validator: root.validator
        selectByMouse: true

        onTextEdited: {
            if (root.uppercase) {
                var curPos = cursorPosition;
                var upper = text.toUpperCase();
                if (text !== upper) {
                    text = upper;
                    cursorPosition = curPos;
                }
            }
        }

        onTextChanged: {
            if (activeFocus && root.liveDebounceMs > 0) {
                debounceTimer.restart();
            }
        }

        onAccepted: {
            debounceTimer.stop();
            root.committed(text.trim());
            root.unfocusRequested();
        }

        onActiveFocusChanged: {
            if (activeFocus) {
                selectAll();
            } else {
                debounceTimer.stop();
                if (root.commitOnBlur) {
                    root.committed(text.trim());
                }
                text = root.value;
            }
        }

        Keys.onPressed: function (ev) {
            if (ev.key === Qt.Key_Escape) {
                debounceTimer.stop();
                text = root.value;
                root.unfocusRequested();
                ev.accepted = true;
            } else if (root.unfocusOnNavKeys && (ev.key === Qt.Key_Down || ev.key === Qt.Key_Tab)) {
                root.unfocusRequested();
                ev.accepted = true;
            }
        }
    }

    Binding {
        target: textInput
        property: "text"
        value: root.value
        when: !textInput.activeFocus
    }

    MouseArea {
        anchors.fill: parent
        z: 2
        enabled: root.allowRightClick
        acceptedButtons: Qt.RightButton
        cursorShape: Qt.PointingHandCursor
        onClicked: function (mouse) {
            if (mouse.button === Qt.RightButton) {
                root.rightClicked();
            }
        }
    }

    Text {
        visible: root.placeholderText.length > 0 && root.value.length === 0 && !textInput.activeFocus
        textFormat: Text.PlainText
        text: root.placeholderText
        color: Qt.rgba(root.dimColor.r, root.dimColor.g, root.dimColor.b, 0.5)
        font.family: root.fontFamily
        font.pixelSize: root.fontPixelSize
        anchors.left: parent.left
        anchors.leftMargin: root.leftPadding
        anchors.verticalCenter: parent.verticalCenter
    }

    Text {
        visible: root.clearable && root.value.length > 0
        textFormat: Text.PlainText
        text: "✕"
        color: root.dimColor
        font.pixelSize: root.fontPixelSize
        anchors.right: parent.right
        anchors.rightMargin: Style.space(6)
        anchors.verticalCenter: parent.verticalCenter
        z: 3

        MouseArea {
            anchors.fill: parent
            anchors.margins: -Style.space(4)
            cursorShape: Qt.PointingHandCursor
            onClicked: {
                root.clearText();
                root.cleared();
            }
        }
    }

    Timer {
        id: debounceTimer
        interval: Math.max(1, root.liveDebounceMs)
        repeat: false
        onTriggered: root.liveDebounced(textInput.text.trim())
    }
}
