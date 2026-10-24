#pragma once

#include <QFrame>

class QLabel;

// A rounded "card" showing a title, a big number and a small coloured note.
class StatCard : public QFrame {
    Q_OBJECT
public:
    explicit StatCard(const QString& title, QWidget* parent = nullptr);

    void setValue(const QString& value);
    void setNote(const QString& note, const QColor& color);

private:
    QLabel* value_;
    QLabel* note_;
};
