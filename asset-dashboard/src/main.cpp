#include "ConsoleUI.h"
#include "Dashboard.h"
#include "Market.h"
#include "Storage.h"
#include "User.h"

#include <iostream>

int main() {
    ConsoleUI::enableColors();

    const std::string saveFile = "portfolio_data.txt";
    const double startingCash = 10000.0;
    const int historyDays = 90;  // fake past prices so charts have data on day one

    Market market;
    User user;

    if (Storage::load(saveFile, market, user)) {
        std::cout << "Welcome back, " << user.getName() << "! Loaded your saved data.\n";
    } else {
        ConsoleUI::printTitle("WELCOME TO THE ASSET MANAGEMENT DASHBOARD");
        std::string name = ConsoleUI::readLine("What is your name? ");
        user = User(name.empty() ? "Investor" : name, startingCash);
        market.seedDefaultAssets(historyDays);
        std::cout << "You start with " << ConsoleUI::money(startingCash)
                  << " in cash. Good luck!\n";
        ConsoleUI::pause();
    }

    Dashboard dashboard(market, user, saveFile);
    dashboard.run();
    return 0;
}
