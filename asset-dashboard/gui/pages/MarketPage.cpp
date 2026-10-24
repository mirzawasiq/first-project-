#include "MarketPage.h"

#include "Format.h"

#include <QComboBox>
#include <QHBoxLayout>
#include <QHeaderView>
#include <QLabel>
#include <QLineEdit>
#include <QPushButton>
#include <QTableWidget>
#include <QVBoxLayout>

namespace {
enum Column { Symbol, Name, Type, Price, Day1, Day7, Day30, Source };
}

MarketPage::MarketPage(AppState& state, QWidget* parent) : Page(state, parent) {
    auto* layout = new QVBoxLayout(this);
    layout->setContentsMargins(0, 0, 0, 0);
    layout->setSpacing(12);

    auto* toolbar = new QHBoxLayout;
    search_ = new QLineEdit(this);
    search_->setPlaceholderText("Search by symbol or name...");
    search_->setClearButtonEnabled(true);
    typeFilter_ = new QComboBox(this);
    typeFilter_->addItems({"All types", "Crypto", "Stock", "Commodity"});
    buy_ = new QPushButton("Buy", this);
    buy_->setObjectName("buy");
    sell_ = new QPushButton("Sell", this);
    sell_->setObjectName("sell");
    toolbar->addWidget(search_, 1);
    toolbar->addWidget(typeFilter_);
    toolbar->addSpacing(12);
    toolbar->addWidget(buy_);
    toolbar->addWidget(sell_);
    layout->addLayout(toolbar);

    table_ = Fmt::makeTable({"Symbol", "Name", "Type", "Price", "24h", "7 days", "30 days", "Source"}, this);
    table_->horizontalHeader()->setSectionResizeMode(QHeaderView::ResizeToContents);
    table_->horizontalHeader()->setSectionResizeMode(Name, QHeaderView::Stretch);
    table_->horizontalHeader()->setMinimumSectionSize(90);
    table_->sortByColumn(Symbol, Qt::AscendingOrder);
    table_->setSortingEnabled(true);
    layout->addWidget(table_, 1);

    auto* hint = new QLabel("Tip: double-click an asset to buy it. Live prices come from CoinGecko "
                            "and refresh every minute; stocks and oil are simulated.", this);
    hint->setObjectName("muted");
    hint->setWordWrap(true);
    layout->addWidget(hint);

    connect(search_, &QLineEdit::textChanged, this, &MarketPage::refresh);
    connect(typeFilter_, &QComboBox::currentIndexChanged, this, &MarketPage::refresh);
    connect(table_, &QTableWidget::itemSelectionChanged, this, &MarketPage::updateButtons);
    connect(table_, &QTableWidget::cellDoubleClicked, this,
            [this]() { emit tradeRequested(selectedSymbol(), true); });
    connect(buy_, &QPushButton::clicked, this, [this]() { emit tradeRequested(selectedSymbol(), true); });
    connect(sell_, &QPushButton::clicked, this, [this]() { emit tradeRequested(selectedSymbol(), false); });
}

QString MarketPage::selectedSymbol() const {
    int row = table_->currentRow();
    return row < 0 || !table_->item(row, Symbol) ? QString() : table_->item(row, Symbol)->text();
}

void MarketPage::updateButtons() {
    QString symbol = selectedSymbol();
    const Asset* asset = state_.market.find(symbol.toStdString());
    buy_->setEnabled(asset && state_.canTrade(*asset));
    sell_->setEnabled(asset && state_.canTrade(*asset) &&
                      state_.user.getPortfolio().getQuantity(asset->getSymbol()) > 0);
}

void MarketPage::refresh() {
    QString keep = selectedSymbol();
    QString filter = search_->text().trimmed();
    QString type = typeFilter_->currentIndex() == 0 ? QString() : typeFilter_->currentText();

    table_->setSortingEnabled(false);
    table_->setRowCount(0);
    for (const auto& a : state_.market.getAssets()) {
        QString symbol = Fmt::qs(a->getSymbol());
        QString name = Fmt::qs(a->getName());
        if (!filter.isEmpty() && !symbol.contains(filter, Qt::CaseInsensitive) &&
            !name.contains(filter, Qt::CaseInsensitive))
            continue;
        if (!type.isEmpty() && Fmt::qs(a->getType()) != type) continue;

        int row = table_->rowCount();
        table_->insertRow(row);
        table_->setItem(row, Symbol, Fmt::cell(symbol));
        table_->item(row, Symbol)->setFont(QFont(font().family(), -1, QFont::Bold));
        table_->setItem(row, Name, Fmt::cell(name));
        table_->setItem(row, Type, Fmt::cell(Fmt::qs(a->getType()), Fmt::Colors::Muted));

        if (a->hasPrice()) {
            table_->setItem(row, Price, Fmt::numberCell(Fmt::money(a->getCurrentPrice()), a->getCurrentPrice()));
            int columns[] = {Day1, Day7, Day30};
            int periods[] = {1, 7, 30};
            for (int i = 0; i < 3; ++i) {
                double change = a->percentChangeOver(periods[i]);
                table_->setItem(row, columns[i],
                                Fmt::numberCell(Fmt::arrow(change) + " " + Fmt::percent(change), change,
                                                Fmt::changeColor(change)));
            }
        } else {
            table_->setItem(row, Price, Fmt::numberCell("Loading...", 0, Fmt::Colors::Muted));
        }

        QString dot = QString(QChar(0x25CF)) + "  ";
        if (!a->isLive())
            table_->setItem(row, Source, Fmt::cell("Simulated", Fmt::Colors::Muted));
        else if (state_.isFresh(*a))
            table_->setItem(row, Source, Fmt::cell(dot + "Live", Fmt::Colors::Green));
        else
            table_->setItem(row, Source, Fmt::cell(dot + "Waiting...", Fmt::Colors::Amber));

        if (symbol == keep) table_->selectRow(row);
    }
    table_->setSortingEnabled(true);
    updateButtons();
}
