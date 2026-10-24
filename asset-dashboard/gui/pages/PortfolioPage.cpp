#include "PortfolioPage.h"

#include "Charts.h"
#include "Format.h"

#include <QtCharts/QChartView>
#include <QHBoxLayout>
#include <QLabel>
#include <QPushButton>
#include <QTableWidget>
#include <QVBoxLayout>

namespace {
enum Column { Symbol, Quantity, AvgCost, Price, Value, Profit, ProfitPct, Allocation };
}

PortfolioPage::PortfolioPage(AppState& state, QWidget* parent) : Page(state, parent) {
    auto* layout = new QVBoxLayout(this);
    layout->setContentsMargins(0, 0, 0, 0);
    layout->setSpacing(12);

    auto* toolbar = new QHBoxLayout;
    summary_ = new QLabel(this);
    summary_->setObjectName("muted");
    buyMore_ = new QPushButton("Buy more", this);
    buyMore_->setObjectName("buy");
    sell_ = new QPushButton("Sell", this);
    sell_->setObjectName("sell");
    toolbar->addWidget(summary_, 1);
    toolbar->addWidget(buyMore_);
    toolbar->addWidget(sell_);
    layout->addLayout(toolbar);

    table_ = Fmt::makeTable({"Asset", "Quantity", "Avg. cost", "Price", "Value", "Profit / loss",
                             "P/L %", "Share"}, this);
    table_->sortByColumn(Symbol, Qt::AscendingOrder);
    table_->setSortingEnabled(true);
    layout->addWidget(table_, 2);

    auto* chartTitle = new QLabel("Where your money is", this);
    chartTitle->setObjectName("sectionTitle");
    layout->addWidget(chartTitle);
    allocation_ = Charts::createView(this);
    allocation_->setMinimumHeight(220);
    layout->addWidget(allocation_, 2);

    connect(buyMore_, &QPushButton::clicked, this, [this]() { emit tradeRequested(selectedSymbol(), true); });
    connect(sell_, &QPushButton::clicked, this, [this]() { emit tradeRequested(selectedSymbol(), false); });
    connect(table_, &QTableWidget::cellDoubleClicked, this,
            [this]() { emit tradeRequested(selectedSymbol(), false); });
    connect(table_, &QTableWidget::itemSelectionChanged, this, &PortfolioPage::updateButtons);
}

QString PortfolioPage::selectedSymbol() const {
    int row = table_->currentRow();
    return row < 0 || !table_->item(row, Symbol) ? QString() : table_->item(row, Symbol)->text();
}

void PortfolioPage::refresh() {
    const Portfolio& p = state_.user.getPortfolio();
    const Market& m = state_.market;
    double total = p.totalValue(m);
    QString keep = selectedSymbol();

    QList<QPair<QString, double>> slices;
    table_->setSortingEnabled(false);
    table_->setRowCount(0);
    for (const auto& [symbol, h] : p.getHoldings()) {
        const Asset* a = m.find(symbol);
        double price = a && a->hasPrice() ? a->getCurrentPrice() : h.avgCost;
        double value = price * h.quantity;
        double profit = value - h.avgCost * h.quantity;
        double profitPct = h.avgCost > 0 ? (price - h.avgCost) / h.avgCost * 100 : 0;

        int row = table_->rowCount();
        table_->insertRow(row);
        table_->setItem(row, Symbol, Fmt::cell(Fmt::qs(symbol)));
        table_->setItem(row, Quantity, Fmt::numberCell(Fmt::quantity(h.quantity), h.quantity));
        table_->setItem(row, AvgCost, Fmt::numberCell(Fmt::money(h.avgCost), h.avgCost));
        table_->setItem(row, Price, Fmt::numberCell(Fmt::money(price), price));
        table_->setItem(row, Value, Fmt::numberCell(Fmt::money(value), value));
        table_->setItem(row, Profit, Fmt::numberCell(Fmt::signedMoney(profit), profit, Fmt::changeColor(profit)));
        table_->setItem(row, ProfitPct, Fmt::numberCell(Fmt::arrow(profit) + " " + Fmt::percent(profitPct),
                                                        profitPct, Fmt::changeColor(profit)));
        double share = total > 0 ? value / total * 100 : 0;
        table_->setItem(row, Allocation, Fmt::numberCell(QString::number(share, 'f', 1) + "%", share));
        if (Fmt::qs(symbol) == keep) table_->selectRow(row);
        slices.append({Fmt::qs(symbol), value});
    }
    table_->setSortingEnabled(true);
    slices.append({"Cash", p.getCash()});
    Charts::showDoughnut(allocation_, slices);

    double unrealized = p.unrealizedProfit(m);
    if (p.getHoldings().empty())
        summary_->setText("You don't own any assets yet. Go to Market and buy your first one!");
    else
        summary_->setText(QString("Holdings worth %1   |   Cash %2   |   Unrealized %3   |   Realized %4")
                              .arg(Fmt::money(p.holdingsValue(m)), Fmt::money(p.getCash()),
                                   Fmt::signedMoney(unrealized), Fmt::signedMoney(p.getRealizedProfit())));

    updateButtons();
}

void PortfolioPage::updateButtons() {
    const Asset* asset = state_.market.find(selectedSymbol().toStdString());
    buyMore_->setEnabled(asset && state_.canTrade(*asset));
    sell_->setEnabled(asset && state_.canTrade(*asset));
}
