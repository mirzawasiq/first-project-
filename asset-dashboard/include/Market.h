#pragma once

#include "Asset.h"

#include <memory>
#include <random>
#include <string>
#include <vector>

// Owns every tradable asset and moves the simulated clock forward.
class Market {
public:
    explicit Market(unsigned seed = std::random_device{}());

    void addAsset(std::unique_ptr<Asset> asset);
    bool removeAsset(const std::string& symbol);
    void clear();

    Asset* find(const std::string& symbol);
    const Asset* find(const std::string& symbol) const;
    Asset& get(const std::string& symbol);  // throws AssetNotFoundException

    const std::vector<std::unique_ptr<Asset>>& getAssets() const { return assets_; }

    int getDay() const { return day_; }
    void setDay(int day) { day_ = day; }
    void advanceDay();

    // Fills the market with sample assets and `historyDays` of past prices.
    void seedDefaultAssets(int historyDays);

    // Factory: builds the right subclass from its type name.
    static std::unique_ptr<Asset> createAsset(const std::string& type,
                                              const std::string& symbol,
                                              const std::string& name,
                                              double price, double volatility,
                                              const std::string& extra);

private:
    std::vector<std::unique_ptr<Asset>> assets_;
    int day_ = 0;
    std::mt19937 rng_;
};
