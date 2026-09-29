import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model

Column {
    id: detailViewRoot
    required property var controller
    width: parent.width
    spacing: Style.space(12)
    visible: controller.view === "detail"
    property bool showDetailsSpinner: false
    property double detailsLoadStartedAt: 0
    readonly property int detailsSpinnerDelayMs: Model.delayedLoaderDelayMs()
    readonly property string detailsPendingKey: visible && controller.detailDataLoading ? String(controller.detailSymbol) : ""
    property bool showAllHoldings: false
    property string holdingsSortKey: "weight"
    property bool holdingsSortAsc: false
    readonly property var rawHoldings: (controller.detailHoldings && controller.detailHoldings.holdings) ? controller.detailHoldings.holdings : []
    readonly property var sortedHoldings: Model.sortHoldings(rawHoldings, holdingsSortKey, holdingsSortAsc, controller.detailHoldingsStratMap)
    readonly property var displayedHoldings: showAllHoldings ? sortedHoldings : sortedHoldings.slice(0, 10)
    readonly property string holdingsReportDate: (controller.detailHoldings && controller.detailHoldings.reportDate) ? controller.detailHoldings.reportDate : ""

    function armDetailsSpinner() {
        detailsSpinnerDelay.stop();
        showDetailsSpinner = false;
        if (!detailsPendingKey) {
            detailsLoadStartedAt = 0;
            return;
        }
        detailsLoadStartedAt = Date.now();
        detailsSpinnerDelay.interval = detailsSpinnerDelayMs;
        detailsSpinnerDelay.start();
    }

    onDetailsPendingKeyChanged: armDetailsSpinner()

    Timer {
        id: detailsSpinnerDelay
        interval: detailViewRoot.detailsSpinnerDelayMs
        repeat: false
        onTriggered: {
            var remaining = detailViewRoot.detailsSpinnerDelayMs - (Date.now() - detailViewRoot.detailsLoadStartedAt);
            if (remaining > 0 && controller.detailDataLoading && detailViewRoot.visible) {
                interval = remaining;
                start();
                return;
            }
            showDetailsSpinner = Model.shouldShowDelayedLoader(controller.detailDataLoading && detailViewRoot.visible, detailViewRoot.detailsLoadStartedAt, Date.now(), detailViewRoot.detailsSpinnerDelayMs);
        }
    }

    Item {
        width: parent.width
        height: Math.max(backLabel.implicitHeight, detailActions.implicitHeight)

        Text {
            id: backLabel
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            text: controller.detailHistory && controller.detailHistory.length > 0 ? "‹ " + controller.detailHistory[controller.detailHistory.length - 1] : "‹ Watchlist"
            color: controller.dim
            font.family: controller.contentFontFamily
            font.pixelSize: Style.font.body

            MouseArea {
                anchors.fill: parent
                anchors.margins: -6
                cursorShape: Qt.PointingHandCursor
                onClicked: controller.closeDetail()
            }
        }

        Row {
            id: detailActions
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            spacing: Style.space(4)

            Button {
                text: controller.detailIsFavorite ? "Favorited" : "Favorite"
                hasCursor: controller.detailSection === 0 && controller.detailActionIndex === 0
                foreground: controller.detailIsFavorite ? controller.contentForeground : controller.dim
                fontFamily: controller.contentFontFamily
                fontSize: Style.font.bodySmall
                horizontalPadding: Style.space(8)
                verticalPadding: Style.space(3)
                onClicked: controller.toggleFavorite(controller.detailSymbol)
            }
            Button {
                text: Model.isPinned(controller.pinned, controller.detailSymbol) ? "Pinned" : "Pin"
                hasCursor: controller.detailSection === 0 && controller.detailActionIndex === 1
                foreground: Model.isPinned(controller.pinned, controller.detailSymbol) ? controller.contentForeground : controller.dim
                fontFamily: controller.contentFontFamily
                fontSize: Style.font.bodySmall
                horizontalPadding: Style.space(8)
                verticalPadding: Style.space(3)
                onClicked: controller.pinSymbol(controller.detailSymbol)
            }
            Button {
                text: "Grid"
                hasCursor: controller.detailSection === 0 && controller.detailActionIndex === 2
                foreground: controller.dim
                fontFamily: controller.contentFontFamily
                fontSize: Style.font.bodySmall
                horizontalPadding: Style.space(8)
                verticalPadding: Style.space(3)
                onClicked: controller.openGrid(controller.detailSymbol)
            }
            Button {
                visible: controller.detailIsFavorite
                text: "Remove"
                hasCursor: controller.detailSection === 0 && controller.detailActionIndex === 3
                foreground: controller.contentUrgent
                accent: controller.contentUrgent
                fontFamily: controller.contentFontFamily
                fontSize: Style.font.bodySmall
                horizontalPadding: Style.space(8)
                verticalPadding: Style.space(3)
                onClicked: {
                    controller.removeSymbol(controller.detailSymbol);
                    controller.closeDetail();
                }
            }
        }
    }

    Column {
        id: detailHeader
        width: parent.width
        spacing: Style.space(2)

        Item {
            width: parent.width
            height: Math.max(tickerRow.implicitHeight, ftfcRow.implicitHeight)

            Row {
                id: tickerRow
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.space(8)

                Text {
                    id: tickerLabel
                    textFormat: Text.PlainText
                    text: controller.detailSymbol
                    color: controller.dim
                    font.family: controller.contentFontFamily
                    font.pixelSize: Style.font.body
                    font.bold: true
                }

                Item {
                    id: detailsSpinnerSlot
                    visible: detailViewRoot.showDetailsSpinner
                    width: visible ? Style.font.body : 0
                    height: tickerLabel.height

                    Canvas {
                        id: detailsSpinner
                        width: Style.font.body
                        height: Style.font.body
                        anchors.verticalCenter: parent.verticalCenter
                        onWidthChanged: requestPaint()
                        onHeightChanged: requestPaint()
                        onVisibleChanged: if (visible)
                            requestPaint()
                        onPaint: {
                            var ctx = getContext("2d");
                            var line = Math.max(1.5, width * 0.14);
                            var radius = Math.min(width, height) / 2 - line;
                            ctx.reset();
                            ctx.lineWidth = line;
                            ctx.lineCap = "round";
                            ctx.strokeStyle = controller.dim;
                            ctx.beginPath();
                            ctx.arc(width / 2, height / 2, radius, 0, Math.PI * 1.5);
                            ctx.stroke();
                        }

                        RotationAnimation on rotation {
                            running: detailsSpinner.visible
                            from: 0
                            to: 360
                            duration: 800
                            loops: Animation.Infinite
                        }
                    }
                }
            }

            Row {
                id: ftfcRow
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.space(3)

                Text {
                    textFormat: Text.PlainText
                    text: "60"
                    color: controller.timeframeColor(controller.activeQuote, "60")
                    font.family: controller.contentFontFamily
                    font.pixelSize: Style.font.bodySmall
                    font.letterSpacing: 1
                    font.bold: true
                }
                Text {
                    textFormat: Text.PlainText
                    text: "|"
                    color: controller.dim
                    font.family: controller.contentFontFamily
                    font.pixelSize: Style.font.bodySmall
                }
                Text {
                    textFormat: Text.PlainText
                    text: "D"
                    color: controller.timeframeColor(controller.activeQuote, "D")
                    font.family: controller.contentFontFamily
                    font.pixelSize: Style.font.bodySmall
                    font.letterSpacing: 1
                    font.bold: true
                }
                Text {
                    textFormat: Text.PlainText
                    text: "|"
                    color: controller.dim
                    font.family: controller.contentFontFamily
                    font.pixelSize: Style.font.bodySmall
                }
                Text {
                    textFormat: Text.PlainText
                    text: "W"
                    color: controller.timeframeColor(controller.activeQuote, "W")
                    font.family: controller.contentFontFamily
                    font.pixelSize: Style.font.bodySmall
                    font.letterSpacing: 1
                    font.bold: true
                }
                Text {
                    textFormat: Text.PlainText
                    text: "|"
                    color: controller.dim
                    font.family: controller.contentFontFamily
                    font.pixelSize: Style.font.bodySmall
                }
                Text {
                    textFormat: Text.PlainText
                    text: "M"
                    color: controller.timeframeColor(controller.activeQuote, "M")
                    font.family: controller.contentFontFamily
                    font.pixelSize: Style.font.bodySmall
                    font.letterSpacing: 1
                    font.bold: true
                }
            }
        }

        Text {
            id: companyName
            width: parent.width
            textFormat: Text.PlainText
            text: controller.activeQuote && controller.activeQuote.name ? controller.activeQuote.name : ""
            color: controller.contentForeground
            font.family: controller.contentFontFamily
            font.pixelSize: Style.font.display
            elide: Text.ElideRight
        }
    }

    Text {
        visible: controller.detailDataStatusText !== ""
        width: parent.width
        text: controller.detailDataStatusText
        color: controller.detailDataHasError ? controller.contentUrgent : controller.dim
        font.family: controller.contentFontFamily
        font.pixelSize: Style.font.bodySmall
        elide: Text.ElideRight
    }

    Row {
        width: parent.width
        spacing: Style.space(32)

        Column {
            width: controller.showExtended ? implicitWidth : parent.width
            spacing: Style.space(6)

            Column {
                spacing: Style.space(2)

                PriceRoll {
                    price: controller.activeQuote ? controller.detailMainPrice : null
                    currency: controller.activeQuote ? controller.activeQuote.currency : "USD"
                    priceHint: controller.activeQuote ? controller.activeQuote.priceHint : 2
                    neutralColor: controller.contentForeground
                    upColor: controller.upColor
                    downColor: controller.downColor
                    fontFamily: controller.contentFontFamily
                    fontSize: Style.font.display
                    active: controller.opened && controller.view === "detail"
                }

                Text {
                    id: detailChange
                    textFormat: Text.PlainText
                    text: Model.formatChangePair(controller.shownMainChange, controller.shownMainChangeAmount, controller.detailMainPrice, controller.activeQuote ? controller.activeQuote.currency : "USD", controller.activeQuote ? controller.activeQuote.priceHint : 2)
                    color: controller.toneColor(controller.shownMainChange)
                    font.family: controller.contentFontFamily
                    font.pixelSize: Style.font.body
                    font.bold: true
                }
            }

            Text {
                visible: controller.priceCaption !== ""
                text: controller.priceCaption
                color: controller.dim
                font.family: controller.contentFontFamily
                font.pixelSize: Style.font.bodySmall
            }
        }

        Column {
            visible: controller.showExtended
            spacing: Style.space(6)

            Column {
                spacing: Style.space(2)

                PriceRoll {
                    price: controller.sessionQuote ? controller.sessionQuote.extendedPrice : null
                    currency: controller.sessionQuote ? controller.sessionQuote.currency : "USD"
                    priceHint: controller.sessionQuote ? controller.sessionQuote.priceHint : 2
                    neutralColor: controller.contentForeground
                    upColor: controller.upColor
                    downColor: controller.downColor
                    fontFamily: controller.contentFontFamily
                    fontSize: Style.font.display
                    active: controller.opened && controller.view === "detail"
                }

                Text {
                    id: extChange
                    textFormat: Text.PlainText
                    text: controller.sessionQuote ? Model.formatChangePair(controller.sessionQuote.extendedChangePercent, controller.extendedChangeAmount, controller.sessionQuote.extendedPrice, controller.sessionQuote.currency, controller.sessionQuote.priceHint) : "-"
                    color: controller.toneColor(controller.sessionQuote ? controller.sessionQuote.extendedChangePercent : null)
                    font.family: controller.contentFontFamily
                    font.pixelSize: Style.font.body
                    font.bold: true
                }
            }

            Text {
                text: Model.extendedLabel(controller.sessionQuote)
                color: controller.dim
                font.family: controller.contentFontFamily
                font.pixelSize: Style.font.bodySmall
            }
        }
    }

    Item {
        width: parent.width
        height: rangeRow.implicitHeight

        Row {
            id: rangeRow
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            spacing: Style.space(4)

            Repeater {
                model: controller.detailRanges

                Rectangle {
                    required property var modelData
                    readonly property bool current: String(modelData) === controller.detailRange
                    radius: Style.space(6)
                    color: current ? Style.hoverFillFor(controller.contentForeground, Color.accent) : "transparent"
                    implicitWidth: rangeLabel.implicitWidth + Style.space(14)
                    implicitHeight: rangeLabel.implicitHeight + Style.space(8)

                    Text {
                        id: rangeLabel
                        anchors.centerIn: parent
                        textFormat: Text.PlainText
                        text: String(modelData)
                        color: current ? controller.contentForeground : controller.dim
                        font.family: controller.contentFontFamily
                        font.pixelSize: Style.font.bodySmall
                        font.bold: current
                    }

                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: controller.setDetailRange(String(modelData))
                    }
                }
            }
        }
    }

    Text {
        visible: controller.chartStatusText !== ""
        width: parent.width
        text: controller.chartStatusText
        color: controller.chartError ? controller.contentUrgent : controller.dim
        font.family: controller.contentFontFamily
        font.pixelSize: Style.font.bodySmall
        elide: Text.ElideRight
    }

    function resetChart() {
        if (candleChart && candleChart.resetZoom)
            candleChart.resetZoom();
    }

    Item {
        width: parent.width
        height: Style.space(140)

        CandlestickChart {
            id: candleChart
            anchors.fill: parent
            symbol: controller.detailSymbol
            candles: controller.rangeChart && controller.rangeChart.candles ? controller.rangeChart.candles : []
            upColor: controller.upColor
            downColor: controller.downColor
            fontFamily: controller.contentFontFamily
            currency: controller.activeQuote && controller.activeQuote.currency ? controller.activeQuote.currency : "USD"
            priceHint: controller.activeQuote ? controller.activeQuote.priceHint : 2
            rangeKey: controller.detailRange
            interactive: true
        }
    }

    Row {
        width: parent.width
        spacing: Style.space(24)

        Column {
            spacing: Style.space(4)
            width: (parent.width - Style.space(72)) / 4
            Text {
                text: "OPEN"
                color: controller.dim
                font.family: controller.contentFontFamily
                font.pixelSize: Style.font.bodySmall
                font.letterSpacing: 1
            }
            Text {
                textFormat: Text.PlainText
                text: controller.activeQuote ? Model.formatPrice(controller.activeQuote.open, controller.activeQuote.currency, controller.activeQuote.priceHint) : "-"
                color: controller.contentForeground
                font.family: controller.contentFontFamily
                font.pixelSize: Style.font.title
            }
        }
        Column {
            spacing: Style.space(4)
            width: (parent.width - Style.space(72)) / 4
            Text {
                text: "HIGH"
                color: controller.dim
                font.family: controller.contentFontFamily
                font.pixelSize: Style.font.bodySmall
                font.letterSpacing: 1
            }
            Text {
                textFormat: Text.PlainText
                text: controller.activeQuote ? Model.formatPrice(controller.activeQuote.dayHigh, controller.activeQuote.currency, controller.activeQuote.priceHint) : "-"
                color: controller.contentForeground
                font.family: controller.contentFontFamily
                font.pixelSize: Style.font.title
            }
        }
        Column {
            spacing: Style.space(4)
            width: (parent.width - Style.space(72)) / 4
            Text {
                text: "LOW"
                color: controller.dim
                font.family: controller.contentFontFamily
                font.pixelSize: Style.font.bodySmall
                font.letterSpacing: 1
            }
            Text {
                textFormat: Text.PlainText
                text: controller.activeQuote ? Model.formatPrice(controller.activeQuote.dayLow, controller.activeQuote.currency, controller.activeQuote.priceHint) : "-"
                color: controller.contentForeground
                font.family: controller.contentFontFamily
                font.pixelSize: Style.font.title
            }
        }
        Column {
            spacing: Style.space(4)
            width: (parent.width - Style.space(72)) / 4
            Text {
                text: "VOL"
                color: controller.dim
                font.family: controller.contentFontFamily
                font.pixelSize: Style.font.bodySmall
                font.letterSpacing: 1
            }
            Text {
                textFormat: Text.PlainText
                text: controller.activeQuote ? Model.formatCompact(controller.activeQuote.volume) : "-"
                color: controller.contentForeground
                font.family: controller.contentFontFamily
                font.pixelSize: Style.font.title
            }
        }
    }

    Grid {
        width: parent.width
        columns: 3
        columnSpacing: Style.space(16)
        rowSpacing: Style.space(12)

        Repeater {
            model: controller.detailStats

            Column {
                required property var modelData
                width: (detailViewRoot.width - Style.space(32)) / 3
                spacing: Style.space(4)

                Text {
                    text: modelData.label
                    color: controller.dim
                    font.family: controller.contentFontFamily
                    font.pixelSize: Style.font.bodySmall
                    font.letterSpacing: 1
                }
                Text {
                    textFormat: Text.PlainText
                    text: modelData.value
                    color: controller.contentForeground
                    font.family: controller.contentFontFamily
                    font.pixelSize: Style.font.title
                    wrapMode: Text.WordWrap
                    width: parent.width
                }
            }
        }
    }

    Column {
        id: holdingsSection
        visible: controller.detailHoldings && controller.detailHoldings.holdings && controller.detailHoldings.holdings.length > 0
        width: parent.width
        spacing: Style.space(8)

        Item {
            width: parent.width
            height: Math.max(holdingsHeaderLeft.implicitHeight, holdingsHeaderRight.implicitHeight)

            Row {
                id: holdingsHeaderLeft
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.space(6)

                Text {
                    text: "HOLDINGS"
                    color: controller.dim
                    font.family: controller.contentFontFamily
                    font.pixelSize: Style.font.bodySmall
                    font.letterSpacing: 1
                    font.bold: true
                }

                Text {
                    id: holdingsDateTooltip
                    text: holdingsHeaderMouseArea.containsMouse && detailViewRoot.holdingsReportDate !== "" ? "· As of " + detailViewRoot.holdingsReportDate : ""
                    color: controller.dim
                    font.family: controller.contentFontFamily
                    font.pixelSize: Style.font.bodySmall
                }
            }

            MouseArea {
                id: holdingsHeaderMouseArea
                anchors.fill: holdingsHeaderLeft
                hoverEnabled: true
            }

            Row {
                id: holdingsHeaderRight
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.space(6)

                Text {
                    text: "TICKER" + (detailViewRoot.holdingsSortKey === "ticker" ? (detailViewRoot.holdingsSortAsc ? " ↑" : " ↓") : "")
                    color: detailViewRoot.holdingsSortKey === "ticker" ? controller.contentForeground : controller.dim
                    font.family: controller.contentFontFamily
                    font.pixelSize: Style.font.bodySmall
                    font.bold: detailViewRoot.holdingsSortKey === "ticker"

                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            if (detailViewRoot.holdingsSortKey === "ticker") {
                                detailViewRoot.holdingsSortAsc = !detailViewRoot.holdingsSortAsc;
                            } else {
                                detailViewRoot.holdingsSortKey = "ticker";
                                detailViewRoot.holdingsSortAsc = true;
                            }
                        }
                    }
                }

                Text {
                    width: Style.space(46)
                    horizontalAlignment: Text.AlignRight
                    text: "WEIGHT" + (detailViewRoot.holdingsSortKey === "weight" ? (detailViewRoot.holdingsSortAsc ? " ↑" : " ↓") : "")
                    color: detailViewRoot.holdingsSortKey === "weight" ? controller.contentForeground : controller.dim
                    font.family: controller.contentFontFamily
                    font.pixelSize: Style.font.bodySmall
                    font.bold: detailViewRoot.holdingsSortKey === "weight"

                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            if (detailViewRoot.holdingsSortKey === "weight") {
                                detailViewRoot.holdingsSortAsc = !detailViewRoot.holdingsSortAsc;
                            } else {
                                detailViewRoot.holdingsSortKey = "weight";
                                detailViewRoot.holdingsSortAsc = false;
                            }
                        }
                    }
                }

                Repeater {
                    model: [
                        { label: "60", key: "60", colWidth: Style.space(22) },
                        { label: "D", key: "1D", colWidth: Style.space(18) },
                        { label: "W", key: "1W", colWidth: Style.space(18) },
                        { label: "M", key: "1M", colWidth: Style.space(18) },
                        { label: "Y", key: "1Y", colWidth: Style.space(18) }
                    ]

                    Text {
                        required property var modelData
                        width: modelData.colWidth
                        horizontalAlignment: Text.AlignHCenter
                        text: modelData.label + ((detailViewRoot.holdingsSortKey === modelData.key || detailViewRoot.holdingsSortKey === modelData.label) ? (detailViewRoot.holdingsSortAsc ? "↑" : "↓") : "")
                        color: (detailViewRoot.holdingsSortKey === modelData.key || detailViewRoot.holdingsSortKey === modelData.label) ? controller.contentForeground : controller.dim
                        font.family: controller.contentFontFamily
                        font.pixelSize: Style.font.bodySmall
                        font.bold: (detailViewRoot.holdingsSortKey === modelData.key || detailViewRoot.holdingsSortKey === modelData.label)

                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                if (detailViewRoot.holdingsSortKey === modelData.key || detailViewRoot.holdingsSortKey === modelData.label) {
                                    detailViewRoot.holdingsSortAsc = !detailViewRoot.holdingsSortAsc;
                                } else {
                                    detailViewRoot.holdingsSortKey = modelData.key;
                                    detailViewRoot.holdingsSortAsc = false;
                                }
                            }
                        }
                    }
                }
            }
        }

        Column {
            width: parent.width
            spacing: Style.space(4)

            Repeater {
                model: detailViewRoot.displayedHoldings

                Rectangle {
                    id: holdingRow
                    required property var modelData
                    required property int index
                    readonly property bool isDelisted: holdingRow.modelData.delisted === true
                    readonly property var stratInfo: (controller.detailHoldingsStratMap && controller.detailHoldingsStratMap[holdingRow.modelData.symbol]) ? controller.detailHoldingsStratMap[holdingRow.modelData.symbol] : null
                    width: parent.width
                    height: Style.space(38)
                    radius: Style.space(6)
                    color: rowMouseArea.containsMouse && !holdingRow.isDelisted ? Style.hoverFillFor(controller.contentForeground, Color.accent) : "transparent"

                    MouseArea {
                        id: rowMouseArea
                        anchors.fill: parent
                        hoverEnabled: !holdingRow.isDelisted
                        cursorShape: holdingRow.isDelisted ? Qt.ArrowCursor : Qt.PointingHandCursor
                        onClicked: {
                            if (!holdingRow.isDelisted)
                                controller.openDetailWithHistory(holdingRow.modelData.symbol)
                        }
                    }

                    Column {
                        anchors.fill: parent
                        anchors.leftMargin: Style.space(6)
                        anchors.rightMargin: Style.space(6)
                        anchors.topMargin: Style.space(4)
                        anchors.bottomMargin: Style.space(4)
                        spacing: Style.space(4)

                        Item {
                            width: parent.width
                            height: Math.max(leftInfo.implicitHeight, rightInfo.implicitHeight)

                            Row {
                                id: leftInfo
                                anchors.left: parent.left
                                anchors.right: rightInfo.left
                                anchors.rightMargin: Style.space(8)
                                anchors.verticalCenter: parent.verticalCenter
                                spacing: Style.space(6)

                                Text {
                                    textFormat: Text.PlainText
                                    text: holdingRow.modelData.symbol
                                    color: holdingRow.isDelisted ? controller.dim : controller.contentForeground
                                    font.family: controller.contentFontFamily
                                    font.pixelSize: Style.font.body
                                    font.bold: true
                                }

                                Text {
                                    visible: holdingRow.isDelisted
                                    textFormat: Text.PlainText
                                    text: "· Delisted"
                                    color: controller.dim
                                    font.family: controller.contentFontFamily
                                    font.pixelSize: Style.font.bodySmall
                                    font.italic: true
                                }

                                Text {
                                    textFormat: Text.PlainText
                                    text: holdingRow.modelData.name
                                    color: controller.dim
                                    font.family: controller.contentFontFamily
                                    font.pixelSize: Style.font.bodySmall
                                    elide: Text.ElideRight
                                    width: Math.min(implicitWidth, leftInfo.width - Style.space(holdingRow.isDelisted ? 130 : 70))
                                }
                            }

                            Row {
                                id: rightInfo
                                anchors.right: parent.right
                                anchors.verticalCenter: parent.verticalCenter
                                spacing: Style.space(6)

                                Text {
                                    id: weightText
                                    width: Style.space(46)
                                    horizontalAlignment: Text.AlignRight
                                    textFormat: Text.PlainText
                                    text: holdingRow.modelData.pctVal ? holdingRow.modelData.pctVal.toFixed(2) + "%" : "-"
                                    color: holdingRow.isDelisted ? controller.dim : controller.contentForeground
                                    font.family: controller.contentFontFamily
                                    font.pixelSize: Style.font.body
                                    font.bold: true
                                }

                                Repeater {
                                    model: [
                                        { label: "60", key: "60", colWidth: Style.space(22) },
                                        { label: "D", key: "1D", colWidth: Style.space(18) },
                                        { label: "W", key: "1W", colWidth: Style.space(18) },
                                        { label: "M", key: "1M", colWidth: Style.space(18) },
                                        { label: "Y", key: "1Y", colWidth: Style.space(18) }
                                    ]

                                    Item {
                                        id: tfCell
                                        required property var modelData
                                        width: modelData.colWidth
                                        height: weightText.height
                                        readonly property var tfData: holdingRow.stratInfo ? (holdingRow.stratInfo[modelData.key] || holdingRow.stratInfo[modelData.label]) : null
                                        readonly property string barText: tfData && tfData.bar && tfData.bar !== "-" ? tfData.bar.toUpperCase() : "-"
                                        readonly property color barColor: (!tfData || tfData.bar === "-" || tfData.polarity === "neutral" || holdingRow.isDelisted) ? controller.dim : (tfData.polarity === "green" ? controller.upColor : controller.downColor)

                                        Text {
                                            anchors.centerIn: parent
                                            textFormat: Text.PlainText
                                            text: tfCell.barText
                                            color: tfCell.barColor
                                            font.family: controller.contentFontFamily
                                            font.pixelSize: Style.font.bodySmall
                                            font.bold: true
                                        }

                                        MouseArea {
                                            anchors.fill: parent
                                            hoverEnabled: !holdingRow.isDelisted
                                            onEntered: {
                                                var pos = mapToItem(controller, mouseX, mouseY);
                                                controller.hoveredStratInfo = {
                                                    symbol: holdingRow.modelData.symbol,
                                                    name: holdingRow.modelData.name,
                                                    timeframe: modelData.label,
                                                    timeframeKey: modelData.key,
                                                    data: tfCell.tfData
                                                };
                                                controller.hoveredStratGlobalX = pos.x;
                                                controller.hoveredStratGlobalY = pos.y;
                                            }
                                            onPositionChanged: {
                                                var pos = mapToItem(controller, mouseX, mouseY);
                                                controller.hoveredStratGlobalX = pos.x;
                                                controller.hoveredStratGlobalY = pos.y;
                                            }
                                            onExited: {
                                                controller.hoveredStratInfo = null;
                                            }
                                            onClicked: {
                                                if (!holdingRow.isDelisted)
                                                    controller.openDetailWithHistory(holdingRow.modelData.symbol);
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        Item {
                            width: parent.width
                            height: Style.space(3)

                            Rectangle {
                                anchors.fill: parent
                                radius: Style.space(1.5)
                                color: Qt.rgba(1, 1, 1, 0.08)
                            }

                            Rectangle {
                                width: Math.max(Style.space(2), parent.width * Math.min(1, Math.max(0, holdingRow.modelData.relativeRatio || 0)))
                                height: parent.height
                                radius: Style.space(1.5)
                                color: holdingRow.isDelisted ? controller.dim : controller.upColor
                            }
                        }
                    }
                }
            }
        }

        Item {
            visible: detailViewRoot.rawHoldings.length > 10
            width: parent.width
            height: toggleBtn.implicitHeight + Style.space(4)

            Button {
                id: toggleBtn
                anchors.centerIn: parent
                text: detailViewRoot.showAllHoldings ? "Collapse holdings" : "Show all (" + detailViewRoot.rawHoldings.length + ") holdings"
                foreground: controller.dim
                fontFamily: controller.contentFontFamily
                fontSize: Style.font.bodySmall
                horizontalPadding: Style.space(12)
                verticalPadding: Style.space(4)
                onClicked: detailViewRoot.showAllHoldings = !detailViewRoot.showAllHoldings
            }
        }
    }
}
