#include "TransactionsPage.h"

#include "Format.h"

#include <QComboBox>
#include <QFile>
#include <QFileDialog>
#include <QHBoxLayout>
#include <QMessageBox>
#include <QPushButton>
#include <QTableWidget>
#include <QTextStream>
#include <QVBoxLayout>

TransactionsPage::TransactionsPage(AppState& state, QWidget* parent) : Page(state, parent) {
    auto* layout = new QVBoxLayout(this);
    layout->setContentsMargins(0, 0, 0, 0);
    layout->setSpacing(12);

    auto* toolbar = new QHBoxLayout;
    filter_ = new QComboBox(this);
    filter_->addItems({"All transactions", "BUY", "SELL", "DEPOSIT", "WITHDRAW"});
    auto* exportButton = new QPushButton("Export to CSV", this);
    toolbar->addWidget(filter_);
    toolbar->addStretch();
    toolbar->addWidget(exportButton);
    layout->addLayout(toolbar);

    table_ = Fmt::makeTable({"Date", "Type", "Asset", "Quantity", "Price", "Total"}, this);
    layout->addWidget(table_, 1);

    connect(filter_, &QComboBox::currentIndexChanged, this, &TransactionsPage::refresh);
    connect(exportButton, &QPushButton::clicked, this, &TransactionsPage::exportCsv);
}

void TransactionsPage::refresh() {
    QString type = filter_->currentIndex() == 0 ? QString() : filter_->currentText();
    const auto& txs = state_.user.getPortfolio().getTransactions();

    table_->setRowCount(0);
    for (auto it = txs.rbegin(); it != txs.rend(); ++it) {  // newest first
        const Transaction& t = *it;
        QString name = Fmt::qs(t.typeName());
        if (!type.isEmpty() && name != type) continue;

        bool moneyIn = t.getType() == TransactionType::Sell || t.getType() == TransactionType::Deposit;
        bool cash = t.getSymbol() == "CASH";
        int row = table_->rowCount();
        table_->insertRow(row);
        table_->setItem(row, 0, Fmt::cell(Fmt::date(t.getDay())));
        table_->setItem(row, 1, Fmt::cell(name, moneyIn ? Fmt::Colors::Green : Fmt::Colors::Red));
        table_->setItem(row, 2, Fmt::cell(cash ? "Cash" : Fmt::qs(t.getSymbol())));
        table_->setItem(row, 3, Fmt::cell(cash ? "-" : Fmt::quantity(t.getQuantity())));
        table_->setItem(row, 4, Fmt::cell(cash ? "-" : Fmt::money(t.getPrice())));
        table_->setItem(row, 5, Fmt::cell((moneyIn ? "+" : "-") + Fmt::money(t.getTotal())));
    }
}

void TransactionsPage::exportCsv() {
    QString path = QFileDialog::getSaveFileName(this, "Export transactions",
                                                Fmt::qs(state_.user.getUsername()) + "_transactions.csv",
                                                "CSV files (*.csv)");
    if (path.isEmpty()) return;
    QFile file(path);
    if (!file.open(QIODevice::WriteOnly | QIODevice::Text)) {
        QMessageBox::warning(this, "Export failed", "Could not write " + path);
        return;
    }
    QTextStream out(&file);
    out << "date,type,symbol,quantity,price,total\n";
    for (const Transaction& t : state_.user.getPortfolio().getTransactions())
        out << Fmt::date(t.getDay()) << "," << Fmt::qs(t.typeName()) << "," << Fmt::qs(t.getSymbol())
            << "," << QString::number(t.getQuantity(), 'f', 8) << "," << QString::number(t.getPrice(), 'f', 4)
            << "," << QString::number(t.getTotal(), 'f', 2) << "\n";
    QMessageBox::information(this, "Exported", "Saved " + path);
}
