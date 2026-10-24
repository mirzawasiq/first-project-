#pragma once

#include <iomanip>
#include <sstream>
#include <stdexcept>
#include <string>

// Prints 0.05 instead of 0.050000, and 5187.41 instead of 5187.410000.
inline std::string formatAmount(double value) {
    std::ostringstream ss;
    ss << std::fixed << std::setprecision(4) << value;
    std::string s = ss.str();
    s.erase(s.find_last_not_of('0') + 1);
    if (s.back() == '.') s.pop_back();
    return s;
}

// Base class for every error caused by an invalid trade.
class TradeException : public std::runtime_error {
public:
    explicit TradeException(const std::string& message) : std::runtime_error(message) {}
};

class InsufficientFundsException : public TradeException {
public:
    InsufficientFundsException(double needed, double available)
        : TradeException("Not enough cash: need $" + formatAmount(needed) +
                         ", you have $" + formatAmount(available)) {}
};

class InsufficientHoldingsException : public TradeException {
public:
    InsufficientHoldingsException(const std::string& symbol, double owned)
        : TradeException("You only own " + formatAmount(owned) + " of " + symbol) {}
};

class AssetNotFoundException : public std::runtime_error {
public:
    explicit AssetNotFoundException(const std::string& symbol)
        : std::runtime_error("No asset with symbol '" + symbol + "'") {}
};
