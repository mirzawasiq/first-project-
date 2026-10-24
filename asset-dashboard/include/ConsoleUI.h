#pragma once

#include <string>
#include <vector>

// Small helpers for reading input and drawing text in the terminal.
namespace ConsoleUI {

namespace Color {
extern const char* const Reset;
extern const char* const Green;
extern const char* const Red;
extern const char* const Yellow;
extern const char* const Cyan;
extern const char* const Bold;
}  // namespace Color

void enableColors();  // turns on ANSI colours (needed on Windows)
std::string colored(const std::string& text, const char* color);
std::string gainColored(const std::string& text, double change);  // green up, red down

std::string money(double value);
std::string signedMoney(double value);
std::string percent(double value);
std::string number(double value, int decimals = 4);
std::string padRight(const std::string& text, size_t width);
std::string padLeft(const std::string& text, size_t width);
std::string trendLabel(double change);  // "UP" / "DOWN" / "FLAT"

std::string readLine(const std::string& prompt);
int readInt(const std::string& prompt, int min, int max);
double readDouble(const std::string& prompt, double min);
bool confirm(const std::string& prompt);
void pause();
void clearScreen();

void printTitle(const std::string& title);
void printLine(size_t width = 78);

// Draws a line chart of `values` using ASCII characters.
void drawChart(const std::vector<double>& values, int height = 12, int width = 60);

}  // namespace ConsoleUI
