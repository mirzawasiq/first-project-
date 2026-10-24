#pragma once

#include "Asset.h"
#include "Portfolio.h"

#include <QDialog>

class QDoubleSpinBox;
class QLabel;
class QPushButton;

// Pop-up for buying or selling one asset. Quantity and dollar amount are
// linked: change one and the other updates.
class TradeDialog : public QDialog {
    Q_OBJECT
public:
    TradeDialog(const Asset& asset, Portfolio& portfolio, bool buy, QWidget* parent = nullptr);

private:
    void setMode(bool buy);
    void updateSummary();
    void setMax();
    void confirm();

    const Asset& asset_;
    Portfolio& portfolio_;
    bool buy_;
    bool syncing_ = false;

    QPushButton* buyTab_;
    QPushButton* sellTab_;
    QDoubleSpinBox* quantity_;
    QDoubleSpinBox* amount_;
    QLabel* summary_;
    QLabel* error_;
    QPushButton* confirm_;
};
