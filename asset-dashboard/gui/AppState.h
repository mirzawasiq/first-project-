#pragma once

#include "Market.h"
#include "User.h"

#include <QSet>
#include <QString>

// Everything the screens share: the market, the logged-in user, and which
// live prices have been refreshed from CoinGecko in this session.
struct AppState {
    Market market;
    User user;
    QSet<QString> freshLive;  // symbols of live assets with an up-to-date price

    bool isFresh(const Asset& asset) const {
        return !asset.isLive() || freshLive.contains(QString::fromStdString(asset.getSymbol()));
    }
    // Live assets can only be traded once today's real price has arrived.
    bool canTrade(const Asset& asset) const { return asset.hasPrice() && isFresh(asset); }
};
