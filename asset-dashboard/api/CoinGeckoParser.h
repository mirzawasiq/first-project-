#pragma once

#include <QByteArray>
#include <QList>
#include <QMap>
#include <QPointF>
#include <QString>

// Turns CoinGecko's JSON responses into plain Qt values. Kept separate from
// the network code so it can be unit-tested with sample JSON.
namespace CoinGeckoParser {

// /simple/price  ->  {"bitcoin":{"usd":67187.33},"ethereum":{"usd":3500.12}}
QMap<QString, double> parseSimplePrice(const QByteArray& json, QString* error);

// /coins/{id}/market_chart  ->  {"prices":[[1711843200000,69702.3],...], ...}
QList<QPointF> parseMarketChart(const QByteArray& json, QString* error);

// Error bodies look like {"status":{"error_code":429,"error_message":"..."}}
// or {"error":"coin not found"}. Returns an empty string if there is none.
QString parseErrorMessage(const QByteArray& json);

}  // namespace CoinGeckoParser
