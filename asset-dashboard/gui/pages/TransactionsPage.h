#pragma once

#include "Page.h"

class QComboBox;
class QTableWidget;

// Every buy, sell, deposit and withdrawal, newest first, with CSV export.
class TransactionsPage : public Page {
    Q_OBJECT
public:
    explicit TransactionsPage(AppState& state, QWidget* parent = nullptr);
    QString title() const override { return "Transactions"; }
    void refresh() override;

private:
    void exportCsv();

    QComboBox* filter_;
    QTableWidget* table_;
};
