#pragma once

#include "Asset.h"
#include "Market.h"
#include "Transaction.h"

#include <map>
#include <string>
#include <utility>
#include <vector>

struct Holding {
    double quantity = 0;
    double avgCost = 0;  // average price paid per unit
};

// The user's cash, owned assets, trade history and value over time.
class Portfolio {
public:
    explicit Portfolio(double startingCash = 10000.0) : cash_(startingCash) {}

    void deposit(double amount, int day);
    void withdraw(double amount, int day);
    void buy(const Asset& asset, double quantity, int day);
    void sell(const Asset& asset, double quantity, int day);
    void validateQuantity(const Asset& asset, double quantity) const;  // throws TradeException

    double getCash() const { return cash_; }
    double getRealizedProfit() const { return realizedProfit_; }
    double getQuantity(const std::string& symbol) const;
    const std::map<std::string, Holding>& getHoldings() const { return holdings_; }
    const std::vector<Transaction>& getTransactions() const { return transactions_; }

    double holdingsValue(const Market& market) const;
    double totalValue(const Market& market) const;
    double costBasis() const;
    double unrealizedProfit(const Market& market) const;

    // Stores today's total value so we can chart it later. Calling it twice
    // on the same day just updates that day's value.
    void recordValue(const Market& market);
    const std::vector<std::pair<int, double>>& getValueHistory() const { return valueHistory_; }

    friend class Storage;  // allowed to restore private state from a file

private:
    double cash_;
    double realizedProfit_ = 0;
    std::map<std::string, Holding> holdings_;
    std::vector<Transaction> transactions_;
    std::vector<std::pair<int, double>> valueHistory_;  // (day, total value)
};
