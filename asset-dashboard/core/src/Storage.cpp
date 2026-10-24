#include "Storage.h"

#include <fstream>
#include <iomanip>
#include <sstream>
#include <stdexcept>
#include <vector>

namespace {

std::vector<std::string> split(const std::string& text, char sep) {
    std::vector<std::string> parts;
    std::stringstream ss(text);
    std::string item;
    while (std::getline(ss, item, sep)) parts.push_back(item);
    if (!text.empty() && text.back() == sep) parts.push_back("");  // keep a trailing empty field
    return parts;
}

// "20380:65000.5,20381:66010" -> {20380: 65000.5, 20381: 66010}
std::map<Day, double> parseHistory(const std::string& text) {
    std::map<Day, double> history;
    for (const std::string& entry : split(text, ',')) {
        if (entry.empty()) continue;
        size_t colon = entry.find(':');
        if (colon == std::string::npos) throw std::runtime_error("bad price entry");
        history[std::stoi(entry.substr(0, colon))] = std::stod(entry.substr(colon + 1));
    }
    return history;
}

}  // namespace

bool Storage::save(const std::string& path, const Market& market, const User& user) {
    std::ofstream out(path);
    if (!out) return false;
    out << std::setprecision(12);

    const Portfolio& p = user.portfolio_;
    out << "USER|" << user.username_ << "\n";
    out << "ACCOUNT|" << p.startingCash_ << "|" << p.openedOn_ << "\n";
    out << "CASH|" << p.cash_ << "\n";
    out << "REALIZED|" << p.realizedProfit_ << "\n";

    for (const auto& a : market.getAssets()) {
        out << "ASSET|" << a->getType() << "|" << a->getSymbol() << "|" << a->getName()
            << "|" << a->getVolatility() << "|" << a->getExtra() << "|" << a->getApiId() << "|";
        bool first = true;
        for (const auto& [day, price] : a->getHistory()) {
            out << (first ? "" : ",") << day << ":" << price;
            first = false;
        }
        out << "\n";
    }
    for (const auto& [symbol, h] : p.holdings_)
        out << "HOLD|" << symbol << "|" << h.quantity << "|" << h.avgCost << "\n";
    for (const Transaction& t : p.transactions_)
        out << "TX|" << t.typeName() << "|" << t.getSymbol() << "|" << t.getQuantity()
            << "|" << t.getPrice() << "|" << t.getDay() << "\n";

    return static_cast<bool>(out);
}

bool Storage::load(const std::string& path, Market& market, User& user) {
    std::ifstream in(path);
    if (!in) return false;

    Market loadedMarket;
    User loadedUser(user.username_);
    Portfolio& p = loadedUser.portfolio_;
    std::string line;
    int lineNumber = 0;

    try {
        while (std::getline(in, line)) {
            ++lineNumber;
            if (line.empty()) continue;
            std::vector<std::string> f = split(line, '|');
            const std::string& kind = f.at(0);

            if (kind == "ACCOUNT") {
                p.startingCash_ = std::stod(f.at(1));
                p.openedOn_ = std::stoi(f.at(2));
            } else if (kind == "CASH") {
                p.cash_ = std::stod(f.at(1));
            } else if (kind == "REALIZED") {
                p.realizedProfit_ = std::stod(f.at(1));
            } else if (kind == "ASSET") {
                auto asset = Market::createAsset(f.at(1), f.at(2), f.at(3), std::stod(f.at(4)),
                                                 f.at(5), f.at(6));
                asset->setHistory(parseHistory(f.at(7)));
                loadedMarket.addAsset(std::move(asset));
            } else if (kind == "HOLD") {
                p.holdings_[f.at(1)] = Holding{std::stod(f.at(2)), std::stod(f.at(3))};
            } else if (kind == "TX") {
                p.transactions_.emplace_back(Transaction::fromString(f.at(1)), f.at(2),
                                             std::stod(f.at(3)), std::stod(f.at(4)),
                                             std::stoi(f.at(5)));
            }
        }
    } catch (const std::exception& e) {
        throw std::runtime_error("Save file " + path + " is damaged (line " +
                                 std::to_string(lineNumber) + "): " + e.what());
    }

    // Only replace the live state once the whole file parsed correctly.
    market = std::move(loadedMarket);
    user = loadedUser;
    return true;
}
