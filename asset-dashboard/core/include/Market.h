#pragma once

#include "Asset.h"

#include <memory>
#include <random>
#include <string>
#include <vector>

// Owns every tradable asset and moves simulated prices forward.
class Market {
public:
    explicit Market(unsigned seed = std::random_device{}());

    void addAsset(std::unique_ptr<Asset> asset);
    bool removeAsset(const std::string& symbol);
    void clear() { assets_.clear(); }

    Asset* find(const std::string& symbol);
    const Asset* find(const std::string& symbol) const;
    Asset& get(const std::string& symbol);  // throws AssetNotFoundException
    Asset* findByApiId(const std::string& apiId);

    const std::vector<std::unique_ptr<Asset>>& getAssets() const { return assets_; }
    std::vector<std::string> liveApiIds() const;

    // Simulated (non-live) assets get one random step per missing day.
    void simulateUntil(Day day);
    // Small intraday move for simulated assets so the screen feels alive.
    void simulateTick();

    // Fills the market with sample assets. Simulated ones get `historyDays`
    // of made-up history; live ones stay empty until the API answers.
    void seedDefaultAssets(Day today, int historyDays);

    // Factory: builds the right subclass from its type name.
    static std::unique_ptr<Asset> createAsset(const std::string& type,
                                              const std::string& symbol,
                                              const std::string& name,
                                              double volatility,
                                              const std::string& extra,
                                              const std::string& apiId);

private:
    std::vector<std::unique_ptr<Asset>> assets_;
    std::mt19937 rng_;
};
