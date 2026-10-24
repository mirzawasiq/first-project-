#include "MainWindow.h"

#include "CoinGeckoClient.h"
#include "DashboardPage.h"
#include "Format.h"
#include "ManagePage.h"
#include "MarketPage.h"
#include "PerformancePage.h"
#include "PortfolioPage.h"
#include "Storage.h"
#include "TradeDialog.h"
#include "TransactionsPage.h"

#include <QButtonGroup>
#include <QCloseEvent>
#include <QDateTime>
#include <QFile>
#include <QHBoxLayout>
#include <QLabel>
#include <QMessageBox>
#include <QPushButton>
#include <QSettings>
#include <QStackedWidget>
#include <QVBoxLayout>

namespace {
constexpr int kHistoryDays = 365;          // CoinGecko's free plan allows up to 1 year
constexpr int kRefreshMs = 60 * 1000;      // live prices every minute
constexpr int kTickMs = 5 * 1000;          // simulated prices every 5 seconds
const char* kApiKeySetting = "coingecko/apiKey";
}

MainWindow::MainWindow(const QString& username, const QString& dataDir, bool newAccount, QWidget* parent)
    : QMainWindow(parent),
      state_{Market(), User(username.toStdString()), {}},
      dataFile_(dataDir + "/" + username + ".dat") {
    setWindowTitle("Asset Dashboard - " + username);
    resize(1280, 800);
    setMinimumSize(1000, 660);

    loadOrCreateData(newAccount);

    // Set up the CoinGecko client. The base URL can be overridden with an
    // environment variable, which is handy for testing against a fake server.
    prices_ = new CoinGeckoClient(this);
    QSettings settings;
    prices_->setApiKey(settings.value(kApiKeySetting).toString());
    QString customUrl = qEnvironmentVariable("COINGECKO_BASE_URL");
    if (!customUrl.isEmpty()) prices_->setBaseUrl(customUrl);
    connect(prices_, &PriceProvider::pricesReceived, this, &MainWindow::onPricesReceived);
    connect(prices_, &PriceProvider::historyReceived, this, &MainWindow::onHistoryReceived);
    connect(prices_, &PriceProvider::requestFailed, this, &MainWindow::onRequestFailed);

    buildUi();

    connect(prices_, &PriceProvider::connectionTested, manage_, &ManagePage::showConnectionResult);
    connect(&refreshTimer_, &QTimer::timeout, this, [this]() { requestLivePrices(false); });
    connect(&tickTimer_, &QTimer::timeout, this, [this]() {
        state_.market.simulateUntil(DateUtil::today());  // in case midnight passed
        state_.market.simulateTick();
        refreshCurrentPage();
        updateHeader();
    });
    refreshTimer_.start(kRefreshMs);
    tickTimer_.start(kTickMs);

    setStatus("Connecting to CoinGecko...", Fmt::Colors::Amber);
    requestLivePrices(true);
    showPage(0);
}

// ---------------------------------------------------------------- data

void MainWindow::loadOrCreateData(bool newAccount) {
    Day today = DateUtil::today();
    bool loaded = false;
    if (!newAccount) {
        try {
            loaded = Storage::load(dataFile_.toStdString(), state_.market, state_.user);
        } catch (const std::exception& e) {
            QMessageBox::warning(this, "Could not load your data",
                                 QString("%1\n\nA fresh portfolio will be created. The old file "
                                         "is kept as a .bak copy.").arg(e.what()));
            QFile::remove(dataFile_ + ".bak");
            QFile::copy(dataFile_, dataFile_ + ".bak");
        }
    }
    if (loaded) {
        state_.market.simulateUntil(today);  // catch up simulated prices since last time
    } else {
        state_.user = User(state_.user.getUsername());
        state_.market.seedDefaultAssets(today, kHistoryDays);
        save();
    }
}

void MainWindow::save() {
    if (!Storage::save(dataFile_.toStdString(), state_.market, state_.user))
        setStatus("Could not save to " + dataFile_, Fmt::Colors::Red);
}

void MainWindow::closeEvent(QCloseEvent* event) {
    save();
    event->accept();
}

// ---------------------------------------------------------------- layout

