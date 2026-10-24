#include "CoinGeckoParser.h"

#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>

namespace CoinGeckoParser {

namespace {
QJsonDocument parse(const QByteArray& json, QString* error) {
    QJsonParseError parseError;
    QJsonDocument doc = QJsonDocument::fromJson(json, &parseError);
    if (parseError.error != QJsonParseError::NoError)
        *error = "Invalid JSON from CoinGecko: " + parseError.errorString();
    else if (!doc.isObject())
        *error = "Unexpected response from CoinGecko";
    return doc;
}
}  // namespace

QMap<QString, double> parseSimplePrice(const QByteArray& json, QString* error) {
    QMap<QString, double> prices;
    QJsonDocument doc = parse(json, error);
    if (!error->isEmpty()) return prices;

    QJsonObject root = doc.object();
    for (auto it = root.begin(); it != root.end(); ++it) {
        QJsonValue usd = it.value().toObject().value("usd");
        if (usd.isDouble() && usd.toDouble() > 0) prices.insert(it.key(), usd.toDouble());
    }
    if (prices.isEmpty()) *error = "CoinGecko returned no prices (check the coin ids)";
    return prices;
}

QList<QPointF> parseMarketChart(const QByteArray& json, QString* error) {
    QList<QPointF> points;
    QJsonDocument doc = parse(json, error);
    if (!error->isEmpty()) return points;

    QJsonValue prices = doc.object().value("prices");
    if (!prices.isArray()) {
        *error = "CoinGecko response has no \"prices\" list";
        return points;
    }
    for (const QJsonValue& entry : prices.toArray()) {
        QJsonArray pair = entry.toArray();  // [timestamp in ms, price]
        if (pair.size() >= 2 && pair[1].toDouble() > 0)
            points.append(QPointF(pair[0].toDouble(), pair[1].toDouble()));
    }
    if (points.isEmpty()) *error = "CoinGecko returned an empty price history";
    return points;
}

QString parseErrorMessage(const QByteArray& json) {
    QJsonObject root = QJsonDocument::fromJson(json).object();
    QString message = root.value("status").toObject().value("error_message").toString();
    if (message.isEmpty()) message = root.value("error").toString();
    return message;
}

}  // namespace CoinGeckoParser
