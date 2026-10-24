# Asset Management Dashboard (C++ / OOP)

A console app where a user can **buy and sell assets** (stocks, crypto, commodities),
**manage** their assets and cash, and **track how values change over time**:
up or down, by how much, shown with an ASCII chart.

Market prices are **simulated**. Every time you move the clock forward, each asset's
price takes a random step based on its volatility, so you can watch your portfolio
grow or shrink without needing an internet connection or API.

## Features

| Menu option | What it does |
|---|---|
| 1. Overview | Cash, invested value, net worth, unrealized and realized profit/loss, top gainer and loser today |
| 2. Market prices | All assets with price and % change over 1, 7 and 30 days (green = up, red = down) |
| 3. Buy asset | Buy by symbol. Checks you have enough cash. Stocks are whole shares only; crypto and commodities can be fractional |
| 4. Sell asset | Sell what you own and see the profit on that sale |
| 5. My holdings | Quantity, average cost, current price, value, P/L, P/L % and allocation % |
| 6. Asset performance | Pick an asset and a period (7/30/90 days/all): start vs. now, change, trend UP/DOWN, high/low, chart |
| 7. Portfolio performance | Your total net worth over a period, with a chart |
| 8. Transaction history | Every buy, sell, deposit and withdrawal |
| 9. Manage assets & cash | Add a new asset, remove one, set a price manually, deposit or withdraw cash |
| 10. Simulate next day(s) | Move the market forward 1–365 days |
| 11. Save / 0. Save & exit | Saves everything to `portfolio_data.txt` and loads it again on the next start |

## Build & run

Needs a C++17 compiler (g++ 7+, clang, or Visual Studio 2017+). No extra libraries.

**Windows / Linux / macOS with g++ (simplest):**
```bash
cd asset-dashboard
g++ -std=c++17 -Iinclude src/*.cpp -o asset_dashboard
./asset_dashboard          # on Windows: asset_dashboard.exe
```

**With make:** `make run`

**With CMake (or open the folder in Visual Studio / CLion):**
```bash
cmake -S . -B build
cmake --build build
./build/asset_dashboard
```

**Code::Blocks / Dev-C++:** create an empty console project, add every file in `src/` and `include/`,
add `include` to the compiler's search directories, and turn on C++17 (`-std=c++17`).

To start over, delete `portfolio_data.txt`.

## Project structure

```
asset-dashboard/
├── include/
│   ├── Asset.h         abstract base class
│   ├── AssetTypes.h    Stock, Crypto, Commodity (derived classes)
│   ├── Market.h        holds all assets, simulates prices, factory method
│   ├── Portfolio.h     cash, holdings, buy/sell, P/L, value history
│   ├── Transaction.h   one buy/sell/deposit/withdraw record
│   ├── User.h          a user who owns a portfolio
│   ├── Storage.h       save/load to a text file
│   ├── Exceptions.h    custom exception hierarchy
│   ├── ConsoleUI.h     input, colours, tables, ASCII chart
│   └── Dashboard.h     the menu screens
└── src/                matching .cpp files + main.cpp
```

## Class diagram

```
                 +------------------------+
                 |   Asset  (abstract)    |
                 |------------------------|
                 | # symbol_, name_       |
                 | # volatility_          |
                 | # history_ : vector    |
                 |------------------------|
                 | + getCurrentPrice()    |
                 | + percentChangeOver(d) |
                 | + simulateNextDay()    |
                 | + getType() = 0        |  <- pure virtual
                 | + dailyDrift() = 0     |
                 | + allowsFractional()=0 |
                 +-----------^------------+
          +------------------+------------------+
     +----+----+        +----+----+        +----+------+
     |  Stock  |        | Crypto  |        | Commodity |
     | sector_ |        | network_|        |   unit_   |
     +---------+        +---------+        +-----------+

  Market  1 ----owns----> * Asset        (unique_ptr: composition)
  User    1 ----has-----> 1 Portfolio    (composition)
  Portfolio 1 --has-----> * Transaction, * Holding
  Dashboard  --uses-----> Market&, User&  (association)
  Storage    --friend of-> Portfolio
  TradeException <- InsufficientFundsException, InsufficientHoldingsException
```

## Where each OOP concept is used (useful for your viva)

| Concept | Where |
|---|---|
| **Encapsulation** | All data members are `private`/`protected`. `Portfolio` cash can only change through `buy()`, `sell()`, `deposit()`, `withdraw()`, which validate first |
| **Abstraction** | `Asset` is an abstract class with pure virtual functions. You can't create a plain "Asset", only a Stock, Crypto or Commodity |
| **Inheritance** | `Stock`, `Crypto` and `Commodity` inherit from `Asset`. The exception classes inherit from `TradeException` → `std::runtime_error` |
| **Polymorphism** | `Market` stores `std::vector<std::unique_ptr<Asset>>`. Calling `asset->dailyDrift()` or `asset->allowsFractional()` runs the right subclass's version (e.g. stocks reject 2.5 shares, crypto accepts 0.05 BTC) |
| **Composition** | `User` has a `Portfolio`; `Portfolio` has `Holding`s and `Transaction`s; `Market` owns its `Asset`s |
| **Factory method** | `Market::createAsset("Crypto", ...)` builds the correct subclass from a string (used when loading the save file) |
| **Exception handling** | Custom exceptions are thrown by `Portfolio` and caught in `Dashboard`, which shows a red error message |
| **Friend class** | `Storage` is a friend of `Portfolio` so it can restore private state when loading |
| **const correctness, RAII** | `const` getters, `unique_ptr` (no manual `delete`), file streams close automatically |
| **STL** | `vector`, `map`, `algorithm` (`max_element`, `find_if`, `transform`), `<random>` |

## How price changes are calculated

- **Change** over N days = `price_today − price_N_days_ago`
- **% change** = `change / price_N_days_ago × 100`
- **Trend** = UP if change > 0, DOWN if < 0, FLAT otherwise
- **Average cost** after a buy = `(old_qty × old_avg + new_qty × price) / (old_qty + new_qty)`
- **Realized P/L** on a sale = `(sell_price − avg_cost) × qty_sold`
- **Unrealized P/L** = `current value of holdings − what you paid for them`
- **Simulation**: `tomorrow = today × (1 + drift + volatility × random_normal)`.
  Crypto has the highest volatility (~4%/day), stocks ~1.5%, gold ~0.8%.
