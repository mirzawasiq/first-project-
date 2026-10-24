#pragma once

#include "Market.h"
#include "User.h"

#include <string>

// Saves and loads the whole app state to a simple text file, one record
// per line with fields separated by '|'.
class Storage {
public:
    static bool save(const std::string& path, const Market& market, const User& user);
    static bool load(const std::string& path, Market& market, User& user);
};
