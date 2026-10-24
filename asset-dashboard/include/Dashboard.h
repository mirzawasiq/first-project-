#pragma once

#include "Market.h"
#include "User.h"

#include <string>

// The menu-driven screen the user interacts with. It only talks to the
// Market and the User's Portfolio through their public methods.
class Dashboard {
public:
    Dashboard(Market& market, User& user, std::string saveFile);
    void run();

private:
    void showOverview();
    void showMarket();
    void buyAsset();
    void sellAsset();
    void showHoldings();
    void showAssetPerformance();
    void showPortfolioPerformance();
    void showTransactions();
    void manageAssets();
    void simulateDays();
    void save();

    // Manage-assets sub actions
    void addNewAsset();
    void removeAsset();
    void updateAssetPrice();
    void depositCash();
    void withdrawCash();

    std::string askSymbol(const std::string& prompt);
    int askPeriod();

    Market& market_;
    User& user_;
    std::string saveFile_;
};
