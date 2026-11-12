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

    BackLink {
        linkColor: controller.dim
        fontFamily: controller.contentFontFamily
        onTriggered: {
            controller.layoutActionStatus = "";
            controller.view = "list";
        }
    }

    Text {
        text: qsTr("Chart Layouts")
        color: controller.contentForeground
        font.family: controller.contentFontFamily
        font.pixelSize: Style.font.heading
        font.bold: true
    }

    // Section 1: Save Current Layout Snapshot
    FinanceSurface {
        elevation: 1
        radiusToken: "lg"
        foregroundColor: controller.contentForeground
        width: parent.width
        implicitHeight: saveSectionCol.implicitHeight + Style.space(20)

        Column {
            id: saveSectionCol
            anchors.fill: parent
            anchors.margins: Style.space(10)
            spacing: Style.space(8)

            Text {
                text: qsTr("Save Current Workspace")
                color: controller.contentForeground
                font.family: controller.contentFontFamily
                font.pixelSize: Style.font.body
                font.bold: true
            }

            Text {
                text: qsTr("Captures all open Omafinance chart windows and their tickers.")
                color: controller.dim
                font.family: controller.contentFontFamily
                font.pixelSize: Style.font.bodySmall
                wrapMode: Text.WordWrap
                lineHeight: 1.3
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

                Button {
                    id: saveBtn
                    bordered: true
                    focusable: true
                    enabled: layoutsViewRoot.saveName.trim().length > 0
                    selected: layoutsViewRoot.confirmOverwrite
                    text: layoutsViewRoot.confirmOverwrite ? qsTr("Overwrite?") : qsTr("Save Snapshot")
                    foreground: controller.contentForeground
                    accent: layoutsViewRoot.confirmOverwrite ? controller.contentUrgent : Color.accent
                    fontFamily: controller.contentFontFamily
                    fontSize: Style.font.bodySmall
                    height: layoutNameField.implicitHeight
                    onClicked: handleSave()
                }
            }

            FinanceStatusBanner {
                width: parent.width
                compact: true
                tone: (layoutsViewRoot.confirmOverwrite || controller.layoutActionStatus.indexOf("No active") >= 0) ? "warning" : "success"
                text: controller.layoutActionStatus
                autoHideMs: layoutsViewRoot.confirmOverwrite ? 0 : 3500
                fontFamily: controller.contentFontFamily
                foreground: controller.contentForeground
                dimColor: controller.dim
                errorColor: controller.contentUrgent
                successColor: controller.upColor
                onDismissed: controller.layoutActionStatus = ""
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

        FinanceStatusBanner {
            visible: !controller.layouts || Object.keys(controller.layouts).length === 0
            width: parent.width
            compact: false
            tone: "info"
            title: qsTr("No saved layouts yet")
            text: qsTr("Open your charts, enter a preset name above, and save a snapshot.")
            actionText: qsTr("Name layout")
            fontFamily: controller.contentFontFamily
            foreground: controller.contentForeground
            dimColor: controller.dim
            onActionTriggered: layoutNameField.forceActiveFocus()
        }

        Repeater {
            model: controller.layouts ? Object.keys(controller.layouts) : []

            FinanceSurface {
                id: layoutItemCard
                required property string modelData
                readonly property var layoutObj: controller.layouts[modelData] || ({})
                readonly property var layoutWindows: layoutObj.windows || []
                readonly property int targetWs: layoutObj.workspace || 2

                elevation: 1
                radiusToken: "md"
                foregroundColor: controller.contentForeground
                width: layoutsViewRoot.width
                implicitHeight: itemCol.implicitHeight + Style.space(16)

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
                            Button {
                                id: openLayoutBtn
                                bordered: true
                                focusable: true
                                text: qsTr("Open")
                                foreground: controller.upColor
                                accent: controller.upColor
                                fontFamily: controller.contentFontFamily
                                fontSize: Style.font.bodySmall
                                height: Style.space(26)
                                Accessible.name: qsTr("Open layout %1").arg(modelData)
                                onClicked: controller.loadLayout(modelData)
                            }

                            // Delete Button
                            Button {
                                id: delLayoutBtn
                                bordered: true
                                selected: layoutsViewRoot.confirmDeleteName === modelData
                                text: layoutsViewRoot.confirmDeleteName === modelData ? qsTr("Confirm?") : "✕"
                                foreground: layoutsViewRoot.confirmDeleteName === modelData ? controller.contentUrgent : controller.dim
                                accent: controller.contentUrgent
                                fontFamily: controller.contentFontFamily
                                fontSize: Style.font.bodySmall
                                height: Style.space(26)
                                Accessible.name: layoutsViewRoot.confirmDeleteName === modelData ? qsTr("Confirm delete %1").arg(modelData) : qsTr("Delete layout %1").arg(modelData)
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
