#pragma once

#include "Page.h"

class QComboBox;
class QDoubleSpinBox;
class QLabel;
class QLineEdit;

// Manage cash, add/remove assets and set up the CoinGecko API key.
class ManagePage : public Page {
    Q_OBJECT
public:
    explicit ManagePage(AppState& state, const QString& apiKey, QWidget* parent = nullptr);
    QString title() const override { return "Manage & Settings"; }
    void refresh() override;

public slots:
    void showConnectionResult(bool ok, const QString& message);

signals:
    void liveAssetAdded(const QString& symbol);  // needs its price fetched
    void apiKeySaved(const QString& key);
    void testConnectionRequested();

private:
    QWidget* buildCashBox();
    QWidget* buildAddAssetBox();
    QWidget* buildRemoveBox();
    QWidget* buildApiBox(const QString& apiKey);
    void addAsset();
    void setMessage(QLabel* label, const QString& text, bool ok);

    // cash
    QDoubleSpinBox* cashAmount_;
    QLabel* cashMessage_;
    // add asset
    QComboBox* assetType_;
    QLineEdit* symbol_;
    QLineEdit* name_;
    QLineEdit* extra_;
    QLineEdit* apiId_;
    QDoubleSpinBox* startPrice_;
    QDoubleSpinBox* volatility_;
    QLabel* addMessage_;
    // remove
    QComboBox* removeChoice_;
    QLabel* removeMessage_;
    // api
    QLineEdit* apiKey_;
    QLabel* apiMessage_;
};
