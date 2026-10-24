#include "DashboardPage.h"

#include "Charts.h"
#include "Format.h"
#include "StatCard.h"

#include <QtCharts/QChartView>
#include <QGridLayout>
#include <QHeaderView>
#include <QLabel>
#include <QTableWidget>
#include <QVBoxLayout>

#include <algorithm>
#include <cmath>

DashboardPage::DashboardPage(AppState& state, QWidget* parent) : Page(state, parent) {
    auto* layout = new QVBoxLayout(this);
    layout->setContentsMargins(0, 0, 0, 0);
    layout->setSpacing(16);

    auto* cards = new QGridLayout;
    cards->setSpacing(16);
    netWorth_ = new StatCard("Net worth", this);
    cash_ = new StatCard("Cash", this);
    invested_ = new StatCard("Invested", this);
    profit_ = new StatCard("Total profit / loss", this);
    cards->addWidget(netWorth_, 0, 0);
    cards->addWidget(cash_, 0, 1);
    cards->addWidget(invested_, 0, 2);
    cards->addWidget(profit_, 0, 3);
    layout->addLayout(cards);

    auto* bottom = new QHBoxLayout;
    bottom->setSpacing(16);

    auto* chartBox = new QVBoxLayout;
    auto* chartTitle = new QLabel("Portfolio value - last 30 days", this);
    chartTitle->setObjectName("sectionTitle");
    chart_ = Charts::createView(this);
    chartBox->addWidget(chartTitle);
    chartBox->addWidget(chart_, 1);
    bottom->addLayout(chartBox, 3);

    auto* moversBox = new QVBoxLayout;
    auto* moversTitle = new QLabel("Top movers today", this);
    moversTitle->setObjectName("sectionTitle");
    movers_ = Fmt::makeTable({"Asset", "Price", "24h"}, this);
    movers_->setSelectionMode(QAbstractItemView::NoSelection);
    moversBox->addWidget(moversTitle);
    moversBox->addWidget(movers_, 1);
    bottom->addLayout(moversBox, 2);

    layout->addLayout(bottom, 1);
}

void DashboardPage::refresh() {
    const Portfolio& p = state_.user.getPortfolio();
    const Market& m = state_.market;

    double total = p.totalValue(m);
    double invested = p.holdingsValue(m);
    double profit = p.totalProfit(m);
    double contributed = p.netContributions();

    netWorth_->setValue(Fmt::money(total));
    netWorth_->setNote(QString("%1 holding(s)").arg(p.getHoldings().size()), Fmt::Colors::Muted);
    cash_->setValue(Fmt::money(p.getCash()));
    cash_->setNote(QString("%1% of portfolio").arg(total > 0 ? p.getCash() / total * 100 : 0, 0, 'f', 1),
                   Fmt::Colors::Muted);
    invested_->setValue(Fmt::money(invested));
    double unrealized = p.unrealizedProfit(m);
    invested_->setNote(Fmt::signedMoney(unrealized) + " unrealized", Fmt::changeColor(unrealized));
    profit_->setValue(Fmt::signedMoney(profit));
    profit_->setNote(Fmt::arrow(profit) + " " +
                         Fmt::percent(contributed > 0 ? profit / contributed * 100 : 0) +
                         " on money put in",
                     Fmt::changeColor(profit));

    Charts::showLine(chart_, p.valueHistory(30, m),
                     "Your chart will grow as the days go by");

    // Five biggest moves (up or down) over the last day.
    std::vector<const Asset*> priced;
    for (const auto& a : m.getAssets())
        if (a->hasPrice() && state_.isFresh(*a)) priced.push_back(a.get());
    std::sort(priced.begin(), priced.end(), [](const Asset* a, const Asset* b) {
        return std::fabs(a->percentChangeOver(1)) > std::fabs(b->percentChangeOver(1));
    });
    if (priced.size() > 6) priced.resize(6);

    movers_->setRowCount(0);
    for (const Asset* a : priced) {
        int row = movers_->rowCount();
        movers_->insertRow(row);
        double change = a->percentChangeOver(1);
        movers_->setItem(row, 0, Fmt::cell(Fmt::qs(a->getSymbol()) + "   " + Fmt::qs(a->getName())));
        movers_->setItem(row, 1, Fmt::cell(Fmt::money(a->getCurrentPrice())));
        movers_->setItem(row, 2, Fmt::cell(Fmt::arrow(change) + " " + Fmt::percent(change),
                                           Fmt::changeColor(change)));
    }
    movers_->horizontalHeader()->setSectionResizeMode(0, QHeaderView::Stretch);
}
