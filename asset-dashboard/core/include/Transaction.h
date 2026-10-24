#pragma once

#include "DateUtil.h"

#include <string>

enum class TransactionType { Buy, Sell, Deposit, Withdraw };

// One immutable record in the user's trade history.
class Transaction {
public:
    Transaction(TransactionType type, std::string symbol, double quantity,
                double price, Day day)
        : type_(type), symbol_(std::move(symbol)), quantity_(quantity),
          price_(price), day_(day) {}

    TransactionType getType() const { return type_; }
    const std::string& getSymbol() const { return symbol_; }
    double getQuantity() const { return quantity_; }
    double getPrice() const { return price_; }
    Day getDay() const { return day_; }
    double getTotal() const { return quantity_ * price_; }

    std::string typeName() const { return toString(type_); }

    static std::string toString(TransactionType type);
    static TransactionType fromString(const std::string& text);

private:
    TransactionType type_;
    std::string symbol_;
    double quantity_;
    double price_;
    Day day_;
};
