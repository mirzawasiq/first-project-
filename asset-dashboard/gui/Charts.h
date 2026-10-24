#pragma once

#include "Asset.h"

#include <QList>
#include <QPair>
#include <QString>
#include <vector>

class QChartView;
class QWidget;

// Builds the styled Qt Charts used across the app.
namespace Charts {

QChartView* createView(QWidget* parent);

// Price/value over time. The line is green if it ended higher than it
// started and red if lower.
void showLine(QChartView* view, const std::vector<PricePoint>& points,
              const QString& emptyMessage = "Not enough history yet");

// Doughnut chart, e.g. how the portfolio is split between assets.
void showDoughnut(QChartView* view, const QList<QPair<QString, double>>& slices);

}  // namespace Charts
