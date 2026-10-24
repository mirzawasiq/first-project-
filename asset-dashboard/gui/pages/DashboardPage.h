#pragma once

#include "Page.h"

class QChartView;
class QTableWidget;
class StatCard;

// Home screen: key numbers, 30-day portfolio chart and today's top movers.
class DashboardPage : public Page {
    Q_OBJECT
public:
    explicit DashboardPage(AppState& state, QWidget* parent = nullptr);
    QString title() const override { return "Dashboard"; }
    void refresh() override;

private:
    StatCard* netWorth_;
    StatCard* cash_;
    StatCard* invested_;
    StatCard* profit_;
    QChartView* chart_;
    QTableWidget* movers_;
};
