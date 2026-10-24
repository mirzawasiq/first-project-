// Tests for the CoinGecko code. A tiny fake HTTP server runs inside the test
// and answers with the same JSON shapes CoinGecko uses, so these tests work
// offline and never hit the real rate limit.
#include "CoinGeckoClient.h"
#include "CoinGeckoParser.h"

#include <QCoreApplication>
#include <QEventLoop>
#include <QNetworkProxy>
#include <QSignalSpy>
#include <QTcpServer>
#include <QTcpSocket>
#include <QTimer>

#include <iostream>

namespace {

int failures = 0;

#define CHECK(condition)                                                        \
    do {                                                                        \
        if (!(condition)) {                                                     \
            std::cerr << __FILE__ << ":" << __LINE__ << "  FAILED: " #condition \
                      << "\n";                                                  \
            ++failures;                                                         \
        }                                                                       \
    } while (0)

const QByteArray kSimplePrice = R"({"bitcoin":{"usd":67187.33},"ethereum":{"usd":3500.12}})";
const QByteArray kMarketChart =
    R"({"prices":[[1704067200000,42283.58],[1704153600000,44167.33],[1704240000000,44957.97]],)"
    R"("market_caps":[[1704067200000,827600000000]],"total_volumes":[[1704067200000,14000000000]]})";
const QByteArray kRateLimited =
    R"({"status":{"error_code":429,"error_message":"You've exceeded the Rate Limit."}})";

// Minimal HTTP/1.1 server: looks at the request path and sends canned JSON.
class FakeCoinGecko : public QTcpServer {
public:
    QByteArray lastRequest;
    bool rateLimit = false;

    FakeCoinGecko() {
        connect(this, &QTcpServer::newConnection, this, [this]() {
            QTcpSocket* socket = nextPendingConnection();
            connect(socket, &QTcpSocket::readyRead, socket, [this, socket]() {
                QByteArray request = socket->readAll();
                lastRequest = request;
                QByteArray body = kSimplePrice;
                QByteArray status = "200 OK";
                if (rateLimit) { body = kRateLimited; status = "429 Too Many Requests"; }
                else if (request.contains("/coins/bitcoin/market_chart")) body = kMarketChart;
                else if (request.contains("/coins/")) { body = R"({"error":"coin not found"})"; status = "404 Not Found"; }

                socket->write("HTTP/1.1 " + status + "\r\nContent-Type: application/json\r\n"
                              "Content-Length: " + QByteArray::number(body.size()) +
                              "\r\nConnection: close\r\n\r\n" + body);
                socket->disconnectFromHost();
            });
            connect(socket, &QTcpSocket::disconnected, socket, &QObject::deleteLater);
        });
        listen(QHostAddress::LocalHost);
    }
    QString url() const { return QString("http://127.0.0.1:%1/api/v3").arg(serverPort()); }
};

bool waitFor(QSignalSpy& spy) {
    return spy.count() > 0 || spy.wait(5000);
}

void testParser() {
    QString error;
    auto prices = CoinGeckoParser::parseSimplePrice(kSimplePrice, &error);
    CHECK(error.isEmpty());
    CHECK(prices.size() == 2);
    CHECK(qFuzzyCompare(prices.value("bitcoin"), 67187.33));

    error.clear();
    auto points = CoinGeckoParser::parseMarketChart(kMarketChart, &error);
    CHECK(error.isEmpty());
    CHECK(points.size() == 3);
    CHECK(points[0].x() == 1704067200000.0);
    CHECK(qFuzzyCompare(points[2].y(), 44957.97));

    error.clear();
    CoinGeckoParser::parseSimplePrice("not json", &error);
    CHECK(!error.isEmpty());

    error.clear();
    CoinGeckoParser::parseSimplePrice("{}", &error);  // unknown ids give an empty object
    CHECK(!error.isEmpty());

    CHECK(CoinGeckoParser::parseErrorMessage(kRateLimited) == "You've exceeded the Rate Limit.");
    CHECK(CoinGeckoParser::parseErrorMessage(R"({"error":"coin not found"})") == "coin not found");
}

void testClient() {
    FakeCoinGecko server;
    CoinGeckoClient client;
    client.setBaseUrl(server.url());
    client.setApiKey("CG-test-key");

    QSignalSpy prices(&client, &PriceProvider::pricesReceived);
    client.fetchCurrentPrices({"bitcoin", "ethereum"});
    CHECK(waitFor(prices));
    if (!prices.isEmpty()) {
        auto map = prices.first().first().value<QMap<QString, double>>();
        CHECK(qFuzzyCompare(map.value("ethereum"), 3500.12));
    }
    CHECK(server.lastRequest.contains("GET /api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd"));
    CHECK(server.lastRequest.toLower().contains("x-cg-demo-api-key: cg-test-key"));

    QSignalSpy history(&client, &PriceProvider::historyReceived);
    client.fetchHistory("bitcoin", 365);
    CHECK(waitFor(history));
    if (!history.isEmpty()) {
        CHECK(history.first().at(0).toString() == "bitcoin");
        CHECK(history.first().at(1).value<QList<QPointF>>().size() == 3);
    }
    CHECK(server.lastRequest.contains("days=365"));

    QSignalSpy failed(&client, &PriceProvider::requestFailed);
    client.fetchHistory("not-a-coin", 30);
    CHECK(waitFor(failed));
    if (!failed.isEmpty()) CHECK(failed.first().first().toString().contains("doesn't know"));

    server.rateLimit = true;
    QSignalSpy tested(&client, &PriceProvider::connectionTested);
    client.testConnection();
    CHECK(waitFor(tested));
    if (!tested.isEmpty()) {
        CHECK(tested.first().at(0).toBool() == false);
        CHECK(tested.first().at(1).toString().contains("Too many requests"));
    }
    CHECK(failed.count() == 1);  // the failed test didn't also emit requestFailed
}

void testUnreachable() {
    CoinGeckoClient client;
    client.setBaseUrl("http://127.0.0.1:1");  // nothing listens on port 1
    QSignalSpy failed(&client, &PriceProvider::requestFailed);
    client.fetchCurrentPrices({"bitcoin"});
    CHECK(waitFor(failed));
    if (!failed.isEmpty()) CHECK(failed.first().first().toString().startsWith("Can't reach"));
}

}  // namespace

int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    QNetworkProxy::setApplicationProxy(QNetworkProxy::NoProxy);  // talk to localhost directly

    testParser();
    testClient();
    testUnreachable();

    if (failures == 0) std::cout << "All API tests passed.\n";
    else std::cout << failures << " check(s) failed.\n";
    return failures == 0 ? 0 : 1;
}
