#include "Charts.h"

#include "Format.h"

#include <QtCharts/QAreaSeries>
#include <QtCharts/QChart>
#include <QtCharts/QChartView>
#include <QtCharts/QDateTimeAxis>
#include <QtCharts/QLineSeries>
#include <QtCharts/QPieSeries>
#include <QtCharts/QValueAxis>

#include <algorithm>

namespace Charts {

namespace {

QChart* baseChart() {
    auto* chart = new QChart;
    chart->setBackgroundBrush(Fmt::Colors::Panel);
    chart->setBackgroundPen(Qt::NoPen);
    chart->setBackgroundRoundness(12);
    chart->setMargins(QMargins(6, 6, 6, 6));
    chart->setTitleBrush(Fmt::Colors::Muted);
    chart->legend()->hide();
    return chart;
}

void replaceChart(QChartView* view, QChart* chart) {
    QChart* old = view->chart();
    view->setChart(chart);  // the view does not delete the old chart itself
    delete old;
}

void styleAxis(QAbstractAxis* axis) {
    axis->setLabelsBrush(Fmt::Colors::Muted);
    axis->setGridLineColor(Fmt::Colors::Grid);
    axis->setLinePen(Qt::NoPen);
}

}  // namespace

QChartView* createView(QWidget* parent) {
    auto* view = new QChartView(baseChart(), parent);
    view->setRenderHint(QPainter::Antialiasing);
    view->setMinimumHeight(260);
    view->setStyleSheet("background: transparent; border: none;");
    return view;
}

void showLine(QChartView* view, const std::vector<PricePoint>& points, const QString& emptyMessage) {
    QChart* chart = baseChart();
    if (points.size() < 2) {
        chart->setTitle(emptyMessage);
        replaceChart(view, chart);
        return;
    }

    auto [lowIt, highIt] = std::minmax_element(points.begin(), points.end(),
        [](const PricePoint& a, const PricePoint& b) { return a.price < b.price; });
    double padding = std::max((highIt->price - lowIt->price) * 0.1, highIt->price * 0.002);
    double bottom = std::max(0.0, lowIt->price - padding);
    double top = highIt->price + padding;

    auto* upper = new QLineSeries;
    auto* lower = new QLineSeries;
    for (const PricePoint& p : points) {
        double x = static_cast<double>(DateUtil::toUnixSeconds(p.day)) * 1000.0;
        upper->append(x, p.price);
        lower->append(x, bottom);
    }

    QColor color = Fmt::changeColor(points.back().price - points.front().price);
    if (color == Fmt::Colors::Muted) color = Fmt::Colors::Accent;
    auto* area = new QAreaSeries(upper, lower);
    area->setPen(QPen(color, 2.2));
    QLinearGradient fill(QPointF(0, 0), QPointF(0, 1));
    fill.setCoordinateMode(QGradient::ObjectBoundingMode);
    QColor topColor = color;
    topColor.setAlpha(110);
    QColor bottomColor = color;
    bottomColor.setAlpha(0);
    fill.setColorAt(0, topColor);
    fill.setColorAt(1, bottomColor);
    area->setBrush(fill);
    chart->addSeries(area);

    auto* xAxis = new QDateTimeAxis;
    xAxis->setFormat(points.size() > 120 ? "MMM yyyy" : "dd MMM");
    xAxis->setTickCount(std::min<int>(7, static_cast<int>(points.size())));
    styleAxis(xAxis);
    auto* yAxis = new QValueAxis;
    yAxis->setRange(bottom, top);
    yAxis->setTickCount(5);
    yAxis->setLabelFormat(top >= 100 ? "$%.0f" : top >= 1 ? "$%.2f" : "$%.4f");
    styleAxis(yAxis);

    chart->addAxis(xAxis, Qt::AlignBottom);
    chart->addAxis(yAxis, Qt::AlignLeft);
    area->attachAxis(xAxis);
    area->attachAxis(yAxis);
    replaceChart(view, chart);
}

void showDoughnut(QChartView* view, const QList<QPair<QString, double>>& slices) {
    static const QColor palette[] = {QColor("#6366f1"), QColor("#22c55e"), QColor("#f59e0b"),
                                     QColor("#06b6d4"), QColor("#ec4899"), QColor("#a855f7"),
                                     QColor("#84cc16"), QColor("#f97316"), QColor("#64748b")};
    QChart* chart = baseChart();
    double total = 0;
    for (const auto& s : slices) total += s.second;
    if (total <= 0) {
        chart->setTitle("Nothing to show yet");
        replaceChart(view, chart);
        return;
    }

    auto* series = new QPieSeries;
    series->setHoleSize(0.58);
    int i = 0;
    for (const auto& [label, value] : slices) {
        if (value <= 0) continue;
        QPieSlice* slice = series->append(
            QString("%1  %2%").arg(label).arg(value / total * 100.0, 0, 'f', 1), value);
        slice->setColor(palette[i++ % (sizeof palette / sizeof palette[0])]);
        slice->setBorderColor(Fmt::Colors::Panel);
        slice->setBorderWidth(2);
    }
    chart->addSeries(series);
    chart->legend()->show();
    chart->legend()->setAlignment(Qt::AlignRight);
    chart->legend()->setLabelColor(Fmt::Colors::Text);
    replaceChart(view, chart);
}

}  // namespace Charts
