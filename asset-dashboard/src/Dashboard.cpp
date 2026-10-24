#include "Dashboard.h"

#include "ConsoleUI.h"
#include "Exceptions.h"
#include "Storage.h"

#include <algorithm>
#include <cctype>
#include <iostream>

using namespace ConsoleUI;

namespace {
constexpr int kAllTime = 1000000;  // "period" meaning the whole history
}

Dashboard::Dashboard(Market& market, User& user, std::string saveFile)
    : market_(market), user_(user), saveFile_(std::move(saveFile)) {}

void Dashboard::run() {
    while (true) {
        Portfolio& p = user_.getPortfolio();
        p.recordValue(market_);

        clearScreen();
        printTitle("ASSET MANAGEMENT DASHBOARD");
        std::cout << "  User: " << colored(user_.getName(), Color::Bold)
                  << "    Day: " << market_.getDay()
                  << "    Cash: " << money(p.getCash())
                  << "    Net worth: " << colored(money(p.totalValue(market_)), Color::Bold)
                  << "\n";
        printLine();
        std::cout << "   1. Overview                     7. Portfolio performance\n"
                     "   2. Market prices                8. Transaction history\n"
                     "   3. Buy asset                    9. Manage assets & cash\n"
                     "   4. Sell asset                  10. Simulate next day(s)\n"
                     "   5. My holdings                 11. Save\n"
                     "   6. Asset performance            0. Save & exit\n";
        printLine();

        switch (readInt("Choose an option: ", 0, 11)) {
            case 1: showOverview(); break;
            case 2: showMarket(); break;
            case 3: buyAsset(); break;
            case 4: sellAsset(); break;
            case 5: showHoldings(); break;
            case 6: showAssetPerformance(); break;
            case 7: showPortfolioPerformance(); break;
            case 8: showTransactions(); break;
            case 9: manageAssets(); break;
            case 10: simulateDays(); break;
            case 11: save(); pause(); break;
            case 0: save(); std::cout << "Goodbye!\n"; return;
        }
    }
}

// ---------------------------------------------------------------- Overview

void Dashboard::showOverview() {
    const Portfolio& p = user_.getPortfolio();
    printTitle("OVERVIEW  (Day " + std::to_string(market_.getDay()) + ")");

    double unrealized = p.unrealizedProfit(market_);
    std::cout << "  Cash balance        : " << money(p.getCash()) << "\n"
              << "  Invested (market)   : " << money(p.holdingsValue(market_)) << "\n"
              << "  Total net worth     : " << colored(money(p.totalValue(market_)), Color::Bold) << "\n"
              << "  Unrealized P/L      : " << gainColored(signedMoney(unrealized), unrealized) << "\n"
              << "  Realized P/L        : "
              << gainColored(signedMoney(p.getRealizedProfit()), p.getRealizedProfit()) << "\n";

    const auto& history = p.getValueHistory();
    if (history.size() >= 2) {
        double change = history.back().second - history[history.size() - 2].second;
        std::cout << "  Change since last day: " << gainColored(signedMoney(change), change) << "\n";
    }

    // Biggest movers today across the whole market.
    const auto& assets = market_.getAssets();
    if (!assets.empty()) {
        auto byChange = [](const auto& a, const auto& b) {
            return a->percentChangeOver(1) < b->percentChangeOver(1);
        };
        const Asset& best = **std::max_element(assets.begin(), assets.end(), byChange);
        const Asset& worst = **std::min_element(assets.begin(), assets.end(), byChange);
        std::cout << "\n  Top gainer today : " << padRight(best.getSymbol(), 6)
                  << gainColored(percent(best.percentChangeOver(1)), best.changeOver(1)) << "\n"
                  << "  Top loser today  : " << padRight(worst.getSymbol(), 6)
                  << gainColored(percent(worst.percentChangeOver(1)), worst.changeOver(1)) << "\n";
    }

    std::cout << "\n  You hold " << p.getHoldings().size() << " different asset(s) and have made "
              << p.getTransactions().size() << " transaction(s).\n";
    pause();
}

// ---------------------------------------------------------------- Market

