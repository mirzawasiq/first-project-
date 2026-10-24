#include "Portfolio.h"

#include "Exceptions.h"

#include <cmath>

namespace {
constexpr double kEpsilon = 1e-9;
}

void Portfolio::deposit(double amount, int day) {
    if (amount <= 0) throw TradeException("Deposit amount must be positive");
    cash_ += amount;
    transactions_.emplace_back(TransactionType::Deposit, "CASH", amount, 1.0, day);
}

void Portfolio::withdraw(double amount, int day) {
    if (amount <= 0) throw TradeException("Withdrawal amount must be positive");
    if (amount > cash_ + kEpsilon) throw InsufficientFundsException(amount, cash_);
    cash_ -= amount;
    transactions_.emplace_back(TransactionType::Withdraw, "CASH", amount, 1.0, day);
}

void Portfolio::validateQuantity(const Asset& asset, double quantity) const {
    if (quantity <= 0) throw TradeException("Quantity must be greater than zero");
    if (!asset.allowsFractional() && std::floor(quantity) != quantity)
        throw TradeException(asset.getType() + "s can only be traded in whole units");
}

void Portfolio::buy(const Asset& asset, double quantity, int day) {
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

void Portfolio::sell(const Asset& asset, double quantity, int day) {
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
        total += h.quantity * (asset ? asset->getCurrentPrice() : h.avgCost);
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

void Portfolio::recordValue(const Market& market) {
    double value = totalValue(market);
    if (!valueHistory_.empty() && valueHistory_.back().first == market.getDay())
        valueHistory_.back().second = value;
    else
        valueHistory_.emplace_back(market.getDay(), value);
}
