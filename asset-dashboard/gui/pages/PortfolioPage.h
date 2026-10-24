#pragma once

#include "Page.h"

class QChartView;
class QLabel;
class QPushButton;
class QTableWidget;

// What the user owns: quantities, average cost, profit/loss and allocation.
class PortfolioPage : public Page {
    Q_OBJECT
public:
    explicit PortfolioPage(AppState& state, QWidget* parent = nullptr);
    QString title() const override { return "My Portfolio"; }
    void refresh() override;

private:
    QString selectedSymbol() const;
    void updateButtons();

    QTableWidget* table_;
    QChartView* allocation_;
    QLabel* summary_;
    QPushButton* buyMore_;
    QPushButton* sell_;
};
