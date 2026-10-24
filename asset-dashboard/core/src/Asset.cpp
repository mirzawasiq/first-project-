#include "Asset.h"

#include <algorithm>
#include <stdexcept>

Asset::Asset(std::string symbol, std::string name, double volatility, std::string apiId)
    : symbol_(std::move(symbol)), name_(std::move(name)), volatility_(volatility),
      apiId_(std::move(apiId)) {
    if (symbol_.empty()) throw std::invalid_argument("Symbol cannot be empty");
    if (volatility < 0) throw std::invalid_argument("Volatility cannot be negative");
}

double Asset::getCurrentPrice() const {
    if (history_.empty()) throw std::logic_error(symbol_ + " has no price yet");
    return history_.rbegin()->second;
}

Day Asset::lastPriceDay() const {
    if (history_.empty()) throw std::logic_error(symbol_ + " has no price yet");
    return history_.rbegin()->first;
}

double Asset::priceOn(Day day) const {
    if (history_.empty()) throw std::logic_error(symbol_ + " has no price yet");
    auto it = history_.upper_bound(day);  // first entry after `day`
    if (it == history_.begin()) return it->second;
    return std::prev(it)->second;
}

double Asset::changeOver(int days) const {
    return getCurrentPrice() - priceOn(lastPriceDay() - days);
}

double Asset::percentChangeOver(int days) const {
    double old = priceOn(lastPriceDay() - days);
    return old == 0 ? 0 : (getCurrentPrice() - old) / old * 100.0;
}

std::vector<PricePoint> Asset::historyOver(int days) const {
    std::vector<PricePoint> points;
    if (history_.empty()) return points;
    Day from = lastPriceDay() - days;
    for (auto it = history_.lower_bound(from); it != history_.end(); ++it)
        points.push_back({it->first, it->second});
    return points;
}

double Asset::highOver(int days) const {
    double high = priceOn(lastPriceDay() - days);
    for (const PricePoint& p : historyOver(days)) high = std::max(high, p.price);
    return high;
}

double Asset::lowOver(int days) const {
    double low = priceOn(lastPriceDay() - days);
    for (const PricePoint& p : historyOver(days)) low = std::min(low, p.price);
    return low;
}

void Asset::setHistory(std::map<Day, double> history) {
    for (const auto& [day, price] : history)
        if (price <= 0) throw std::invalid_argument("Prices must be positive");
    history_ = std::move(history);
}

void Asset::setPrice(Day day, double price) {
    if (price <= 0) throw std::invalid_argument("Price must be positive");
    history_[day] = price;
}

double Asset::randomStep(double price, double scale, std::mt19937& rng) const {
    std::normal_distribution<double> shock(0.0, 1.0);
    double change = dailyDrift() * scale + volatility_ * scale * shock(rng);
    return std::max(0.01, price * (1.0 + change));
}

void Asset::simulateUntil(Day day, std::mt19937& rng) {
    if (history_.empty()) return;
    for (Day d = lastPriceDay() + 1; d <= day; ++d)
        history_[d] = randomStep(getCurrentPrice(), 1.0, rng);
}

void Asset::simulateTick(std::mt19937& rng) {
    if (history_.empty()) return;
    history_.rbegin()->second = randomStep(getCurrentPrice(), 0.1, rng);
}