void Dashboard::showMarket() {
    printTitle("MARKET PRICES  (Day " + std::to_string(market_.getDay()) + ")");
    std::cout << "  " << padRight("SYMBOL", 7) << padRight("NAME", 18) << padRight("TYPE", 11)
              << padLeft("PRICE", 13) << padLeft("1 DAY", 10) << padLeft("7 DAYS", 10)
              << padLeft("30 DAYS", 10) << "\n";
    printLine();
    for (const auto& a : market_.getAssets()) {
        std::cout << "  " << padRight(a->getSymbol(), 7) << padRight(a->getName().substr(0, 17), 18)
                  << padRight(a->getType(), 11) << padLeft(money(a->getCurrentPrice()), 13);
        for (int days : {1, 7, 30})
            std::cout << gainColored(padLeft(percent(a->percentChangeOver(days)), 10),
                                     a->changeOver(days));
        std::cout << "\n";
    }
    pause();
}

// ---------------------------------------------------------------- Trading

std::string Dashboard::askSymbol(const std::string& prompt) {
    std::string symbol = readLine(prompt);
    std::transform(symbol.begin(), symbol.end(), symbol.begin(),
                   [](unsigned char c) { return static_cast<char>(std::toupper(c)); });
    return symbol;
}

void Dashboard::buyAsset() {
    printTitle("BUY ASSET");
    std::cout << "  Available: ";
    for (const auto& a : market_.getAssets())
        std::cout << a->getSymbol() << " (" << money(a->getCurrentPrice()) << ")  ";
    std::cout << "\n  Cash available: " << money(user_.getPortfolio().getCash()) << "\n\n";

    try {
        Asset& asset = market_.get(askSymbol("Symbol to buy: "));
        std::cout << "  " << asset.getName() << " - " << asset.getDetails()
                  << (asset.allowsFractional() ? "" : "  (whole units only)") << "\n";
        double maxAffordable = user_.getPortfolio().getCash() / asset.getCurrentPrice();
        std::cout << "  You can afford up to " << number(maxAffordable) << " unit(s).\n";

        double quantity = readDouble("Quantity: ", 0);
        user_.getPortfolio().validateQuantity(asset, quantity);
        double cost = quantity * asset.getCurrentPrice();
        if (confirm("  Buy " + number(quantity) + " " + asset.getSymbol() + " for " + money(cost) + "?")) {
            user_.getPortfolio().buy(asset, quantity, market_.getDay());
            std::cout << colored("  Purchase complete!\n", Color::Green);
        } else {
            std::cout << "  Cancelled.\n";
        }
    } catch (const std::exception& e) {
        std::cout << colored(std::string("  Error: ") + e.what() + "\n", Color::Red);
    }
    pause();
}

void Dashboard::sellAsset() {
    printTitle("SELL ASSET");
    const Portfolio& p = user_.getPortfolio();
    if (p.getHoldings().empty()) {
        std::cout << "  You don't own any assets yet.\n";
        pause();
        return;
    }
    for (const auto& [symbol, h] : p.getHoldings()) {
        const Asset* a = market_.find(symbol);
        std::cout << "  " << padRight(symbol, 7) << "owned: " << padRight(number(h.quantity), 12)
                  << "price now: " << (a ? money(a->getCurrentPrice()) : "n/a") << "\n";
    }
    std::cout << "\n";

    try {
        Asset& asset = market_.get(askSymbol("Symbol to sell: "));
        if (p.getQuantity(asset.getSymbol()) <= 0)
            throw TradeException("You don't own any " + asset.getSymbol());
        double quantity = readDouble("Quantity (owned " + number(p.getQuantity(asset.getSymbol())) + "): ", 0);
        p.validateQuantity(asset, quantity);
        double proceeds = quantity * asset.getCurrentPrice();
        if (confirm("  Sell " + number(quantity) + " " + asset.getSymbol() + " for " + money(proceeds) + "?")) {
            double before = p.getRealizedProfit();
            user_.getPortfolio().sell(asset, quantity, market_.getDay());
            double profit = p.getRealizedProfit() - before;
            std::cout << colored("  Sale complete! ", Color::Green)
                      << "Profit on this sale: " << gainColored(signedMoney(profit), profit) << "\n";
        } else {
            std::cout << "  Cancelled.\n";
        }
    } catch (const std::exception& e) {
        std::cout << colored(std::string("  Error: ") + e.what() + "\n", Color::Red);
    }
    pause();
}

