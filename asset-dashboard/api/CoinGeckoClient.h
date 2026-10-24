#pragma once

#include "PriceProvider.h"

#include <QNetworkAccessManager>
#include <QQueue>
#include <QTimer>
#include <QUrlQuery>

#include <functional>

class QNetworkReply;

// Talks to the CoinGecko REST API (https://docs.coingecko.com).
//
//   GET /simple/price?ids=bitcoin,ethereum&vs_currencies=usd   -> latest prices
//   GET /coins/bitcoin/market_chart?vs_currency=usd&days=365   -> daily history
//   GET /ping                                                  -> health check
//
// A free "Demo" API key is sent in the x-cg-demo-api-key header (Demo plan:
// 100 calls/minute, 10,000 calls/month, 365 days of history). Requests are
// queued and sent at most one every 1.5 s to be gentle on that limit.
class CoinGeckoClient : public PriceProvider {
    Q_OBJECT
public:
    explicit CoinGeckoClient(QObject* parent = nullptr);

    QString name() const override { return "CoinGecko"; }
    void setApiKey(const QString& key) { apiKey_ = key.trimmed(); }
    void setBaseUrl(const QString& url);  // lets tests point at a fake server

    void fetchCurrentPrices(const QStringList& ids) override;
    void fetchHistory(const QString& id, int days) override;
    void testConnection() override;

    static const QString kDefaultBaseUrl;

private:
    using Handler = std::function<void(const QByteArray& body)>;
    using FailureHandler = std::function<void(const QString& message)>;

    // Queues a GET request. `onSuccess` runs with the body on HTTP 200;
    // otherwise `onFailure` gets a readable message (default: requestFailed()).
    void get(const QString& path, const QUrlQuery& query, Handler onSuccess,
             FailureHandler onFailure = nullptr);
    void sendNext();
    QString describeError(QNetworkReply* reply, const QByteArray& body) const;

    QNetworkAccessManager network_;
    QString baseUrl_;
    QString apiKey_;
    QQueue<std::function<void()>> pending_;
    QTimer throttle_;
};
