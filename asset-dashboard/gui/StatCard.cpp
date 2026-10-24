#include "StatCard.h"

#include <QLabel>
#include <QVBoxLayout>

StatCard::StatCard(const QString& title, QWidget* parent) : QFrame(parent) {
    setObjectName("card");
    auto* layout = new QVBoxLayout(this);
    layout->setContentsMargins(18, 14, 18, 14);
    layout->setSpacing(4);

    auto* titleLabel = new QLabel(title.toUpper(), this);
    titleLabel->setObjectName("cardTitle");
    value_ = new QLabel("-", this);
    value_->setObjectName("cardValue");
    note_ = new QLabel(" ", this);
    note_->setObjectName("cardNote");

    layout->addWidget(titleLabel);
    layout->addWidget(value_);
    layout->addWidget(note_);
}

void StatCard::setValue(const QString& value) {
    value_->setText(value);
}

void StatCard::setNote(const QString& note, const QColor& color) {
    note_->setText(note);
    note_->setStyleSheet(QString("color: %1;").arg(color.name()));
}
