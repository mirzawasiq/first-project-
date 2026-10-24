#pragma once

#include "AppState.h"

#include <QList>
#include <QMainWindow>
#include <QMap>
#include <QPointF>
#include <QTimer>

class CoinGeckoClient;
class ManagePage;
class Page;
class PerformancePage;
class QLabel;
class QPushButton;
class QStackedWidget;

// The main application window: sidebar navigation, a header with the
// net worth and live-price status, and one Page per screen.
class MainWindow : public QMainWindow {
    Q_OBJECT
public:
    MainWindow(const QString& username, const QString& dataDir, bool newAccount,
               QWidget* parent = nullptr);

    bool loggedOut() const { return loggedOut_; }

protected:
    void closeEvent(QCloseEvent* event) override;

private:
    void buildUi();
    QWidget* buildSidebar();
    void addPage(Page* page, const QString& navText);
    void showPage(int index);

    void loadOrCreateData(bool newAccount);
    void save();
    void refreshCurrentPage();
    void updateHeader();

    // --- live prices (CoinGecko) ---
    void requestLivePrices(bool includeHistory);
    void onPricesReceived(const QMap<QString, double>& prices);
    void onHistoryReceived(const QString& id, const QList<QPointF>& points);
    void onRequestFailed(const QString& message);
    void setStatus(const QString& text, const QColor& color);

    void openTrade(const QString& symbol, bool buy);

    AppState state_;
    QString dataFile_;
    bool loggedOut_ = false;

    CoinGeckoClient* prices_;
    QTimer refreshTimer_;  // fetches live prices every minute
    QTimer tickTimer_;     // nudges simulated prices every few seconds

    QStackedWidget* pages_;
    QList<Page*> pageList_;
    QList<QPushButton*> navButtons_;
    PerformancePage* performance_;
    ManagePage* manage_;
    QLabel* pageTitle_;
    QLabel* netWorth_;
    QLabel* status_;
};
