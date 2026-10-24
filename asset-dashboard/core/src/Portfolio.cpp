#include "Portfolio.h"

#include "Exceptions.h"

#include <algorithm>
#include <cmath>

namespace {
constexpr double kEpsilon = 1e-9;
}

void Portfolio::deposit(double amount, Day day) {
    if (amount <= 0) throw TradeException("Deposit amount must be positive");
    cash_ += amount;
    transactions_.emplace_back(TransactionType::Deposit, "CASH", amount, 1.0, day);
}

void Portfolio::withdraw(double amount, Day day) {
    if (amount <= 0) throw TradeException("Withdrawal amount must be positive");
    if (amount > cash_ + kEpsilon) throw InsufficientFundsException(amount, cash_);
    cash_ -= amount;
    transactions_.emplace_back(TransactionType::Withdraw, "CASH", amount, 1.0, day);
}

void Portfolio::validateQuantity(const Asset& asset, double quantity) const {
    if (quantity <= 0) throw TradeException("Quantity must be greater than zero");
    if (!asset.allowsFractional() && std::floor(quantity) != quantity)
        throw TradeException(asset.getType() + "s can only be traded in whole units");
    if (!asset.hasPrice()) throw TradeException(asset.getSymbol() + " has no price yet");
}

void Portfolio::buy(const Asset& asset, double quantity, Day day) {
    validateQuantity(asset, quantity);
    double price = asset.getCurrentPrice();
    double cost = price * quantity;
    if (cost > cash_ + kEpsilon) throw InsufficientFundsException(cost, cash_);

    Holding& h = holdings_[asset.getSymbol()];
    double newQuantity = h.quantity + quantity;
    h.avgCost = (h.avgCost * h.quantity + cost) / newQuantity;
    h.quantity = newQuantity;
    cash_ -= cost;
    transactions_.emplace_back(TransactionType::Buy, asset.getSymbol(), quantity, price, day);
}

void Portfolio::sell(const Asset& asset, double quantity, Day day) {
    validateQuantity(asset, quantity);
    auto it = holdings_.find(asset.getSymbol());
    double owned = it == holdings_.end() ? 0 : it->second.quantity;
    if (quantity > owned + kEpsilon)
        throw InsufficientHoldingsException(asset.getSymbol(), owned);

    double price = asset.getCurrentPrice();
    realizedProfit_ += (price - it->second.avgCost) * quantity;
    cash_ += price * quantity;
    it->second.quantity -= quantity;
    if (it->second.quantity < kEpsilon) holdings_.erase(it);
    transactions_.emplace_back(TransactionType::Sell, asset.getSymbol(), quantity, price, day);
}

double Portfolio::getQuantity(const std::string& symbol) const {
    auto it = holdings_.find(symbol);
    return it == holdings_.end() ? 0 : it->second.quantity;
}

double Portfolio::holdingsValue(const Market& market) const {
    double total = 0;
    for (const auto& [symbol, h] : holdings_) {
        const Asset* asset = market.find(symbol);
        bool priced = asset && asset->hasPrice();
        total += h.quantity * (priced ? asset->getCurrentPrice() : h.avgCost);
    }
    return total;
}

double Portfolio::totalValue(const Market& market) const {
    return cash_ + holdingsValue(market);
}

double Portfolio::costBasis() const {
    double total = 0;
    for (const auto& [symbol, h] : holdings_) total += h.quantity * h.avgCost;
    return total;
}

double Portfolio::unrealizedProfit(const Market& market) const {
    return holdingsValue(market) - costBasis();
}

double Portfolio::netContributions() const {
    double total = startingCash_;
    for (const Transaction& t : transactions_) {
        if (t.getType() == TransactionType::Deposit) total += t.getTotal();
        if (t.getType() == TransactionType::Withdraw) total -= t.getTotal();
    }
    return total;
}

double Portfolio::valueOn(Day day, const Market& market) const {
    double cash = startingCash_;
    std::map<std::string, double> quantities;
    std::map<std::string, double> lastTradePrice;  // fallback if an asset has no history

    for (const Transaction& t : transactions_) {
        if (t.getDay() > day) break;  // transactions are stored in date order
        switch (t.getType()) {
            case TransactionType::Buy:
                cash -= t.getTotal();
                quantities[t.getSymbol()] += t.getQuantity();
                break;
            case TransactionType::Sell:
                cash += t.getTotal();
                quantities[t.getSymbol()] -= t.getQuantity();
                break;
            case TransactionType::Deposit: cash += t.getTotal(); break;
            case TransactionType::Withdraw: cash -= t.getTotal(); break;
        }
        if (t.getSymbol() != "CASH") lastTradePrice[t.getSymbol()] = t.getPrice();
    }

    double value = cash;
    for (const auto& [symbol, quantity] : quantities) {
        if (quantity < kEpsilon) continue;
        const Asset* asset = market.find(symbol);
        value += quantity * (asset && asset->hasPrice() ? asset->priceOn(day)
                                                        : lastTradePrice[symbol]);
    }
    return value;
}

std::vector<PricePoint> Portfolio::valueHistory(int days, const Market& market) const {
    Day today = DateUtil::today();
    std::vector<PricePoint> points;
    for (Day d = std::max(today - days, openedOn_); d <= today; ++d)
        points.push_back({d, valueOn(d, market)});
    return points;
}
