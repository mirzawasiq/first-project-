#pragma once

#include "AppState.h"

#include <QWidget>

// Base class for every screen in the main window. MainWindow keeps a list
// of Page* and calls refresh() on whichever one is visible (polymorphism).
class Page : public QWidget {
    Q_OBJECT
public:
    explicit Page(AppState& state, QWidget* parent = nullptr) : QWidget(parent), state_(state) {}
    ~Page() override = default;

    virtual QString title() const = 0;
    virtual void refresh() = 0;

signals:
    void tradeRequested(const QString& symbol, bool buy);
    void stateChanged();  // data was changed and should be saved

protected:
    AppState& state_;
};