void MainWindow::buildUi() {
    auto* central = new QWidget(this);
    central->setObjectName("content");
    auto* root = new QHBoxLayout(central);
    root->setContentsMargins(0, 0, 0, 0);
    root->setSpacing(0);
    root->addWidget(buildSidebar());

    auto* main = new QVBoxLayout;
    main->setContentsMargins(28, 22, 28, 22);
    main->setSpacing(18);

    auto* header = new QHBoxLayout;
    auto* titles = new QVBoxLayout;
    pageTitle_ = new QLabel(this);
    pageTitle_->setObjectName("pageTitle");
    status_ = new QLabel(this);
    titles->addWidget(pageTitle_);
    titles->addWidget(status_);
    header->addLayout(titles, 1);

    netWorth_ = new QLabel(this);
    netWorth_->setObjectName("headerWorth");
    netWorth_->setAlignment(Qt::AlignRight | Qt::AlignVCenter);
    auto* refresh = new QPushButton("Refresh prices", this);
    connect(refresh, &QPushButton::clicked, this, [this]() {
        setStatus("Refreshing...", Fmt::Colors::Amber);
        requestLivePrices(true);
    });
    header->addWidget(netWorth_);
    header->addSpacing(16);
    header->addWidget(refresh);
    main->addLayout(header);

    pages_ = new QStackedWidget(this);
    main->addWidget(pages_, 1);
    root->addLayout(main, 1);
    setCentralWidget(central);

    addPage(new DashboardPage(state_, this), "Dashboard");
    addPage(new MarketPage(state_, this), "Market");
    addPage(new PortfolioPage(state_, this), "My Portfolio");
    performance_ = new PerformancePage(state_, this);
    addPage(performance_, "Performance");
    addPage(new TransactionsPage(state_, this), "Transactions");
    manage_ = new ManagePage(state_, QSettings().value(kApiKeySetting).toString(), this);
    addPage(manage_, "Manage & Settings");

    connect(manage_, &ManagePage::apiKeySaved, this, [this](const QString& key) {
        QSettings().setValue(kApiKeySetting, key);
        prices_->setApiKey(key);
    });
    connect(manage_, &ManagePage::testConnectionRequested, prices_, &CoinGeckoClient::testConnection);
    connect(manage_, &ManagePage::liveAssetAdded, this, [this](const QString& symbol) {
        const Asset* asset = state_.market.find(symbol.toStdString());
        if (!asset) return;
        prices_->fetchHistory(Fmt::qs(asset->getApiId()), kHistoryDays);
        prices_->fetchCurrentPrices({Fmt::qs(asset->getApiId())});
    });
}

QWidget* MainWindow::buildSidebar() {
    auto* sidebar = new QWidget(this);
    sidebar->setObjectName("sidebar");
    sidebar->setFixedWidth(230);
    auto* layout = new QVBoxLayout(sidebar);
    layout->setContentsMargins(16, 24, 16, 20);
    layout->setSpacing(4);

    auto* title = new QLabel(QString(QChar(0x25C6)) + "  Asset Dashboard", sidebar);
    title->setObjectName("appTitle");
    layout->addWidget(title);
    layout->addSpacing(24);

    auto* navArea = new QWidget(sidebar);
    navArea->setObjectName("navArea");
    new QVBoxLayout(navArea);
    navArea->layout()->setContentsMargins(0, 0, 0, 0);
    navArea->layout()->setSpacing(4);
    layout->addWidget(navArea);
    layout->addStretch();

    auto* user = new QLabel("Signed in as\n" + Fmt::qs(state_.user.getUsername()), sidebar);
    user->setObjectName("muted");
    auto* logout = new QPushButton("Log out", sidebar);
    connect(logout, &QPushButton::clicked, this, [this]() {
        loggedOut_ = true;
        close();
    });
    layout->addWidget(user);
    layout->addSpacing(8);
    layout->addWidget(logout);
    return sidebar;
}

void MainWindow::addPage(Page* page, const QString& navText) {
    int index = pageList_.size();
    pageList_.append(page);
    pages_->addWidget(page);

    auto* button = new QPushButton(QString(navText).replace("&", "&&"), this);
    button->setObjectName("navButton");
    button->setCheckable(true);
    button->setCursor(Qt::PointingHandCursor);
    findChild<QWidget*>("navArea")->layout()->addWidget(button);
    navButtons_.append(button);
    connect(button, &QPushButton::clicked, this, [this, index]() { showPage(index); });

    connect(page, &Page::tradeRequested, this, &MainWindow::openTrade);
    connect(page, &Page::stateChanged, this, [this]() {
        save();
        refreshCurrentPage();
        updateHeader();
    });
}

void MainWindow::showPage(int index) {
    pages_->setCurrentIndex(index);
    for (int i = 0; i < navButtons_.size(); ++i) navButtons_[i]->setChecked(i == index);
    pageTitle_->setText(pageList_[index]->title());
    refreshCurrentPage();
    updateHeader();
}

