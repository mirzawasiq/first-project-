#pragma once

#include "Portfolio.h"

#include <string>

// A user "has a" portfolio (composition).
class User {
public:
    explicit User(std::string name = "Investor", double startingCash = 10000.0)
        : name_(std::move(name)), portfolio_(startingCash) {}

    const std::string& getName() const { return name_; }
    void setName(std::string name) { name_ = std::move(name); }

    Portfolio& getPortfolio() { return portfolio_; }
    const Portfolio& getPortfolio() const { return portfolio_; }

private:
    std::string name_;
    Portfolio portfolio_;
};