// ---------------------------------------------------------------- Holdings

void Dashboard::showHoldings() {
    const Portfolio& p = user_.getPortfolio();
    printTitle("MY HOLDINGS");
    if (p.getHoldings().empty()) {
        std::cout << "  No holdings yet. Use 'Buy asset' to get started.\n";
        pause();
        return;
    }

    double total = p.totalValue(market_);
    std::cout << "  " << padRight("SYMBOL", 7) << padLeft("QTY", 11) << padLeft("AVG COST", 13)
              << padLeft("PRICE", 13) << padLeft("VALUE", 14) << padLeft("P/L", 13)
              << padLeft("P/L %", 9) << padLeft("ALLOC", 8) << "\n";
    printLine(90);
    for (const auto& [symbol, h] : p.getHoldings()) {
        const Asset* a = market_.find(symbol);
        double price = a ? a->getCurrentPrice() : h.avgCost;
        double value = price * h.quantity;
        double pl = value - h.avgCost * h.quantity;
        double plPct = (price - h.avgCost) / h.avgCost * 100.0;
        std::cout << "  " << padRight(symbol, 7) << padLeft(number(h.quantity), 11)
                  << padLeft(money(h.avgCost), 13) << padLeft(money(price), 13)
                  << padLeft(money(value), 14) << gainColored(padLeft(signedMoney(pl), 13), pl)
                  << gainColored(padLeft(percent(plPct), 9), pl)
                  << padLeft(number(value / total * 100.0, 1) + "%", 8) << "\n";
    }
    printLine(90);
    double unrealized = p.unrealizedProfit(market_);
    std::cout << "  Holdings value: " << money(p.holdingsValue(market_))
              << "   Cash: " << money(p.getCash())
              << " (" << number(p.getCash() / total * 100.0, 1) << "%)"
              << "   Unrealized P/L: " << gainColored(signedMoney(unrealized), unrealized) << "\n";
    pause();
}

// ---------------------------------------------------------------- Performance

int Dashboard::askPeriod() {
    std::cout << "  Period:  1) Last 7 days   2) Last 30 days   3) Last 90 days   4) All time\n";
    switch (readInt("Choose period: ", 1, 4)) {
        case 1: return 7;
        case 2: return 30;
        case 3: return 90;
        default: return kAllTime;
    }
}

void Dashboard::showAssetPerformance() {
    printTitle("ASSET PERFORMANCE");
    std::cout << "  Symbols: ";
    for (const auto& a : market_.getAssets()) std::cout << a->getSymbol() << "  ";
    std::cout << "\n";

    try {
        const Asset& a = market_.get(askSymbol("Symbol: "));
        int days = std::min<int>(askPeriod(), static_cast<int>(a.getFullHistory().size()) - 1);

        double start = a.getPriceDaysAgo(days);
        double change = a.changeOver(days);
        printTitle(a.getSymbol() + " - " + a.getName() + " (" + a.getType() + ", " +
                   a.getDetails() + ")");
        std::cout << "  Period            : last " << days << " day(s)\n"
                  << "  Price at start    : " << money(start) << "\n"
                  << "  Price now         : " << money(a.getCurrentPrice()) << "\n"
                  << "  Change            : " << gainColored(signedMoney(change) + "  (" +
                                                 percent(a.percentChangeOver(days)) + ")", change) << "\n"
                  << "  Trend             : " << gainColored(trendLabel(change), change) << "\n"
                  << "  Highest / Lowest  : " << money(a.highOver(days)) << " / "
                  << money(a.lowOver(days)) << "\n";

        double owned = user_.getPortfolio().getQuantity(a.getSymbol());
        if (owned > 0) {
            double positionChange = owned * change;
            std::cout << "  Your " << number(owned) << " unit(s) changed by "
                      << gainColored(signedMoney(positionChange), positionChange)
                      << " in this period.\n";
        }
        std::cout << "\n";
        drawChart(a.getHistory(days));
    } catch (const std::exception& e) {
        std::cout << colored(std::string("  Error: ") + e.what() + "\n", Color::Red);
    }
    pause();
}

