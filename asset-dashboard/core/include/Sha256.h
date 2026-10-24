#pragma once

#include <string>

// SHA-256 hash, returned as 64 lowercase hex characters.
// Written by hand so the core library has no dependencies. For a real
// product you would use a vetted library and a slow password hash such
// as Argon2 or bcrypt.
std::string sha256Hex(const std::string& input);
