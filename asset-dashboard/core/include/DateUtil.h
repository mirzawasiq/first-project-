#pragma once

#include <string>

// A "Day" is the number of whole days since 1970-01-01 (UTC).
// Using a plain int keeps price history easy to store and compare.
using Day = int;

namespace DateUtil {

Day today();
Day fromUnixSeconds(long long seconds);
Day fromUnixMillis(long long millis);
long long toUnixSeconds(Day day);
std::string format(Day day);  // "2026-10-24"

}  // namespace DateUtil
