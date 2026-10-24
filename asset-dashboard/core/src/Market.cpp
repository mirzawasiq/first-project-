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

Asset* Market::findByApiId(const std::string& apiId) {
    for (auto& a : assets_)
        if (a->getApiId() == apiId) return a.get();
    return nullptr;
}

std::vector<std::string> Market::liveApiIds() const {
    std::vector<std::string> ids;
    for (const auto& a : assets_)
        if (a->isLive()) ids.push_back(a->getApiId());
    return ids;
}

void Market::simulateUntil(Day day) {
    for (auto& a : assets_)
        if (!a->isLive()) a->simulateUntil(day, rng_);
}

void Market::simulateTick() {
    for (auto& a : assets_)
        if (!a->isLive()) a->simulateTick(rng_);
}

void Market::seedDefaultAssets(Day today, int historyDays) {
    clear();
    // Live prices from CoinGecko (the id is the CoinGecko coin id).
    addAsset(std::make_unique<Crypto>("BTC", "Bitcoin", "Bitcoin", 0.035, "bitcoin"));
    addAsset(std::make_unique<Crypto>("ETH", "Ethereum", "Ethereum", 0.04, "ethereum"));
    addAsset(std::make_unique<Crypto>("SOL", "Solana", "Solana", 0.05, "solana"));
    addAsset(std::make_unique<Crypto>("BNB", "BNB", "BNB Chain", 0.035, "binancecoin"));
    // PAX Gold is a token backed by one troy ounce of real gold, so its
    // CoinGecko price tracks the gold price.
    addAsset(std::make_unique<Commodity>("GOLD", "Gold (via PAX Gold)", "troy ounce", 0.008, "pax-gold"));

    // Simulated assets (CoinGecko has no stock prices). Start prices are illustrative.
    struct Seed { std::unique_ptr<Asset> asset; double startPrice; };
    Seed simulated[] = {
        {std::make_unique<Stock>("AAPL", "Apple Inc.", "Technology"), 190.0},
        {std::make_unique<Stock>("MSFT", "Microsoft Corp.", "Technology"), 410.0},
        {std::make_unique<Stock>("TSLA", "Tesla Inc.", "Automotive", 0.03), 240.0},
        {std::make_unique<Commodity>("OIL", "Crude Oil", "barrel", 0.018), 80.0},
    };
    for (Seed& s : simulated) {
        s.asset->setPrice(today - historyDays, s.startPrice);
        s.asset->simulateUntil(today, rng_);
        addAsset(std::move(s.asset));
    }
}

std::unique_ptr<Asset> Market::createAsset(const std::string& type,
                                           const std::string& symbol,
                                           const std::string& name,
                                           double volatility,
                                           const std::string& extra,
                                           const std::string& apiId) {
    if (type == "Stock") return std::make_unique<Stock>(symbol, name, extra, volatility, apiId);
    if (type == "Crypto") return std::make_unique<Crypto>(symbol, name, extra, volatility, apiId);
    if (type == "Commodity")
        return std::make_unique<Commodity>(symbol, name, extra, volatility, apiId);
    throw std::invalid_argument("Unknown asset type: " + type);
}
