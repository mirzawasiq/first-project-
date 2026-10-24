#pragma once

#include <map>
#include <string>

// Stores user accounts in a text file and checks passwords.
// Passwords are never saved. We save a random "salt" and the hash of
// salt + password, so two users with the same password get different hashes
// and someone who reads the file cannot see the passwords.
class AuthManager {
public:
    explicit AuthManager(std::string usersFile);

    void registerUser(const std::string& username, const std::string& password);  // throws AuthException
    bool login(const std::string& username, const std::string& password) const;
    bool exists(const std::string& username) const;

    static std::string normalize(const std::string& username);  // lower-case
    static void validateUsername(const std::string& username);  // throws AuthException
    static void validatePassword(const std::string& password);  // throws AuthException

private:
    struct Credentials {
        std::string salt;
        std::string hash;
    };

    void load();
    void save() const;
    static std::string makeSalt();
    static std::string hashPassword(const std::string& password, const std::string& salt);

    std::string usersFile_;
    std::map<std::string, Credentials> users_;
};
