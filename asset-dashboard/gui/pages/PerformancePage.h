#pragma once

#include "Page.h"

class QButtonGroup;
class QChartView;
class QComboBox;
class QLabel;

// Shows how an asset (or the whole portfolio) went up or down over a period.
class PerformancePage : public Page {
    Q_OBJECT
public:
    explicit PerformancePage(AppState& state, QWidget* parent = nullptr);
    QString title() const override { return "Performance"; }
    void refresh() override;

    void showAsset(const QString& symbol);  // pre-select an asset from elsewhere

private:
    void updateView();
    QLabel* addStat(class QGridLayout* grid, int row, int column, const QString& name);

    QComboBox* subject_;
    QButtonGroup* periods_;
    QLabel* heading_;
    QLabel* start_;
    QLabel* now_;
    QLabel* change_;
    QLabel* trend_;
    QLabel* high_;
    QLabel* low_;
    QLabel* position_;
    QChartView* chart_;
};
