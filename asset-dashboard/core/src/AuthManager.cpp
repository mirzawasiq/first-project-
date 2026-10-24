#include "AuthManager.h"

#include "Exceptions.h"
#include "Sha256.h"

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <fstream>
#include <random>
#include <sstream>

namespace {
constexpr int kHashRounds = 10000;  // repeating the hash makes guessing passwords slower
}

AuthManager::AuthManager(std::string usersFile) : usersFile_(std::move(usersFile)) {
    load();
}

std::string AuthManager::normalize(const std::string& username) {
    std::string result = username;
    std::transform(result.begin(), result.end(), result.begin(),
                   [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    return result;
}

void AuthManager::validateUsername(const std::string& username) {
    if (username.size() < 3 || username.size() > 20)
        throw AuthException("Username must be 3-20 characters long");
    for (unsigned char c : username)
        if (!std::isalnum(c) && c != '_')
            throw AuthException("Username can only contain letters, numbers and _");
}

void AuthManager::validatePassword(const std::string& password) {
    if (password.size() < 6) throw AuthException("Password must be at least 6 characters");
    bool hasLetter = std::any_of(password.begin(), password.end(),
                                 [](unsigned char c) { return std::isalpha(c); });
    bool hasDigit = std::any_of(password.begin(), password.end(),
                                [](unsigned char c) { return std::isdigit(c); });
    if (!hasLetter || !hasDigit)
        throw AuthException("Password must contain at least one letter and one number");
}

bool AuthManager::exists(const std::string& username) const {
    return users_.count(normalize(username)) > 0;
}

void AuthManager::registerUser(const std::string& username, const std::string& password) {
    validateUsername(username);
    validatePassword(password);
    if (exists(username)) throw AuthException("That username is already taken");

    Credentials c;
    c.salt = makeSalt();
    c.hash = hashPassword(password, c.salt);
    users_[normalize(username)] = c;
    save();
}

bool AuthManager::login(const std::string& username, const std::string& password) const {
    auto it = users_.find(normalize(username));
    if (it == users_.end()) return false;
    std::string attempt = hashPassword(password, it->second.salt);

    // Compare every character so the time taken doesn't reveal how much matched.
    const std::string& stored = it->second.hash;
    if (attempt.size() != stored.size()) return false;
    unsigned char diff = 0;
    for (size_t i = 0; i < stored.size(); ++i) diff |= attempt[i] ^ stored[i];
    return diff == 0;
}

std::string AuthManager::makeSalt() {
    std::random_device rd;
    std::string salt;
    char hex[3];
    for (int i = 0; i < 16; ++i) {
        std::snprintf(hex, sizeof hex, "%02x", static_cast<unsigned>(rd() & 0xff));
        salt += hex;
    }
    return salt;
}

std::string AuthManager::hashPassword(const std::string& password, const std::string& salt) {
    std::string hash = sha256Hex(salt + password);
    for (int i = 1; i < kHashRounds; ++i) hash = sha256Hex(hash + salt + password);
    return hash;
}

void AuthManager::load() {
    std::ifstream in(usersFile_);
    std::string line;
    while (std::getline(in, line)) {
        // username|salt|hash
        std::stringstream ss(line);
        std::string name, salt, hash;
        if (std::getline(ss, name, '|') && std::getline(ss, salt, '|') && std::getline(ss, hash))
            users_[name] = Credentials{salt, hash};
    }
}

void AuthManager::save() const {
    std::ofstream out(usersFile_);
    if (!out) throw AuthException("Could not write " + usersFile_);
    for (const auto& [name, c] : users_) out << name << "|" << c.salt << "|" << c.hash << "\n";
}
