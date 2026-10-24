#pragma once

#include "Portfolio.h"

#include <string>

// A logged-in user "has a" portfolio (composition).
class User {
public:
    explicit User(std::string username = "", double startingCash = 10000.0)
        : username_(std::move(username)), portfolio_(startingCash) {}

    const std::string& getUsername() const { return username_; }

    Portfolio& getPortfolio() { return portfolio_; }
    const Portfolio& getPortfolio() const { return portfolio_; }

    friend class Storage;

private:
    std::string username_;
    Portfolio portfolio_;
};
