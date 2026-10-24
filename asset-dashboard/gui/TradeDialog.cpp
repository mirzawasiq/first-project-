#include "TradeDialog.h"

#include "Format.h"

#include <QButtonGroup>
#include <QDoubleSpinBox>
#include <QFormLayout>
#include <QHBoxLayout>
#include <QLabel>
#include <QPushButton>
#include <QStyle>
#include <QVBoxLayout>

#include <cmath>
#include <stdexcept>

TradeDialog::TradeDialog(const Asset& asset, Portfolio& portfolio, bool buy, QWidget* parent)
    : QDialog(parent), asset_(asset), portfolio_(portfolio), buy_(buy) {
    setWindowTitle("Trade " + Fmt::qs(asset.getSymbol()));
    setMinimumWidth(420);

    auto* layout = new QVBoxLayout(this);
    layout->setContentsMargins(24, 22, 24, 22);
    layout->setSpacing(12);

    auto* title = new QLabel(Fmt::qs(asset.getSymbol() + "  -  " + asset.getName()), this);
    title->setObjectName("dialogTitle");
    double day = asset.percentChangeOver(1);
    auto* price = new QLabel(QString("%1   <span style='color:%2'>%3 %4 today</span>")
                                 .arg(Fmt::money(asset.getCurrentPrice()), Fmt::changeColor(day).name(),
                                      Fmt::arrow(day), Fmt::percent(day)), this);
    price->setObjectName("dialogPrice");
    auto* details = new QLabel(Fmt::qs(asset.getType() + "  |  " + asset.getDetails()) +
                                   (asset.allowsFractional() ? "" : "  |  whole units only"), this);
    details->setObjectName("muted");
    layout->addWidget(title);
    layout->addWidget(price);
    layout->addWidget(details);

    auto* tabs = new QHBoxLayout;
    tabs->setSpacing(0);
    buyTab_ = new QPushButton("Buy", this);
    sellTab_ = new QPushButton("Sell", this);
    auto* group = new QButtonGroup(this);
    for (QPushButton* b : {buyTab_, sellTab_}) {
        b->setCheckable(true);
        b->setObjectName("periodButton");
        group->addButton(b);
        tabs->addWidget(b);
    }
    layout->addLayout(tabs);

    auto* form = new QFormLayout;
    form->setVerticalSpacing(10);
    quantity_ = new QDoubleSpinBox(this);
    quantity_->setDecimals(asset.allowsFractional() ? 6 : 0);
    quantity_->setRange(0, 1e9);
    quantity_->setGroupSeparatorShown(true);
    amount_ = new QDoubleSpinBox(this);
    amount_->setDecimals(2);
    amount_->setRange(0, 1e12);
    amount_->setPrefix("$ ");
    amount_->setGroupSeparatorShown(true);
    auto* maxButton = new QPushButton("Max", this);
    auto* quantityRow = new QHBoxLayout;
    quantityRow->addWidget(quantity_, 1);
    quantityRow->addWidget(maxButton);
    form->addRow("Quantity", quantityRow);
    form->addRow("Amount", amount_);
    layout->addLayout(form);

    summary_ = new QLabel(this);
    summary_->setObjectName("summaryBox");
    summary_->setWordWrap(true);
    error_ = new QLabel(this);
    error_->setObjectName("error");
    error_->setWordWrap(true);
    layout->addWidget(summary_);
    layout->addWidget(error_);

    auto* buttons = new QHBoxLayout;
    auto* cancel = new QPushButton("Cancel", this);
    confirm_ = new QPushButton(this);
    buttons->addStretch();
    buttons->addWidget(cancel);
    buttons->addWidget(confirm_);
    layout->addLayout(buttons);

    // Pressing Enter should confirm the trade, not press another button.
    for (QPushButton* b : findChildren<QPushButton*>()) b->setAutoDefault(false);
    confirm_->setDefault(true);

    // Keep quantity and dollar amount in sync without triggering each other forever.
    connect(quantity_, &QDoubleSpinBox::valueChanged, this, [this](double q) {
        if (syncing_) return;
        syncing_ = true;
        amount_->setValue(q * asset_.getCurrentPrice());
        syncing_ = false;
        updateSummary();
    });
    connect(amount_, &QDoubleSpinBox::valueChanged, this, [this](double a) {
        if (syncing_) return;
        syncing_ = true;
        double q = a / asset_.getCurrentPrice();
        if (!asset_.allowsFractional()) q = std::floor(q);
        quantity_->setValue(q);
        syncing_ = false;
        updateSummary();
    });
    connect(buyTab_, &QPushButton::clicked, this, [this]() { setMode(true); });
    connect(sellTab_, &QPushButton::clicked, this, [this]() { setMode(false); });
    connect(maxButton, &QPushButton::clicked, this, &TradeDialog::setMax);
    connect(cancel, &QPushButton::clicked, this, &QDialog::reject);
    connect(confirm_, &QPushButton::clicked, this, &TradeDialog::confirm);

    setMode(buy);
    quantity_->setFocus();
}

