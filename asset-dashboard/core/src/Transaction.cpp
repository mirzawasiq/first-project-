#include "Transaction.h"

#include <stdexcept>

std::string Transaction::toString(TransactionType type) {
    switch (type) {
        case TransactionType::Buy: return "BUY";
        case TransactionType::Sell: return "SELL";
        case TransactionType::Deposit: return "DEPOSIT";
        case TransactionType::Withdraw: return "WITHDRAW";
    }
    return "UNKNOWN";
}

TransactionType Transaction::fromString(const std::string& text) {
    if (text == "BUY") return TransactionType::Buy;
    if (text == "SELL") return TransactionType::Sell;
    if (text == "DEPOSIT") return TransactionType::Deposit;
    if (text == "WITHDRAW") return TransactionType::Withdraw;
    throw std::invalid_argument("Unknown transaction type: " + text);
}
