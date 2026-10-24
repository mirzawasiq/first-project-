#include "Asset.h"

#include <algorithm>
#include <stdexcept>

Asset::Asset(std::string symbol, std::string name, double startPrice, double volatility)
    : symbol_(std::move(symbol)), name_(std::move(name)), volatility_(volatility) {
    if (startPrice <= 0) throw std::invalid_argument("Price must be positive");
    if (volatility < 0) throw std::invalid_argument("Volatility cannot be negative");
    history_.push_back(startPrice);
}

double Asset::getPriceDaysAgo(int days) const {
    if (days <= 0) return history_.back();
    int index = static_cast<int>(history_.size()) - 1 - days;
    return history_[std::max(index, 0)];
}

double Asset::changeOver(int days) const {
    return getCurrentPrice() - getPriceDaysAgo(days);
}

double Asset::percentChangeOver(int days) const {
    double old = getPriceDaysAgo(days);
    return old == 0 ? 0 : (getCurrentPrice() - old) / old * 100.0;
}

std::vector<double> Asset::getHistory(int days) const {
    int count = std::min<int>(days + 1, static_cast<int>(history_.size()));
    return std::vector<double>(history_.end() - count, history_.end());
}

double Asset::highOver(int days) const {
    std::vector<double> h = getHistory(days);
    return *std::max_element(h.begin(), h.end());
}

double Asset::lowOver(int days) const {
    std::vector<double> h = getHistory(days);
    return *std::min_element(h.begin(), h.end());
}

void Asset::setHistory(std::vector<double> history) {
    if (!history.empty()) history_ = std::move(history);
}

void Asset::setCurrentPrice(double price) {
    if (price <= 0) throw std::invalid_argument("Price must be positive");
    history_.back() = price;
}

void Asset::simulateNextDay(std::mt19937& rng) {
    std::normal_distribution<double> shock(0.0, 1.0);
    double dailyReturn = dailyDrift() + volatility_ * shock(rng);
    history_.push_back(std::max(0.01, getCurrentPrice() * (1.0 + dailyReturn)));
}
