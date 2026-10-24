#pragma once

#include "Asset.h"

// Concrete asset classes. Each one overrides the virtual functions of
// Asset, so the rest of the program can treat them all as "Asset".

class Stock : public Asset {
public:
    Stock(std::string symbol, std::string name, double price,
          std::string sector, double volatility = 0.015)
        : Asset(std::move(symbol), std::move(name), price, volatility),
          sector_(std::move(sector)) {}

    std::string getType() const override { return "Stock"; }
    std::string getExtra() const override { return sector_; }
    std::string getDetails() const override { return "Sector: " + sector_; }
    double dailyDrift() const override { return 0.0004; }
    bool allowsFractional() const override { return false; }  // whole shares only

private:
    std::string sector_;
};

class Crypto : public Asset {
public:
    Crypto(std::string symbol, std::string name, double price,
           std::string network, double volatility = 0.04)
        : Asset(std::move(symbol), std::move(name), price, volatility),
          network_(std::move(network)) {}

    std::string getType() const override { return "Crypto"; }
    std::string getExtra() const override { return network_; }
    std::string getDetails() const override { return "Network: " + network_; }
    double dailyDrift() const override { return 0.0008; }
    bool allowsFractional() const override { return true; }   // 0.05 BTC is fine

private:
    std::string network_;
};

class Commodity : public Asset {
public:
    Commodity(std::string symbol, std::string name, double price,
              std::string unit, double volatility = 0.008)
        : Asset(std::move(symbol), std::move(name), price, volatility),
          unit_(std::move(unit)) {}

    std::string getType() const override { return "Commodity"; }
    std::string getExtra() const override { return unit_; }
    std::string getDetails() const override { return "Priced per " + unit_; }
    double dailyDrift() const override { return 0.0002; }
    bool allowsFractional() const override { return true; }

private:
    std::string unit_;
};
