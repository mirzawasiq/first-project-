#include "ConsoleUI.h"

#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <iomanip>
#include <iostream>
#include <sstream>

#ifdef _WIN32
#include <windows.h>
#endif

namespace ConsoleUI {

namespace Color {
const char* const Reset = "\033[0m";
const char* const Green = "\033[32m";
const char* const Red = "\033[31m";
const char* const Yellow = "\033[33m";
const char* const Cyan = "\033[36m";
const char* const Bold = "\033[1m";
}  // namespace Color

void enableColors() {
#ifdef _WIN32
    HANDLE handle = GetStdHandle(STD_OUTPUT_HANDLE);
    DWORD mode = 0;
    if (GetConsoleMode(handle, &mode))
        SetConsoleMode(handle, mode | ENABLE_VIRTUAL_TERMINAL_PROCESSING);
#endif
}

std::string colored(const std::string& text, const char* color) {
    return color + text + Color::Reset;
}

std::string gainColored(const std::string& text, double change) {
    if (change > 0) return colored(text, Color::Green);
    if (change < 0) return colored(text, Color::Red);
    return colored(text, Color::Yellow);
}

std::string money(double value) {
    std::ostringstream ss;
    ss << std::fixed << std::setprecision(2) << std::fabs(value);
    std::string digits = ss.str();
    // Insert thousands separators: 12345.67 -> 12,345.67
    for (int i = static_cast<int>(digits.find('.')) - 3; i > 0; i -= 3) digits.insert(i, ",");
    return (value < 0 ? "-$" : "$") + digits;
}

std::string signedMoney(double value) {
    return (value > 0 ? "+" : "") + money(value);
}

std::string percent(double value) {
    std::ostringstream ss;
    ss << std::fixed << std::setprecision(2) << (value > 0 ? "+" : "") << value << "%";
    return ss.str();
}

std::string number(double value, int decimals) {
    std::ostringstream ss;
    ss << std::fixed << std::setprecision(decimals) << value;
    std::string s = ss.str();
    // Trim trailing zeros so "2.0000" shows as "2".
    if (s.find('.') != std::string::npos) {
        s.erase(s.find_last_not_of('0') + 1);
        if (s.back() == '.') s.pop_back();
    }
    return s;
}

std::string padRight(const std::string& text, size_t width) {
    return text.size() >= width ? text : text + std::string(width - text.size(), ' ');
}

std::string padLeft(const std::string& text, size_t width) {
    return text.size() >= width ? text : std::string(width - text.size(), ' ') + text;
}

std::string trendLabel(double change) {
    if (change > 0) return "UP";
    if (change < 0) return "DOWN";
    return "FLAT";
}

std::string readLine(const std::string& prompt) {
    std::cout << prompt;
    std::string line;
    if (!std::getline(std::cin, line)) {
        std::cout << "\nInput closed. Goodbye!\n";
        std::exit(0);
    }
    // Trim surrounding whitespace.
    size_t start = line.find_first_not_of(" \t\r");
    size_t end = line.find_last_not_of(" \t\r");
    return start == std::string::npos ? "" : line.substr(start, end - start + 1);
}

int readInt(const std::string& prompt, int min, int max) {
    while (true) {
        std::string text = readLine(prompt);
        try {
            size_t used = 0;
            int value = std::stoi(text, &used);
            if (used == text.size() && value >= min && value <= max) return value;
        } catch (const std::exception&) {
        }
        std::cout << colored("  Please enter a whole number from " + std::to_string(min) +
                                 " to " + std::to_string(max) + ".\n",
                             Color::Red);
    }
}

double readDouble(const std::string& prompt, double min) {
    while (true) {
        std::string text = readLine(prompt);
        try {
            size_t used = 0;
            double value = std::stod(text, &used);
            if (used == text.size() && std::isfinite(value) && value >= min) return value;
        } catch (const std::exception&) {
        }
        std::cout << colored("  Please enter a number of at least " + number(min) + ".\n",
                             Color::Red);
    }
}

bool confirm(const std::string& prompt) {
    std::string answer = readLine(prompt + " (y/n): ");
    return !answer.empty() && (answer[0] == 'y' || answer[0] == 'Y');
}

void pause() {
    readLine("\nPress Enter to continue...");
}

void clearScreen() {
    std::cout << "\033[2J\033[H";
}

void printLine(size_t width) {
    std::cout << std::string(width, '-') << "\n";
}

void printTitle(const std::string& title) {
    std::cout << "\n" << colored(std::string(78, '='), Color::Cyan) << "\n"
              << colored("  " + title, Color::Bold) << "\n"
              << colored(std::string(78, '='), Color::Cyan) << "\n";
}

void drawChart(const std::vector<double>& values, int height, int width) {
    if (values.size() < 2) {
        std::cout << "  (Not enough data yet - simulate a few days first.)\n";
        return;
    }

    // Pick at most `width` evenly spaced points from the data.
    std::vector<double> points;
    int count = std::min<int>(width, static_cast<int>(values.size()));
    for (int i = 0; i < count; ++i) {
        size_t index = static_cast<size_t>(std::llround(
            static_cast<double>(i) * (values.size() - 1) / (count - 1)));
        points.push_back(values[index]);
    }

    double lo = *std::min_element(points.begin(), points.end());
    double hi = *std::max_element(points.begin(), points.end());
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; }

    auto rowOf = [&](double v) {
        return static_cast<int>(std::lround((v - lo) / (hi - lo) * (height - 1)));
    };

    std::vector<std::string> grid(height, std::string(count, ' '));
    for (int x = 0; x < count; ++x) {
        int row = rowOf(points[x]);
        if (x > 0) {
            // Join this point to the previous one with a vertical line.
            int prev = rowOf(points[x - 1]);
            for (int r = std::min(row, prev) + 1; r < std::max(row, prev); ++r)
                grid[r][x] = '|';
        }
        grid[row][x] = '*';
    }

    const char* color = points.back() >= points.front() ? Color::Green : Color::Red;
    for (int r = height - 1; r >= 0; --r) {
        std::string label;
        if (r == height - 1) label = money(hi);
        else if (r == 0) label = money(lo);
        else if (r == (height - 1) / 2) label = money(lo + (hi - lo) * r / (height - 1));
        std::cout << padLeft(label, 14) << " |" << colored(grid[r], color) << "\n";
    }
    std::cout << std::string(15, ' ') << "+" << std::string(count, '-') << "\n"
              << std::string(16, ' ') << padRight("oldest", static_cast<size_t>(std::max(count - 5, 7))) << "today\n";
}

}  // namespace ConsoleUI
