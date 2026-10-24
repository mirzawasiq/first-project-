#pragma once

#include "Page.h"

class QComboBox;
class QLineEdit;
class QPushButton;
class QTableWidget;

// Every tradable asset with live/simulated prices; the place to buy and sell.
class MarketPage : public Page {
    Q_OBJECT
public:
    explicit MarketPage(AppState& state, QWidget* parent = nullptr);
    QString title() const override { return "Market"; }
    void refresh() override;

private:
    QString selectedSymbol() const;
    void updateButtons();

    QLineEdit* search_;
    QComboBox* typeFilter_;
    QTableWidget* table_;
    QPushButton* buy_;
    QPushButton* sell_;
};
