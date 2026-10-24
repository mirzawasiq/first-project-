#pragma once

#include "Market.h"
#include "User.h"

#include <string>

// Saves and loads one user's market and portfolio to a text file, one
// record per line with fields separated by '|'.
class Storage {
public:
    static bool save(const std::string& path, const Market& market, const User& user);
    // Returns false if the file is missing; throws std::runtime_error if it is damaged.
    static bool load(const std::string& path, Market& market, User& user);
};
