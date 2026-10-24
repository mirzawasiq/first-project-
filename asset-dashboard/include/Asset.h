#pragma once

#include <random>
#include <string>
#include <vector>

// Abstract base class for anything that can be bought and sold.
// Each asset keeps its own price history: index 0 is the oldest day,
// the last element is today's price.
class Asset {
public:
    Asset(std::string symbol, std::string name, double startPrice, double volatility);
    virtual ~Asset() = default;

    const std::string& getSymbol() const { return symbol_; }
    const std::string& getName() const { return name_; }
    double getVolatility() const { return volatility_; }

    double getCurrentPrice() const { return history_.back(); }
    double getPriceDaysAgo(int days) const;
    double changeOver(int days) const;         // absolute change in price
    double percentChangeOver(int days) const;  // change in %
    double highOver(int days) const;
    double lowOver(int days) const;

    // Last `days + 1` prices (or the whole history if it is shorter).
    std::vector<double> getHistory(int days) const;
    const std::vector<double>& getFullHistory() const { return history_; }
    void setHistory(std::vector<double> history);

    void setCurrentPrice(double price);         // manual price correction
    void simulateNextDay(std::mt19937& rng);    // random-walk to tomorrow

    // --- Polymorphic interface implemented by every asset class ---
    virtual std::string getType() const = 0;
    virtual std::string getExtra() const = 0;     // sector / network / unit
    virtual std::string getDetails() const = 0;   // human-readable extra info
    virtual double dailyDrift() const = 0;        // average daily growth
    virtual bool allowsFractional() const = 0;    // can you buy 0.5 units?

protected:
    std::string symbol_;
    std::string name_;
    double volatility_;
    std::vector<double> history_;
};
