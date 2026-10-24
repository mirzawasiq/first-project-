#include "Format.h"

#include <QComboBox>
#include <QDate>
#include <QHeaderView>
#include <QLocale>
#include <QTableWidget>

#include <cmath>

namespace Fmt {

QString money(double value) {
    double absValue = std::fabs(value);
    int decimals = absValue != 0 && absValue < 1 ? 4 : 2;
    QString text = QLocale(QLocale::English).toString(absValue, 'f', decimals);
    return (value < 0 ? "-$" : "$") + text;
}

QString signedMoney(double value) {
    return (value > 0 ? "+" : "") + money(value);
}

QString percent(double value) {
    return (value > 0 ? "+" : "") + QString::number(value, 'f', 2) + "%";
}

QString quantity(double value) {
    QString text = QString::number(value, 'f', 6);
    while (text.contains('.') && (text.endsWith('0') || text.endsWith('.'))) text.chop(1);
    return text;
}

QString date(Day day) {
    return QDate(1970, 1, 1).addDays(day).toString("dd MMM yyyy");
}

QColor changeColor(double change) {
    if (change > 0) return Colors::Green;
    if (change < 0) return Colors::Red;
    return Colors::Muted;
}

QString arrow(double change) {
    if (change > 0) return QString(QChar(0x25B2));  // up triangle
    if (change < 0) return QString(QChar(0x25BC));  // down triangle
    return QString(QChar(0x2022));                  // bullet
}

QString trendText(double change) {
    if (change > 0) return "Increasing";
    if (change < 0) return "Decreasing";
    return "No change";
}

QString qs(const std::string& text) {
    return QString::fromStdString(text);
}

QTableWidget* makeTable(const QStringList& headers, QWidget* parent) {
    auto* table = new QTableWidget(0, headers.size(), parent);
    table->setHorizontalHeaderLabels(headers);
    table->setEditTriggers(QAbstractItemView::NoEditTriggers);
    table->setSelectionBehavior(QAbstractItemView::SelectRows);
    table->setSelectionMode(QAbstractItemView::SingleSelection);
    table->setAlternatingRowColors(true);
    table->setShowGrid(false);
    table->setFocusPolicy(Qt::NoFocus);
    table->verticalHeader()->setVisible(false);
    table->verticalHeader()->setDefaultSectionSize(40);
    table->horizontalHeader()->setHighlightSections(false);
    table->horizontalHeader()->setSectionResizeMode(QHeaderView::Stretch);
    table->horizontalHeader()->setDefaultAlignment(Qt::AlignLeft | Qt::AlignVCenter);
    return table;
}

bool comboHasSymbols(const QComboBox* combo, const QStringList& symbols, int firstAssetRow) {
    if (combo->count() - firstAssetRow != symbols.size()) return false;
    for (int i = 0; i < symbols.size(); ++i)
        if (combo->itemData(i + firstAssetRow).toString() != symbols[i]) return false;
    return true;
}

SortItem::SortItem(const QString& text, double sortKey) : QTableWidgetItem(text) {
    setData(Qt::UserRole, sortKey);
}

bool SortItem::operator<(const QTableWidgetItem& other) const {
    return data(Qt::UserRole).toDouble() < other.data(Qt::UserRole).toDouble();
}

QTableWidgetItem* cell(const QString& text, const QColor& color) {
    auto* item = new QTableWidgetItem(text);
    if (color.isValid()) item->setForeground(color);
    return item;
}

QTableWidgetItem* numberCell(const QString& text, double sortKey, const QColor& color) {
    auto* item = new SortItem(text, sortKey);
    if (color.isValid()) item->setForeground(color);
    return item;
}

}  // namespace Fmt
