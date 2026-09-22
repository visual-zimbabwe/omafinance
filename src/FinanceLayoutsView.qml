import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model

Column {
    id: layoutsViewRoot
    required property var controller
    width: parent.width
    spacing: Style.space(14)
    visible: controller.view === "layouts"

    property string saveName: ""
    property bool confirmOverwrite: false
    property string confirmDeleteName: ""

    Text {
        text: "‹ Watchlist"
        color: controller.dim
        font.family: controller.contentFontFamily
        font.pixelSize: Style.font.body

        MouseArea {
            anchors.fill: parent
            anchors.margins: -6
            cursorShape: Qt.PointingHandCursor
            onClicked: {
                controller.layoutActionStatus = "";
                controller.view = "list";
            }
        }
    }

    Text {
        text: "Chart Layouts"
        color: controller.contentForeground
        font.family: controller.contentFontFamily
        font.pixelSize: Style.font.heading
        font.bold: true
    }

    // Section 1: Save Current Layout Snapshot
    Rectangle {
        width: parent.width
        implicitHeight: saveSectionCol.implicitHeight + Style.space(20)
        color: Qt.rgba(controller.dim.r, controller.dim.g, controller.dim.b, 0.08)
        radius: Style.space(8)
        border.color: Qt.rgba(controller.dim.r, controller.dim.g, controller.dim.b, 0.15)
        border.width: 1

        Column {
            id: saveSectionCol
            anchors.fill: parent
            anchors.margins: Style.space(10)
            spacing: Style.space(8)

            Text {
                text: "Save Current Workspace"
                color: controller.contentForeground
                font.family: controller.contentFontFamily
                font.pixelSize: Style.font.body
                font.bold: true
            }

            Text {
                text: "Captures all open Omafinance chart windows and their tickers."
                color: controller.dim
                font.family: controller.contentFontFamily
                font.pixelSize: Style.font.bodySmall
                wrapMode: Text.WordWrap
                width: parent.width
            }

            Row {
                width: parent.width
                spacing: Style.space(8)

                TextField {
                    id: layoutNameField
                    width: parent.width - saveBtn.width - Style.space(8)
                    placeholderText: "Layout name (e.g. Morning 6-Pack)"
                    foreground: controller.contentForeground
                    font.family: controller.contentFontFamily
                    text: layoutsViewRoot.saveName

                    onTextChanged: {
                        layoutsViewRoot.saveName = text;
                        layoutsViewRoot.confirmOverwrite = false;
                    }

                    Keys.onPressed: function (event) {
                        if (event.key === Qt.Key_Escape) {
                            controller.view = "list";
                            event.accepted = true;
                        } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
                            handleSave();
                            event.accepted = true;
                        }
                    }
                }

                Rectangle {
                    id: saveBtn
                    width: saveBtnText.implicitWidth + Style.space(20)
                    height: layoutNameField.implicitHeight
                    radius: Style.space(6)
                    color: layoutsViewRoot.confirmOverwrite ? Qt.rgba(0.8, 0.4, 0.1, 0.9) : Qt.rgba(controller.contentForeground.r, controller.contentForeground.g, controller.contentForeground.b, 0.15)
                    border.color: Qt.rgba(controller.dim.r, controller.dim.g, controller.dim.b, 0.3)
                    border.width: 1

                    Text {
                        id: saveBtnText
                        anchors.centerIn: parent
                        textFormat: Text.PlainText
                        text: layoutsViewRoot.confirmOverwrite ? "Overwrite?" : "Save Snapshot"
                        color: controller.contentForeground
                        font.family: controller.contentFontFamily
                        font.pixelSize: Style.font.bodySmall
                        font.bold: true
                    }

                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: handleSave()
                    }
                }
            }

            Text {
                visible: controller.layoutActionStatus !== ""
                width: parent.width
                text: controller.layoutActionStatus
                color: controller.dim
                font.family: controller.contentFontFamily
                font.pixelSize: Style.font.bodySmall
                elide: Text.ElideRight
            }
        }
    }

    function handleSave() {
        var name = layoutsViewRoot.saveName.trim();
        if (!name)
            return;
        if (controller.layouts && controller.layouts[name] && !layoutsViewRoot.confirmOverwrite) {
            layoutsViewRoot.confirmOverwrite = true;
            controller.layoutActionStatus = "Layout '" + name + "' already exists. Click 'Overwrite?' to confirm.";
            return;
        }
        controller.snapshotCurrentLayout(name);
        layoutsViewRoot.confirmOverwrite = false;
        layoutsViewRoot.saveName = "";
        layoutNameField.text = "";
    }

    // Section 2: Saved Layouts List
    Column {
        width: parent.width
        spacing: Style.space(8)

        Text {
            text: "Saved Presets"
            color: controller.contentForeground
            font.family: controller.contentFontFamily
            font.pixelSize: Style.font.body
            font.bold: true
        }

        Text {
            visible: !controller.layouts || Object.keys(controller.layouts).length === 0
            text: "No saved layouts yet. Open your charts and save a snapshot above."
            color: controller.dim
            font.family: controller.contentFontFamily
            font.pixelSize: Style.font.bodySmall
        }

        Repeater {
            model: controller.layouts ? Object.keys(controller.layouts) : []

            Rectangle {
                id: layoutItemCard
                required property string modelData
                readonly property var layoutObj: controller.layouts[modelData] || ({})
                readonly property var layoutWindows: layoutObj.windows || []
                readonly property int targetWs: layoutObj.workspace || 2

                width: layoutsViewRoot.width
                implicitHeight: itemCol.implicitHeight + Style.space(16)
                color: Qt.rgba(controller.dim.r, controller.dim.g, controller.dim.b, 0.05)
                radius: Style.space(6)
                border.color: Qt.rgba(controller.dim.r, controller.dim.g, controller.dim.b, 0.15)
                border.width: 1

                Column {
                    id: itemCol
                    anchors.fill: parent
                    anchors.margins: Style.space(8)
                    spacing: Style.space(6)

                    Row {
                        width: parent.width
                        spacing: Style.space(8)

                        Text {
                            text: modelData
                            color: controller.contentForeground
                            font.family: controller.contentFontFamily
                            font.pixelSize: Style.font.title
                            font.bold: true
                            elide: Text.ElideRight
                            width: parent.width - actionRow.implicitWidth - Style.space(12)
                            anchors.verticalCenter: parent.verticalCenter
                        }

                        Row {
                            id: actionRow
                            spacing: Style.space(6)
                            anchors.verticalCenter: parent.verticalCenter

                            // Open Button
                            Rectangle {
                                width: openBtnText.implicitWidth + Style.space(16)
                                height: Style.space(26)
                                radius: Style.space(4)
                                color: Qt.rgba(0.22, 0.50, 0.30, 0.85)

                                Text {
                                    id: openBtnText
                                    anchors.centerIn: parent
                                    text: "Open"
                                    color: "#ffffff"
                                    font.family: controller.contentFontFamily
                                    font.pixelSize: Style.font.bodySmall
                                    font.bold: true
                                }

                                MouseArea {
                                    anchors.fill: parent
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: {
                                        controller.loadLayout(modelData);
                                    }
                                }
                            }

                            // Delete Button
                            Rectangle {
                                width: delBtnText.implicitWidth + Style.space(14)
                                height: Style.space(26)
                                radius: Style.space(4)
                                color: layoutsViewRoot.confirmDeleteName === modelData ? Qt.rgba(0.8, 0.2, 0.2, 0.9) : Qt.rgba(controller.dim.r, controller.dim.g, controller.dim.b, 0.15)

                                Text {
                                    id: delBtnText
                                    anchors.centerIn: parent
                                    text: layoutsViewRoot.confirmDeleteName === modelData ? "Confirm?" : "✕"
                                    color: layoutsViewRoot.confirmDeleteName === modelData ? "#ffffff" : controller.dim
                                    font.family: controller.contentFontFamily
                                    font.pixelSize: Style.font.bodySmall
                                    font.bold: true
                                }

                                MouseArea {
                                    anchors.fill: parent
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: {
                                        if (layoutsViewRoot.confirmDeleteName === modelData) {
                                            controller.deleteLayout(modelData);
                                            layoutsViewRoot.confirmDeleteName = "";
                                        } else {
                                            layoutsViewRoot.confirmDeleteName = modelData;
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Tickers & Workspace info
                    Text {
                        textFormat: Text.PlainText
                        text: {
                            var syms = [];
                            for (var w = 0; w < layoutWindows.length; w++) {
                                var item = layoutWindows[w];
                                var s = typeof item === "string" ? item : (item ? item.symbol : "");
                                if (s)
                                    syms.push(s);
                            }
                            return syms.length + " Charts: " + syms.join(" • ") + "  (Workspace " + targetWs + ")";
                        }
                        color: controller.dim
                        font.family: controller.contentFontFamily
                        font.pixelSize: Style.font.bodySmall
                        elide: Text.ElideRight
                        width: parent.width
                    }
                }
            }
        }
    }
}
