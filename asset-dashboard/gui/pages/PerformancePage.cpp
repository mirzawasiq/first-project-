#include "PerformancePage.h"

#include "Charts.h"
#include "Format.h"

#include <QtCharts/QChartView>
#include <QButtonGroup>
#include <QComboBox>
#include <QFrame>
#include <QGridLayout>
#include <QHBoxLayout>
#include <QLabel>
#include <QPushButton>
#include <QVBoxLayout>

#include <algorithm>

namespace {
const QString kPortfolio = "Whole portfolio";
}

PerformancePage::PerformancePage(AppState& state, QWidget* parent) : Page(state, parent) {
    auto* layout = new QVBoxLayout(this);
    layout->setContentsMargins(0, 0, 0, 0);
    layout->setSpacing(14);

    auto* toolbar = new QHBoxLayout;
    subject_ = new QComboBox(this);
    subject_->setMinimumWidth(240);
    toolbar->addWidget(new QLabel("Show:", this));
    toolbar->addWidget(subject_);
    toolbar->addStretch();

    periods_ = new QButtonGroup(this);
    const QList<QPair<QString, int>> options = {{"7D", 7}, {"30D", 30}, {"90D", 90}, {"1Y", 365}};
    for (const auto& [label, days] : options) {
        auto* button = new QPushButton(label, this);
        button->setObjectName("periodButton");
        button->setCheckable(true);
        periods_->addButton(button, days);
        toolbar->addWidget(button);
    }
    periods_->button(30)->setChecked(true);
    layout->addLayout(toolbar);

    auto* card = new QFrame(this);
    card->setObjectName("card");
    auto* grid = new QGridLayout(card);
    grid->setContentsMargins(20, 16, 20, 16);
    grid->setHorizontalSpacing(30);
    heading_ = new QLabel(card);
    heading_->setObjectName("sectionTitle");
    grid->addWidget(heading_, 0, 0, 1, 4);
    start_ = addStat(grid, 1, 0, "Start of period");
    now_ = addStat(grid, 1, 1, "Now");
    change_ = addStat(grid, 1, 2, "Change");
    trend_ = addStat(grid, 1, 3, "Trend");
    high_ = addStat(grid, 3, 0, "Highest");
    low_ = addStat(grid, 3, 1, "Lowest");
    position_ = addStat(grid, 3, 2, "Your position");
    for (int c = 0; c < 4; ++c) grid->setColumnMinimumWidth(c, 190);
    grid->setVerticalSpacing(6);
    grid->setRowMinimumHeight(3, 34);
    grid->setColumnStretch(4, 1);
    layout->addWidget(card);

    chart_ = Charts::createView(this);
    layout->addWidget(chart_, 1);

    connect(subject_, &QComboBox::currentIndexChanged, this, &PerformancePage::updateView);
    connect(periods_, &QButtonGroup::idClicked, this, &PerformancePage::updateView);
}

QLabel* PerformancePage::addStat(QGridLayout* grid, int row, int column, const QString& name) {
    auto* title = new QLabel(name.toUpper(), this);
    title->setObjectName("cardTitle");
    auto* value = new QLabel("-", this);
    value->setObjectName("statValue");
    grid->addWidget(title, row, column);
    grid->addWidget(value, row + 1, column);
    return value;
}

void PerformancePage::showAsset(const QString& symbol) {
    refresh();
    int index = subject_->findData(symbol);
    if (index >= 0) subject_->setCurrentIndex(index);
}

void PerformancePage::refresh() {
    QStringList symbols;
    for (const auto& a : state_.market.getAssets()) symbols << Fmt::qs(a->getSymbol());
    if (subject_->count() > 0 && Fmt::comboHasSymbols(subject_, symbols, 1)) {
        updateView();  // same assets: just update the numbers
        return;
    }

    bool firstTime = subject_->count() == 0;
    QString keep = subject_->currentData().toString();
    subject_->blockSignals(true);
    subject_->clear();
    subject_->addItem(kPortfolio, QString());
    for (const auto& a : state_.market.getAssets())
        subject_->addItem(Fmt::qs(a->getSymbol() + "  -  " + a->getName()), Fmt::qs(a->getSymbol()));
    int index = subject_->findData(keep);
    // A brand-new portfolio has no history to chart yet, so start on an asset.
    if (firstTime && state_.user.getPortfolio().valueHistory(365, state_.market).size() < 2)
        index = subject_->count() > 1 ? 1 : 0;
    subject_->setCurrentIndex(index < 0 ? 0 : index);
    subject_->blockSignals(false);
    updateView();
}

void PerformancePage::updateView() {
    int days = periods_->checkedId();
    QString symbol = subject_->currentData().toString();
    const Portfolio& p = state_.user.getPortfolio();

    std::vector<PricePoint> points;
    QString name;
    if (symbol.isEmpty()) {
        points = p.valueHistory(days, state_.market);
        name = "Your portfolio";
        position_->setText(Fmt::money(p.totalValue(state_.market)) + " total");
        position_->setStyleSheet("");
    } else {
        const Asset* a = state_.market.find(symbol.toStdString());
        if (!a) return;
        name = Fmt::qs(a->getName()) + " (" + Fmt::qs(a->getDetails()) + ")";
        if (a->hasPrice()) points = a->historyOver(days);

        double owned = p.getQuantity(a->getSymbol());
        if (owned > 0 && a->hasPrice()) {
            double positionChange = owned * a->changeOver(days);
            position_->setText(Fmt::quantity(owned) + " units, " + Fmt::signedMoney(positionChange));
            position_->setStyleSheet("color: " + Fmt::changeColor(positionChange).name());
        } else {
            position_->setText("You don't own any");
            position_->setStyleSheet("color: " + Fmt::Colors::Muted.name());
        }
    }

    heading_->setText(QString("%1  -  last %2 days").arg(name).arg(days));
    Charts::showLine(chart_, points, symbol.isEmpty() ? "Your chart will grow as the days go by"
                                                      : "Waiting for price history...");
    if (points.size() < 2) {
        for (QLabel* l : {start_, now_, change_, trend_, high_, low_}) {
            l->setText("-");
            l->setStyleSheet("");
        }
        return;
    }

    double first = points.front().price;
    double last = points.back().price;
    double change = last - first;
    auto [lowIt, highIt] = std::minmax_element(points.begin(), points.end(),
        [](const PricePoint& a, const PricePoint& b) { return a.price < b.price; });
    QString color = "color: " + Fmt::changeColor(change).name();

    start_->setText(Fmt::money(first) + "\n" + Fmt::date(points.front().day));
    now_->setText(Fmt::money(last) + "\n" + Fmt::date(points.back().day));
    change_->setText(Fmt::signedMoney(change) + "\n" + Fmt::percent(first > 0 ? change / first * 100 : 0));
    change_->setStyleSheet(color);
    trend_->setText(Fmt::arrow(change) + " " + Fmt::trendText(change));
    trend_->setStyleSheet(color);
    high_->setText(Fmt::money(highIt->price) + "\n" + Fmt::date(highIt->day));
    low_->setText(Fmt::money(lowIt->price) + "\n" + Fmt::date(lowIt->day));
}
