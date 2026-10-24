#include "DateUtil.h"

#include <cstdio>
#include <ctime>

namespace DateUtil {

namespace {
constexpr long long kSecondsPerDay = 86400;

// Floor division so dates before 1970 still land on the right day.
long long floorDiv(long long a, long long b) {
    return a / b - ((a % b != 0) && ((a < 0) != (b < 0)));
}
}  // namespace

Day today() {
    return fromUnixSeconds(static_cast<long long>(std::time(nullptr)));
}

Day fromUnixSeconds(long long seconds) {
    return static_cast<Day>(floorDiv(seconds, kSecondsPerDay));
}

Day fromUnixMillis(long long millis) {
    return fromUnixSeconds(floorDiv(millis, 1000));
}

long long toUnixSeconds(Day day) {
    return static_cast<long long>(day) * kSecondsPerDay;
}

std::string format(Day day) {
    // Days -> civil date, algorithm by Howard Hinnant (public domain).
    long long z = static_cast<long long>(day) + 719468;
    long long era = floorDiv(z, 146097);
    long long doe = z - era * 146097;
    long long yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    long long year = yoe + era * 400;
    long long doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    long long mp = (5 * doy + 2) / 153;
    long long dayOfMonth = doy - (153 * mp + 2) / 5 + 1;
    long long month = mp < 10 ? mp + 3 : mp - 9;
    if (month <= 2) ++year;

    char buffer[64];
    std::snprintf(buffer, sizeof buffer, "%04lld-%02lld-%02lld", year, month, dayOfMonth);
    return buffer;
}

}  // namespace DateUtil