void Dashboard::showPortfolioPerformance() {
    printTitle("PORTFOLIO PERFORMANCE");
    int days = askPeriod();

    std::vector<double> values;
    int firstDay = market_.getDay() - days;
    for (const auto& [day, value] : user_.getPortfolio().getValueHistory())
        if (day >= firstDay) values.push_back(value);

    if (values.size() < 2) {
        std::cout << "  Not enough history yet. Simulate a few days (option 10) first.\n";
        pause();
        return;
    }

    double change = values.back() - values.front();
    double pct = change / values.front() * 100.0;
    std::cout << "\n  Value at start : " << money(values.front()) << "\n"
              << "  Value now      : " << money(values.back()) << "\n"
              << "  Change         : " << gainColored(signedMoney(change) + "  (" + percent(pct) + ")", change) << "\n"
              << "  Trend          : " << gainColored(trendLabel(change), change) << "\n"
              << "  Best / Worst   : " << money(*std::max_element(values.begin(), values.end()))
              << " / " << money(*std::min_element(values.begin(), values.end())) << "\n"
              << colored("  (Deposits and withdrawals also change this value.)\n", Color::Yellow)
              << "\n";
    drawChart(values);
    pause();
}

// ---------------------------------------------------------------- History

void Dashboard::showTransactions() {
    printTitle("TRANSACTION HISTORY");
    const auto& txs = user_.getPortfolio().getTransactions();
    if (txs.empty()) {
        std::cout << "  No transactions yet.\n";
        pause();
        return;
    }
    std::cout << "  " << padRight("DAY", 6) << padRight("TYPE", 10) << padRight("SYMBOL", 8)
              << padLeft("QUANTITY", 12) << padLeft("PRICE", 14) << padLeft("TOTAL", 15) << "\n";
    printLine();
    for (const Transaction& t : txs) {
        bool moneyIn = t.getType() == TransactionType::Sell || t.getType() == TransactionType::Deposit;
        std::cout << "  " << padRight(std::to_string(t.getDay()), 6)
                  << colored(padRight(t.typeName(), 10), moneyIn ? Color::Green : Color::Red)
                  << padRight(t.getSymbol(), 8) << padLeft(number(t.getQuantity()), 12)
                  << padLeft(money(t.getPrice()), 14) << padLeft(money(t.getTotal()), 15) << "\n";
    }
    pause();
}

// ---------------------------------------------------------------- Manage

void Dashboard::manageAssets() {
    while (true) {
        printTitle("MANAGE ASSETS & CASH");
        std::cout << "   1. Add a new asset to the market\n"
                     "   2. Remove an asset from the market\n"
                     "   3. Update an asset's price manually\n"
                     "   4. Deposit cash\n"
                     "   5. Withdraw cash\n"
                     "   0. Back\n";
        switch (readInt("Choose an option: ", 0, 5)) {
            case 1: addNewAsset(); break;
            case 2: removeAsset(); break;
            case 3: updateAssetPrice(); break;
            case 4: depositCash(); break;
            case 5: withdrawCash(); break;
            case 0: return;
        }
        user_.getPortfolio().recordValue(market_);
        pause();
    }
}

void Dashboard::addNewAsset() {
    std::cout << "  Type:  1) Stock   2) Crypto   3) Commodity\n";
    int typeChoice = readInt("Choose type: ", 1, 3);
    const std::string types[] = {"Stock", "Crypto", "Commodity"};
    const std::string extras[] = {"Sector (e.g. Technology): ", "Network (e.g. Ethereum): ",
                                  "Unit (e.g. barrel): "};
    const double defaultVolatility[] = {0.015, 0.04, 0.008};

    std::string symbol = askSymbol("Symbol (e.g. NVDA): ");
    if (symbol.empty() || symbol.find('|') != std::string::npos || symbol.size() > 6) {
        std::cout << colored("  Symbol must be 1-6 characters and cannot contain '|'.\n", Color::Red);
        return;
    }
    auto clean = [](std::string s) {
        std::replace(s.begin(), s.end(), '|', '/');  // '|' is used by the save file
        return s;
    };
    std::string name = clean(readLine("Full name: "));
    std::string extra = clean(readLine(extras[typeChoice - 1]));
    double price = readDouble("Current price ($): ", 0.01);
    std::cout << "  Volatility = typical daily move. Default for this type is "
              << number(defaultVolatility[typeChoice - 1] * 100, 2) << "%.\n";
    double volatilityPct = readDouble("Daily volatility in % (0 for default): ", 0);
    double volatility = volatilityPct == 0 ? defaultVolatility[typeChoice - 1] : volatilityPct / 100.0;

    try {
        market_.addAsset(Market::createAsset(types[typeChoice - 1], symbol,
                                             name.empty() ? symbol : name, price, volatility, extra));
        std::cout << colored("  " + symbol + " added to the market.\n", Color::Green);
    } catch (const std::exception& e) {
        std::cout << colored(std::string("  Error: ") + e.what() + "\n", Color::Red);
    }
}