void MainWindow::refreshCurrentPage() {
    if (auto* page = qobject_cast<Page*>(pages_->currentWidget())) page->refresh();
}

void MainWindow::updateHeader() {
    const Portfolio& p = state_.user.getPortfolio();
    double profit = p.totalProfit(state_.market);
    netWorth_->setText(QString("<span style='color:#94a3b8;font-size:9pt'>NET WORTH</span><br>"
                               "<b>%1</b>  <span style='color:%2;font-size:10pt'>%3 %4</span>")
                           .arg(Fmt::money(p.totalValue(state_.market)), Fmt::changeColor(profit).name(),
                                Fmt::arrow(profit), Fmt::signedMoney(profit)));
}

// ---------------------------------------------------------------- trading

void MainWindow::openTrade(const QString& symbol, bool buy) {
    if (symbol.isEmpty()) {
        QMessageBox::information(this, "Pick an asset", "Select an asset in the table first.");
        return;
    }
    Asset* asset = state_.market.find(symbol.toStdString());
    if (!asset) return;
    if (!state_.canTrade(*asset)) {
        QMessageBox::information(this, "Live price not loaded",
                                 "The live price for " + symbol + " hasn't arrived from CoinGecko yet.\n\n"
                                 "Check your internet connection (and API key under Manage & Settings), "
                                 "then press \"Refresh prices\".");
        return;
    }
    TradeDialog dialog(*asset, state_.user.getPortfolio(), buy, this);
    refreshTimer_.stop();  // keep the price still while the user decides
    tickTimer_.stop();
    int result = dialog.exec();
    refreshTimer_.start();
    tickTimer_.start();
    if (result == QDialog::Accepted) {
        save();
        refreshCurrentPage();
        updateHeader();
    }
}

// ---------------------------------------------------------------- live prices

void MainWindow::requestLivePrices(bool includeHistory) {
    QStringList ids;
    Day today = DateUtil::today();
    for (const auto& a : state_.market.getAssets()) {
        if (!a->isLive()) continue;
        ids << Fmt::qs(a->getApiId());
        // Only download history when ours is missing or has a gap.
        bool needsHistory = !a->hasPrice() || a->getHistory().size() < 30 || a->lastPriceDay() < today - 1;
        if (includeHistory && needsHistory) prices_->fetchHistory(Fmt::qs(a->getApiId()), kHistoryDays);
    }
    prices_->fetchCurrentPrices(ids);
}

void MainWindow::onPricesReceived(const QMap<QString, double>& prices) {
    Day today = DateUtil::today();
    for (auto it = prices.begin(); it != prices.end(); ++it) {
        Asset* asset = state_.market.findByApiId(it.key().toStdString());
        if (!asset) continue;
        asset->setPrice(today, it.value());
        state_.freshLive.insert(Fmt::qs(asset->getSymbol()));
    }
    setStatus(QString("%1  Live prices from CoinGecko - updated %2")
                  .arg(QChar(0x25CF)).arg(QDateTime::currentDateTime().toString("hh:mm:ss")),
              Fmt::Colors::Green);
    save();
    refreshCurrentPage();
    updateHeader();
}

void MainWindow::onHistoryReceived(const QString& id, const QList<QPointF>& points) {
    Asset* asset = state_.market.findByApiId(id.toStdString());
    if (!asset) return;
    // CoinGecko gives [time in ms, price]; keep the last price of each day.
    std::map<Day, double> history;
    for (const QPointF& p : points) history[DateUtil::fromUnixMillis(static_cast<long long>(p.x()))] = p.y();
    // Keep today's live price if we already have a newer one.
    if (asset->hasPrice() && asset->lastPriceDay() == DateUtil::today() && state_.isFresh(*asset))
        history[DateUtil::today()] = asset->getCurrentPrice();
    asset->setHistory(std::move(history));
    save();
    refreshCurrentPage();
    updateHeader();
}

void MainWindow::onRequestFailed(const QString& message) {
    bool anyFresh = !state_.freshLive.isEmpty();
    setStatus(QString("%1  %2%3").arg(QChar(0x25CF)).arg(message)
                  .arg(anyFresh ? "" : "  (showing last saved prices)"),
              anyFresh ? Fmt::Colors::Amber : Fmt::Colors::Red);
}

void MainWindow::setStatus(const QString& text, const QColor& color) {
    status_->setText(text);
    status_->setStyleSheet("color: " + color.name() + ";");
}