void TradeDialog::setMode(bool buy) {
    buy_ = buy;
    buyTab_->setChecked(buy);
    sellTab_->setChecked(!buy);
    confirm_->setObjectName(buy ? "buy" : "sell");
    confirm_->style()->unpolish(confirm_);  // re-apply the stylesheet for the new object name
    confirm_->style()->polish(confirm_);
    quantity_->setValue(0);
    updateSummary();
}

void TradeDialog::setMax() {
    double max = buy_ ? portfolio_.getCash() / asset_.getCurrentPrice()
                      : portfolio_.getQuantity(asset_.getSymbol());
    max = asset_.allowsFractional() ? std::floor(max * 1e6) / 1e6 : std::floor(max);
    quantity_->setValue(max);
}

void TradeDialog::updateSummary() {
    double quantity = quantity_->value();
    double total = quantity * asset_.getCurrentPrice();
    double owned = portfolio_.getQuantity(asset_.getSymbol());
    double cash = portfolio_.getCash();
    QString verb = buy_ ? "Buy" : "Sell";
    confirm_->setText(QString("%1 %2").arg(verb, Fmt::qs(asset_.getSymbol())));

    QString text;
    if (buy_) {
        text = QString("Cost: <b>%1</b><br>Cash now: %2<br>Cash after: %3<br>You will own: %4")
                   .arg(Fmt::money(total), Fmt::money(cash), Fmt::money(cash - total),
                        Fmt::quantity(owned + quantity));
    } else {
        const auto& holdings = portfolio_.getHoldings();
        auto it = holdings.find(asset_.getSymbol());
        double profit = it == holdings.end() ? 0 : (asset_.getCurrentPrice() - it->second.avgCost) * quantity;
        text = QString("You get: <b>%1</b><br>You own: %2<br>Left after sale: %3<br>"
                       "Profit on this sale: <span style='color:%4'>%5</span>")
                   .arg(Fmt::money(total), Fmt::quantity(owned), Fmt::quantity(owned - quantity),
                        Fmt::changeColor(profit).name(), Fmt::signedMoney(profit));
    }
    summary_->setText(text);

    // Let Portfolio's own rules decide if the trade is allowed.
    QString problem;
    if (quantity <= 0) problem = " ";
    else if (buy_ && total > cash + 1e-9) problem = "Not enough cash for this purchase.";
    else if (!buy_ && quantity > owned + 1e-9) problem = "You don't own that many.";
    else {
        try {
            portfolio_.validateQuantity(asset_, quantity);
        } catch (const std::exception& e) {
            problem = e.what();
        }
    }
    error_->setText(problem.trimmed());
    confirm_->setEnabled(problem.isEmpty());
}

void TradeDialog::confirm() {
    try {
        if (buy_) portfolio_.buy(asset_, quantity_->value(), DateUtil::today());
        else portfolio_.sell(asset_, quantity_->value(), DateUtil::today());
        accept();
    } catch (const std::exception& e) {
        error_->setText(e.what());
    }
}