void Dashboard::removeAsset() {
    std::string symbol = askSymbol("Symbol to remove: ");
    if (user_.getPortfolio().getQuantity(symbol) > 0) {
        std::cout << colored("  You still own " + symbol + ". Sell it first.\n", Color::Red);
        return;
    }
    if (!market_.find(symbol)) {
        std::cout << colored("  No asset called " + symbol + ".\n", Color::Red);
        return;
    }
    if (confirm("  Remove " + symbol + " and its price history?")) {
        market_.removeAsset(symbol);
        std::cout << colored("  " + symbol + " removed.\n", Color::Green);
    }
}

void Dashboard::updateAssetPrice() {
    try {
        Asset& asset = market_.get(askSymbol("Symbol: "));
        std::cout << "  Current price: " << money(asset.getCurrentPrice()) << "\n";
        asset.setCurrentPrice(readDouble("New price ($): ", 0.01));
        std::cout << colored("  Price updated.\n", Color::Green);
    } catch (const std::exception& e) {
        std::cout << colored(std::string("  Error: ") + e.what() + "\n", Color::Red);
    }
}

void Dashboard::depositCash() {
    try {
        user_.getPortfolio().deposit(readDouble("Amount to deposit ($): ", 0.01), market_.getDay());
        std::cout << colored("  Deposited. New balance: " + money(user_.getPortfolio().getCash()) + "\n",
                             Color::Green);
    } catch (const std::exception& e) {
        std::cout << colored(std::string("  Error: ") + e.what() + "\n", Color::Red);
    }
}

void Dashboard::withdrawCash() {
    try {
        std::cout << "  Cash available: " << money(user_.getPortfolio().getCash()) << "\n";
        user_.getPortfolio().withdraw(readDouble("Amount to withdraw ($): ", 0.01), market_.getDay());
        std::cout << colored("  Withdrawn. New balance: " + money(user_.getPortfolio().getCash()) + "\n",
                             Color::Green);
    } catch (const std::exception& e) {
        std::cout << colored(std::string("  Error: ") + e.what() + "\n", Color::Red);
    }
}

// ---------------------------------------------------------------- Simulation

void Dashboard::simulateDays() {
    printTitle("SIMULATE MARKET");
    int days = readInt("How many days to move forward (1-365)? ", 1, 365);
    Portfolio& p = user_.getPortfolio();
    double before = p.totalValue(market_);

    for (int i = 0; i < days; ++i) {
        market_.advanceDay();
        p.recordValue(market_);
    }

    double change = p.totalValue(market_) - before;
    std::cout << "\n  Moved forward " << days << " day(s). It is now day " << market_.getDay() << ".\n"
              << "  Your net worth changed by " << gainColored(signedMoney(change), change) << "\n\n";
    for (const auto& a : market_.getAssets())
        std::cout << "  " << padRight(a->getSymbol(), 7) << padLeft(money(a->getCurrentPrice()), 13)
                  << gainColored(padLeft(percent(a->percentChangeOver(days)), 10), a->changeOver(days))
                  << "  " << gainColored(trendLabel(a->changeOver(days)), a->changeOver(days)) << "\n";
    pause();
}

void Dashboard::save() {
    if (Storage::save(saveFile_, market_, user_))
        std::cout << colored("  Saved to " + saveFile_ + "\n", Color::Green);
    else
        std::cout << colored("  Could not save to " + saveFile_ + "\n", Color::Red);
}
