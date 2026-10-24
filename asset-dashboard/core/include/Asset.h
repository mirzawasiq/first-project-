#pragma once

#include "DateUtil.h"

#include <map>
#include <random>
#include <string>
#include <vector>

struct PricePoint {
    Day day;
    double price;
};

// Abstract base class for anything that can be bought and sold.
// Price history is stored per calendar day: history_[day] = closing price.
// An asset with an apiId (a CoinGecko coin id such as "bitcoin") gets
// live prices; every other asset is simulated with a random walk.
class Asset {
public:
    Asset(std::string symbol, std::string name, double volatility, std::string apiId = "");
    virtual ~Asset() = default;

    const std::string& getSymbol() const { return symbol_; }
    const std::string& getName() const { return name_; }
    const std::string& getApiId() const { return apiId_; }
    double getVolatility() const { return volatility_; }
    bool isLive() const { return !apiId_.empty(); }

    bool hasPrice() const { return !history_.empty(); }
    double getCurrentPrice() const;  // throws if there is no price yet
    Day lastPriceDay() const;

    // Last known price on or before `day` (the first price if `day` is earlier).
    double priceOn(Day day) const;

    // All of these compare the latest price with the price `days` earlier.
    double changeOver(int days) const;
    double percentChangeOver(int days) const;
    double highOver(int days) const;
    double lowOver(int days) const;
    std::vector<PricePoint> historyOver(int days) const;

    const std::map<Day, double>& getHistory() const { return history_; }
    void setHistory(std::map<Day, double> history);
    void setPrice(Day day, double price);

    // Random-walk helpers for simulated assets.
    void simulateUntil(Day day, std::mt19937& rng);  // one step per missing day
    void simulateTick(std::mt19937& rng);            // small move of today's price

    // --- Polymorphic interface implemented by every asset class ---
    virtual std::string getType() const = 0;
    virtual std::string getExtra() const = 0;     // sector / network / unit
    virtual std::string getDetails() const = 0;   // human-readable extra info
    virtual double dailyDrift() const = 0;        // average daily growth
    virtual bool allowsFractional() const = 0;    // can you buy 0.5 units?

protected:
    double randomStep(double price, double scale, std::mt19937& rng) const;

    std::string symbol_;
    std::string name_;
    double volatility_;
    std::string apiId_;
    std::map<Day, double> history_;
};
