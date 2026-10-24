# Team plan (3 members)

The code is already split into three layers, so each person can own one and work
without stepping on the others. Everyone should be able to explain the whole program
in the viva, so swap and review each other's parts too.

| | Member A: Core & OOP | Member B: GUI | Member C: API, data & docs |
|---|---|---|---|
| **Owns** | `core/` and `tests/core_tests.cpp` | `gui/` (pages, dialogs, `style.qss`) | `api/`, `tests/api_tests.cpp`, `Storage`, `docs/` |
| **Key classes** | `Asset`, `Stock`/`Crypto`/`Commodity`, `Market`, `Portfolio`, `Transaction`, `AuthManager`, `Sha256` | `MainWindow`, `Page` and its 6 subclasses, `TradeDialog`, `LoginDialog`, `Charts` | `PriceProvider`, `CoinGeckoClient`, `CoinGeckoParser`, `Storage` |
| **Explains in viva** | Inheritance, polymorphism, encapsulation, exceptions, password hashing | Qt widgets, layouts, signals & slots, charts, page polymorphism | HTTP/JSON, async networking, rate limiting, file format, testing with a fake server |
| **Good next tasks** | Add a `RealEstate` or `Bond` asset class; add sell-fees | Dark/light theme switch; price alerts; coin logos | Real stock prices via a second `PriceProvider`; PKR currency; export report to PDF |

## How to work together with Git

1. Each member makes a branch: `git checkout -b member-a-bonds`.
2. Commit small, clear changes: `git commit -m "Add Bond asset class"`.
3. Push and open a Pull Request on GitHub. Another member reviews it before merging.
4. Before pushing, build and run the tests: `ctest` must say **100% tests passed**.

## Suggested timeline

| Week | Goal |
|---|---|
| 1 | Everyone installs Qt, builds the project, and reads the README and this plan. Each person reads their layer. |
| 2 | Each member adds one feature from "Good next tasks" in their layer. |
| 3 | Test each other's features, fix bugs, take screenshots. |
| 4 | Write the report (class diagram, OOP concepts, screenshots, API explanation) and rehearse the demo. |

## Demo script (5 minutes)

1. Create a new account (show password validation), then sign in.
2. Market: show live (CoinGecko) vs simulated prices; buy 0.05 BTC and 5 AAPL.
   Try buying 2.5 AAPL to show the "whole units only" rule.
3. My Portfolio: profit/loss and the allocation doughnut.
4. Performance: Bitcoin over 7D / 30D / 1Y, showing increase or decrease, high/low and the chart.
5. Manage & Settings: add Dogecoin with CoinGecko id `dogecoin`; show it appear with a live price.
6. Log out and log back in to show everything was saved.
