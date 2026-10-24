#include "CoinGeckoClient.h"

#include "CoinGeckoParser.h"

#include <QNetworkReply>
#include <QNetworkRequest>
#include <QUrl>

const QString CoinGeckoClient::kDefaultBaseUrl = "https://api.coingecko.com/api/v3";

CoinGeckoClient::CoinGeckoClient(QObject* parent)
    : PriceProvider(parent), baseUrl_(kDefaultBaseUrl) {
    throttle_.setInterval(1500);
    connect(&throttle_, &QTimer::timeout, this, &CoinGeckoClient::sendNext);
}

void CoinGeckoClient::setBaseUrl(const QString& url) {
    baseUrl_ = url;
    while (baseUrl_.endsWith('/')) baseUrl_.chop(1);
}

void CoinGeckoClient::fetchCurrentPrices(const QStringList& ids) {
    if (ids.isEmpty()) return;
    QUrlQuery query;
    query.addQueryItem("ids", ids.join(','));
    query.addQueryItem("vs_currencies", "usd");
    get("/simple/price", query, [this](const QByteArray& body) {
        QString error;
        QMap<QString, double> prices = CoinGeckoParser::parseSimplePrice(body, &error);
        if (error.isEmpty()) emit pricesReceived(prices);
        else emit requestFailed(error);
    });
}

void CoinGeckoClient::fetchHistory(const QString& id, int days) {
    QUrlQuery query;
    query.addQueryItem("vs_currency", "usd");
    query.addQueryItem("days", QString::number(days));
    query.addQueryItem("interval", "daily");
    get("/coins/" + id + "/market_chart", query, [this, id](const QByteArray& body) {
        QString error;
        QList<QPointF> points = CoinGeckoParser::parseMarketChart(body, &error);
        if (error.isEmpty()) emit historyReceived(id, points);
        else emit requestFailed(id + ": " + error);
    });
}

void CoinGeckoClient::testConnection() {
    // /ping doesn't check the key, so ask for one real price instead.
    QUrlQuery query;
    query.addQueryItem("ids", "bitcoin");
    query.addQueryItem("vs_currencies", "usd");
    get("/simple/price", query, [this](const QByteArray& body) {
        QString error;
        QMap<QString, double> prices = CoinGeckoParser::parseSimplePrice(body, &error);
        if (error.isEmpty())
            emit connectionTested(true, QString("Connected! Bitcoin is $%1")
                                            .arg(prices.value("bitcoin"), 0, 'f', 2));
        else
            emit connectionTested(false, error);
    }, [this](const QString& message) { emit connectionTested(false, message); });
}

void CoinGeckoClient::get(const QString& path, const QUrlQuery& query, Handler onSuccess,
                          FailureHandler onFailure) {
    if (!onFailure) onFailure = [this](const QString& message) { emit requestFailed(message); };
    pending_.enqueue([this, path, query, onSuccess, onFailure]() {
        QUrl url(baseUrl_ + path);
        url.setQuery(query);

        QNetworkRequest request(url);
        request.setRawHeader("accept", "application/json");
        if (!apiKey_.isEmpty()) request.setRawHeader("x-cg-demo-api-key", apiKey_.toUtf8());
        request.setTransferTimeout(15000);  // give up after 15 seconds

        QNetworkReply* reply = network_.get(request);
        // The lambda runs later, when the response has fully arrived.
        connect(reply, &QNetworkReply::finished, this, [this, reply, onSuccess, onFailure]() {
            reply->deleteLater();
            QByteArray body = reply->readAll();
            if (reply->error() == QNetworkReply::NoError) {
                onSuccess(body);
            } else {
                onFailure(describeError(reply, body));
            }
        });
    });

    // Send right away if nothing was sent recently, otherwise wait our turn.
    if (!throttle_.isActive()) {
        sendNext();
        throttle_.start();
    }
}

void CoinGeckoClient::sendNext() {
    if (pending_.isEmpty()) {
        throttle_.stop();
        return;
    }
    pending_.dequeue()();
}

QString CoinGeckoClient::describeError(QNetworkReply* reply, const QByteArray& body) const {
    int status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
    QString serverMessage = CoinGeckoParser::parseErrorMessage(body);

    if (status == 429) return "Too many requests to CoinGecko. Wait a minute and try again.";
    if ((status == 401 || status == 403) && apiKey_.isEmpty())
        return "CoinGecko needs a free Demo API key. Add one under Manage & Settings.";
    if (status == 401 || status == 403)
        return "CoinGecko rejected the API key. Check it in Settings." +
               (serverMessage.isEmpty() ? QString() : " (" + serverMessage + ")");
    if (status == 404) return "CoinGecko doesn't know that coin id." +
                              (serverMessage.isEmpty() ? QString() : " (" + serverMessage + ")");
    if (status != 0)
        return QString("CoinGecko error %1: %2").arg(status)
            .arg(serverMessage.isEmpty() ? reply->errorString() : serverMessage);
    return "Can't reach CoinGecko: " + reply->errorString();
}
