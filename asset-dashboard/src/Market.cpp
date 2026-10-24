#include "Market.h"

#include "AssetTypes.h"
#include "Exceptions.h"

#include <algorithm>
#include <stdexcept>

Market::Market(unsigned seed) : rng_(seed) {}

void Market::addAsset(std::unique_ptr<Asset> asset) {
    if (find(asset->getSymbol()))
        throw std::invalid_argument("Symbol " + asset->getSymbol() + " already exists");
    assets_.push_back(std::move(asset));
}

bool Market::removeAsset(const std::string& symbol) {
    auto it = std::find_if(assets_.begin(), assets_.end(),
                           [&](const auto& a) { return a->getSymbol() == symbol; });
    if (it == assets_.end()) return false;
    assets_.erase(it);
    return true;
}

void Market::clear() {
    assets_.clear();
    day_ = 0;
}

Asset* Market::find(const std::string& symbol) {
    for (auto& a : assets_)
        if (a->getSymbol() == symbol) return a.get();
    return nullptr;
}

const Asset* Market::find(const std::string& symbol) const {
    for (const auto& a : assets_)
        if (a->getSymbol() == symbol) return a.get();
    return nullptr;
}

Asset& Market::get(const std::string& symbol) {
    Asset* asset = find(symbol);
    if (!asset) throw AssetNotFoundException(symbol);
    return *asset;
}

void Market::advanceDay() {
    for (auto& a : assets_) a->simulateNextDay(rng_);
    ++day_;
}

void Market::seedDefaultAssets(int historyDays) {
    clear();
    // Starting prices are illustrative only; the simulation moves them randomly.
    addAsset(std::make_unique<Stock>("AAPL", "Apple Inc.", 190.0, "Technology"));
    addAsset(std::make_unique<Stock>("MSFT", "Microsoft Corp.", 410.0, "Technology"));
    addAsset(std::make_unique<Stock>("TSLA", "Tesla Inc.", 240.0, "Automotive", 0.03));
    addAsset(std::make_unique<Crypto>("BTC", "Bitcoin", 65000.0, "Bitcoin", 0.035));
    addAsset(std::make_unique<Crypto>("ETH", "Ethereum", 3200.0, "Ethereum"));
    addAsset(std::make_unique<Crypto>("SOL", "Solana", 150.0, "Solana", 0.05));
    addAsset(std::make_unique<Commodity>("GOLD", "Gold", 2300.0, "troy ounce"));
    addAsset(std::make_unique<Commodity>("OIL", "Crude Oil", 80.0, "barrel", 0.018));

    for (int i = 0; i < historyDays; ++i) advanceDay();
}

std::unique_ptr<Asset> Market::createAsset(const std::string& type,
                                           const std::string& symbol,
                                           const std::string& name,
                                           double price, double volatility,
                                           const std::string& extra) {
    if (type == "Stock") return std::make_unique<Stock>(symbol, name, price, extra, volatility);
    if (type == "Crypto") return std::make_unique<Crypto>(symbol, name, price, extra, volatility);
    if (type == "Commodity")
        return std::make_unique<Commodity>(symbol, name, price, extra, volatility);
    throw std::invalid_argument("Unknown asset type: " + type);
}
