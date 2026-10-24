#include "Storage.h"

#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <vector>

namespace {

std::vector<std::string> split(const std::string& text, char sep) {
    std::vector<std::string> parts;
    std::stringstream ss(text);
    std::string item;
    while (std::getline(ss, item, sep)) parts.push_back(item);
    return parts;
}

std::vector<double> parseNumbers(const std::string& text) {
    std::vector<double> numbers;
    for (const std::string& part : split(text, ',')) numbers.push_back(std::stod(part));
    return numbers;
}

}  // namespace

bool Storage::save(const std::string& path, const Market& market, const User& user) {
    std::ofstream out(path);
    if (!out) return false;
    out << std::setprecision(12);

    const Portfolio& p = user.getPortfolio();
    out << "USER|" << user.getName() << "\n";
    out << "DAY|" << market.getDay() << "\n";
    out << "CASH|" << p.cash_ << "\n";
    out << "REALIZED|" << p.realizedProfit_ << "\n";

    for (const auto& a : market.getAssets()) {
        out << "ASSET|" << a->getType() << "|" << a->getSymbol() << "|" << a->getName()
            << "|" << a->getVolatility() << "|" << a->getExtra() << "|";
        const auto& history = a->getFullHistory();
        for (size_t i = 0; i < history.size(); ++i) out << (i ? "," : "") << history[i];
        out << "\n";
    }
    for (const auto& [symbol, h] : p.holdings_)
        out << "HOLD|" << symbol << "|" << h.quantity << "|" << h.avgCost << "\n";
    for (const Transaction& t : p.transactions_)
        out << "TX|" << t.typeName() << "|" << t.getSymbol() << "|" << t.getQuantity()
            << "|" << t.getPrice() << "|" << t.getDay() << "\n";
    for (const auto& [day, value] : p.valueHistory_)
        out << "VALUE|" << day << "|" << value << "\n";

    return static_cast<bool>(out);
}

bool Storage::load(const std::string& path, Market& market, User& user) {
    std::ifstream in(path);
    if (!in) return false;

    Market loadedMarket;
    User loadedUser;
    Portfolio& p = loadedUser.getPortfolio();
    std::string line;
    int lineNumber = 0;

    try {
        while (std::getline(in, line)) {
            ++lineNumber;
            if (line.empty()) continue;
            std::vector<std::string> f = split(line, '|');
            const std::string& kind = f.at(0);

            if (kind == "USER") {
                loadedUser.setName(f.at(1));
            } else if (kind == "DAY") {
                loadedMarket.setDay(std::stoi(f.at(1)));
            } else if (kind == "CASH") {
                p.cash_ = std::stod(f.at(1));
            } else if (kind == "REALIZED") {
                p.realizedProfit_ = std::stod(f.at(1));
            } else if (kind == "ASSET") {
                std::vector<double> history = parseNumbers(f.at(6));
                auto asset = Market::createAsset(f.at(1), f.at(2), f.at(3), history.at(0),
                                                 std::stod(f.at(4)), f.at(5));
                asset->setHistory(history);
                loadedMarket.addAsset(std::move(asset));
            } else if (kind == "HOLD") {
                p.holdings_[f.at(1)] = Holding{std::stod(f.at(2)), std::stod(f.at(3))};
            } else if (kind == "TX") {
                p.transactions_.emplace_back(Transaction::fromString(f.at(1)), f.at(2),
                                             std::stod(f.at(3)), std::stod(f.at(4)),
                                             std::stoi(f.at(5)));
            } else if (kind == "VALUE") {
                p.valueHistory_.emplace_back(std::stoi(f.at(1)), std::stod(f.at(2)));
            }
        }
    } catch (const std::exception& e) {
        std::cerr << "Save file is damaged (line " << lineNumber << "): " << e.what()
                  << "\nStarting a fresh session instead.\n";
        return false;
    }

    // Only replace the live state once the whole file parsed correctly.
    market = std::move(loadedMarket);
    user = loadedUser;
    return true;
}
