#pragma once

#include "DateUtil.h"

#include <QColor>
#include <QString>
#include <QStringList>
#include <QTableWidgetItem>

class QComboBox;
class QTableWidget;

// Formatting and small widget helpers shared by all screens.
namespace Fmt {

namespace Colors {
const QColor Green(0x22, 0xc5, 0x5e);
const QColor Red(0xef, 0x44, 0x44);
const QColor Amber(0xf5, 0x9e, 0x0b);
const QColor Muted(0x94, 0xa3, 0xb8);
const QColor Text(0xe2, 0xe8, 0xf0);
const QColor Accent(0x63, 0x66, 0xf1);
const QColor Panel(0x11, 0x1a, 0x2e);
const QColor Grid(0x1f, 0x2a, 0x44);
}  // namespace Colors

QString money(double value);        // $12,345.67 (more decimals for tiny prices)
QString signedMoney(double value);  // +$12.50 / -$3.00
QString percent(double value);      // +4.20%
QString quantity(double value);     // 0.05, 12
QString date(Day day);              // 24 Oct 2026
QColor changeColor(double change);  // green up, red down, grey flat
QString arrow(double change);       // up/down triangle
QString trendText(double change);   // "Increasing" / "Decreasing" / "No change"
QString qs(const std::string& text);

// A read-only, row-selecting table with our standard look.
QTableWidget* makeTable(const QStringList& headers, QWidget* parent);

// True if `combo` (from item `firstAssetRow` on) already lists exactly these symbols,
// so it doesn't need rebuilding (rebuilding would close an open dropdown).
bool comboHasSymbols(const QComboBox* combo, const QStringList& symbols, int firstAssetRow = 0);

// Table cell that sorts by a number instead of by its text.
class SortItem : public QTableWidgetItem {
public:
    SortItem(const QString& text, double sortKey);
    bool operator<(const QTableWidgetItem& other) const override;
};

QTableWidgetItem* cell(const QString& text, const QColor& color = QColor());
QTableWidgetItem* numberCell(const QString& text, double sortKey, const QColor& color = QColor());

}  // namespace Fmt
