CXX      ?= g++
CXXFLAGS ?= -std=c++17 -Wall -Wextra -pedantic -O2
TARGET   := asset_dashboard

$(TARGET): $(wildcard src/*.cpp) $(wildcard include/*.h)
	$(CXX) $(CXXFLAGS) -Iinclude src/*.cpp -o $(TARGET)

run: $(TARGET)
	./$(TARGET)

clean:
	rm -f $(TARGET) $(TARGET).exe portfolio_data.txt

.PHONY: run clean
