// Unit tests for the core classes. No test framework needed: each CHECK
// prints a message when it fails, and main() returns non-zero if any did.
#include "AssetTypes.h"
#include "AuthManager.h"
#include "Exceptions.h"
#include "Market.h"
#include "Portfolio.h"
#include "Sha256.h"
#include "Storage.h"

#include <cmath>
#include <cstdio>
#include <iostream>

namespace {

int failures = 0;

#define CHECK(condition)                                                        \
    do {                                                                        \
        if (!(condition)) {                                                     \
            std::cerr << __FILE__ << ":" << __LINE__ << "  FAILED: " #condition \
                      << "\n";                                                  \
            ++failures;                                                         \
        }                                                                       \
    } while (0)

#define CHECK_THROWS(expression, ExceptionType) \
    do {                                        \
        bool thrown = false;                    \
        try {                                   \
            expression;                         \
        } catch (const ExceptionType&) {        \
            thrown = true;                      \
        }                                       \
        CHECK(thrown);                          \
    } while (0)

bool near(double a, double b) { return std::fabs(a - b) < 1e-6; }

void testSha256() {
    CHECK(sha256Hex("abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    CHECK(sha256Hex("") == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
}

void testDates() {
    CHECK(DateUtil::format(0) == "1970-01-01");
    CHECK(DateUtil::format(19723) == "2024-01-01");
    CHECK(DateUtil::fromUnixMillis(1704067200000LL) == 19723);
    CHECK(DateUtil::fromUnixSeconds(-1) == -1);
}

void testAssetHistory() {
    Crypto btc("BTC", "Bitcoin", "Bitcoin", 0.04, "bitcoin");
    CHECK(btc.isLive());
    CHECK(!btc.hasPrice());
    CHECK_THROWS(btc.getCurrentPrice(), std::logic_error);

    btc.setPrice(100, 50.0);
    btc.setPrice(107, 60.0);
    btc.setPrice(110, 55.0);
    CHECK(near(btc.getCurrentPrice(), 55.0));
    CHECK(near(btc.priceOn(105), 50.0));   // gap: uses last known price
    CHECK(near(btc.priceOn(50), 50.0));    // before history: first price
    CHECK(near(btc.changeOver(10), 5.0));  // 55 vs price on day 100
    CHECK(near(btc.percentChangeOver(10), 10.0));
    CHECK(near(btc.highOver(10), 60.0));
    CHECK(near(btc.lowOver(10), 50.0));
    CHECK(btc.historyOver(3).size() == 2);  // days 107 and 110
    CHECK_THROWS(btc.setPrice(111, -1), std::invalid_argument);
}

void testSimulation() {
    Market market(42);
    market.seedDefaultAssets(1000, 30);
    const Asset& aapl = market.get("AAPL");
    CHECK(aapl.getHistory().size() == 31);
    CHECK(aapl.lastPriceDay() == 1000);
    CHECK(!market.get("BTC").hasPrice());  // live: waits for the API
    CHECK(market.liveApiIds().size() == 5);

    market.simulateUntil(1003);
    CHECK(market.get("AAPL").lastPriceDay() == 1003);
    CHECK(!market.get("BTC").hasPrice());
}

void testTrading() {
    Stock aapl("AAPL", "Apple", "Tech");
    Crypto btc("BTC", "Bitcoin", "Bitcoin");
    aapl.setPrice(10, 100.0);
    btc.setPrice(10, 1000.0);

    Portfolio p(1000.0, 10);
    p.buy(aapl, 5, 10);
    CHECK(near(p.getCash(), 500.0));
    CHECK_THROWS(p.buy(aapl, 2.5, 10), TradeException);              // whole shares only
    CHECK_THROWS(p.buy(btc, 1, 10), InsufficientFundsException);
    p.buy(btc, 0.25, 10);                                            // fractional crypto is fine
    CHECK(near(p.getCash(), 250.0));

    aapl.setPrice(11, 120.0);
    CHECK(near(p.holdingsValue(Market()), 5 * 100.0 + 0.25 * 1000.0));  // market without assets: avg cost
    p.buy(aapl, 1, 11);
    CHECK(near(p.getHoldings().at("AAPL").avgCost, (500.0 + 120.0) / 6));

    p.sell(aapl, 6, 11);
    CHECK(near(p.getRealizedProfit(), 6 * 120.0 - 620.0));
    CHECK(p.getQuantity("AAPL") == 0);
    CHECK_THROWS(p.sell(aapl, 1, 11), InsufficientHoldingsException);

    p.deposit(100, 11);
    CHECK_THROWS(p.withdraw(1e9, 11), InsufficientFundsException);
    CHECK(p.getTransactions().size() == 5);
    CHECK(near(p.netContributions(), 1100.0));
}

void testValueHistory() {
    Market market(1);
    auto stock = Market::createAsset("Stock", "XYZ", "Xyz", 0.01, "Tech", "");
    stock->setPrice(10, 10.0);
    stock->setPrice(11, 20.0);
    stock->setPrice(12, 15.0);
    market.addAsset(std::move(stock));

    Portfolio p(100.0, 9);
    p.buy(market.get("XYZ"), 5, 10);  // buys at the latest price (15)
    // Day 9: before the trade, only cash.
    CHECK(near(p.valueOn(9, market), 100.0));
    // Day 11: 25 cash + 5 shares * 20.
    CHECK(near(p.valueOn(11, market), 25.0 + 100.0));
    CHECK(near(p.valueOn(12, market), 25.0 + 75.0));
}

void testStorageRoundTrip() {
    const std::string path = "core_tests_storage.tmp";
    Market market(7);
    market.seedDefaultAssets(500, 10);
    market.get("BTC").setPrice(500, 65000.0);
    User user("alice", 5000);
    user.getPortfolio().buy(market.get("BTC"), 0.01, 500);
    CHECK(Storage::save(path, market, user));

    Market loadedMarket;
    User loadedUser("alice");
    CHECK(Storage::load(path, loadedMarket, loadedUser));
    CHECK(loadedMarket.getAssets().size() == market.getAssets().size());
    CHECK(loadedMarket.get("BTC").getApiId() == "bitcoin");
    CHECK(!loadedMarket.get("ETH").hasPrice());  // empty history survives the round trip
    CHECK(near(loadedMarket.get("AAPL").getCurrentPrice(), market.get("AAPL").getCurrentPrice()));
    CHECK(near(loadedUser.getPortfolio().getCash(), 5000 - 650.0));
    CHECK(near(loadedUser.getPortfolio().getQuantity("BTC"), 0.01));
    CHECK(loadedUser.getPortfolio().getTransactions().size() == 1);
    CHECK(!Storage::load("does_not_exist.tmp", loadedMarket, loadedUser));
    std::remove(path.c_str());
}

void testAuth() {
    const std::string path = "core_tests_users.tmp";
    std::remove(path.c_str());
    {
        AuthManager auth(path);
        CHECK_THROWS(auth.registerUser("ab", "secret1"), AuthException);       // too short
        CHECK_THROWS(auth.registerUser("bad name", "secret1"), AuthException); // space
        CHECK_THROWS(auth.registerUser("wasiq", "short"), AuthException);
        CHECK_THROWS(auth.registerUser("wasiq", "lettersonly"), AuthException);
        auth.registerUser("Wasiq", "karachi123");
        CHECK_THROWS(auth.registerUser("wasiq", "another1"), AuthException);  // taken (case-insensitive)
    }
    AuthManager reloaded(path);  // read back from disk
    CHECK(reloaded.exists("WASIQ"));
    CHECK(reloaded.login("wasiq", "karachi123"));
    CHECK(!reloaded.login("wasiq", "karachi124"));
    CHECK(!reloaded.login("nobody", "karachi123"));
    std::remove(path.c_str());
}

}  // namespace

int main() {
    testSha256();
    testDates();
    testAssetHistory();
    testSimulation();
    testTrading();
    testValueHistory();
    testStorageRoundTrip();
    testAuth();

    if (failures == 0) std::cout << "All core tests passed.\n";
    else std::cout << failures << " check(s) failed.\n";
    return failures == 0 ? 0 : 1;
}
