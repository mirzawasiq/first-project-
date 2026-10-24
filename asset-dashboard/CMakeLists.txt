cmake_minimum_required(VERSION 3.16)
project(AssetDashboard VERSION 2.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(MSVC)
    add_compile_options(/W4 /utf-8)
else()
    add_compile_options(-Wall -Wextra -pedantic)
endif()

enable_testing()

# ---- core: plain C++ (no Qt) - assets, market, portfolio, login, saving ----
add_library(asset_core STATIC
    core/src/Asset.cpp
    core/src/AuthManager.cpp
    core/src/DateUtil.cpp
    core/src/Market.cpp
    core/src/Portfolio.cpp
    core/src/Sha256.cpp
    core/src/Storage.cpp
    core/src/Transaction.cpp
)
target_include_directories(asset_core PUBLIC core/include)

add_executable(core_tests tests/core_tests.cpp)
target_link_libraries(core_tests PRIVATE asset_core)
add_test(NAME core_tests COMMAND core_tests)

# ---- api + gui: need Qt 6 (Widgets, Network, Charts) ----
find_package(Qt6 COMPONENTS Widgets Network Charts Test)

if(NOT Qt6_FOUND)
    message(WARNING "Qt 6 not found: only the core library and core_tests will be built. "
                    "Install Qt 6 (with Qt Charts) or set CMAKE_PREFIX_PATH to it.")
    return()
endif()

set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)

add_library(asset_api STATIC
    api/PriceProvider.h
    api/CoinGeckoParser.cpp
    api/CoinGeckoClient.cpp
    api/CoinGeckoClient.h
)
target_include_directories(asset_api PUBLIC api)
target_link_libraries(asset_api PUBLIC asset_core Qt6::Core Qt6::Network)

add_executable(api_tests tests/api_tests.cpp)
target_link_libraries(api_tests PRIVATE asset_api Qt6::Test)
add_test(NAME api_tests COMMAND api_tests)

add_executable(AssetDashboard WIN32 MACOSX_BUNDLE
    gui/main.cpp
    gui/AppState.h
    gui/Page.h
    gui/Format.cpp
    gui/Charts.cpp
    gui/LoginDialog.cpp
    gui/MainWindow.cpp
    gui/TradeDialog.cpp
    gui/StatCard.cpp
    gui/pages/DashboardPage.cpp
    gui/pages/MarketPage.cpp
    gui/pages/PortfolioPage.cpp
    gui/pages/PerformancePage.cpp
    gui/pages/TransactionsPage.cpp
    gui/pages/ManagePage.cpp
    gui/resources/resources.qrc
)
target_include_directories(AssetDashboard PRIVATE gui gui/pages)
target_link_libraries(AssetDashboard PRIVATE asset_api Qt6::Widgets Qt6::Charts)
