#pragma once

#include "Asset.h"
#include "Market.h"
#include "Transaction.h"

#include <map>
#include <string>
#include <vector>

struct Holding {
    double quantity = 0;
    double avgCost = 0;  // average price paid per unit
};

// The user's cash, owned assets and trade history.
class Portfolio {
public:
    explicit Portfolio(double startingCash = 10000.0, Day openedOn = DateUtil::today())
        : startingCash_(startingCash), cash_(startingCash), openedOn_(openedOn) {}

    void deposit(double amount, Day day);
    void withdraw(double amount, Day day);
    void buy(const Asset& asset, double quantity, Day day);
    void sell(const Asset& asset, double quantity, Day day);
    void validateQuantity(const Asset& asset, double quantity) const;  // throws TradeException

    double getCash() const { return cash_; }
    double getStartingCash() const { return startingCash_; }
    Day getOpenedOn() const { return openedOn_; }
    double getRealizedProfit() const { return realizedProfit_; }
    double getQuantity(const std::string& symbol) const;
    const std::map<std::string, Holding>& getHoldings() const { return holdings_; }
    const std::vector<Transaction>& getTransactions() const { return transactions_; }

    double holdingsValue(const Market& market) const;
    double totalValue(const Market& market) const;
    double costBasis() const;
    double unrealizedProfit(const Market& market) const;
    // Money the user put in: starting cash + deposits - withdrawals.
    double netContributions() const;
    // Overall gain: what the account is worth minus the money put in.
    double totalProfit(const Market& market) const { return totalValue(market) - netContributions(); }

    // Rebuilds what the portfolio was worth at the end of a past day by
    // replaying the transactions up to that day at that day's prices.
    double valueOn(Day day, const Market& market) const;
    std::vector<PricePoint> valueHistory(int days, const Market& market) const;

    friend class Storage;  // allowed to restore private state from a file

private:
    double startingCash_;
    double cash_;
    Day openedOn_;
    double realizedProfit_ = 0;
    std::map<std::string, Holding> holdings_;
    std::vector<Transaction> transactions_;
};
