cmake_minimum_required(VERSION 3.10)
project(AssetDashboard CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

file(GLOB SOURCES ${CMAKE_SOURCE_DIR}/src/*.cpp)
add_executable(asset_dashboard ${SOURCES})
target_include_directories(asset_dashboard PRIVATE ${CMAKE_SOURCE_DIR}/include)

if(MSVC)
    target_compile_options(asset_dashboard PRIVATE /W4)
else()
    target_compile_options(asset_dashboard PRIVATE -Wall -Wextra -pedantic)
endif()
