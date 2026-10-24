# How the app gets live prices from CoinGecko

This guide explains, step by step, how the dashboard talks to the CoinGecko API.
Read it top to bottom once, then open the files it mentions side by side.

## 1. What is an API?

An **API** (Application Programming Interface) is a way for one program to ask another
program for data. CoinGecko runs a server that knows the price of thousands of coins.
We send it an **HTTP request** (just like a browser opening a web page), and it sends back
**JSON**, a text format for data.

```
  Our app                                     CoinGecko server
     |   GET /api/v3/simple/price?ids=bitcoin&vs_currencies=usd  |
     | --------------------------------------------------------> |
     |                                                           |
     |   200 OK   {"bitcoin":{"usd":67187.33}}                   |
     | <-------------------------------------------------------- |
```

A request has:
- a **base URL**: `https://api.coingecko.com/api/v3`
- an **endpoint** (path): `/simple/price`
- **query parameters** after the `?`: `ids=bitcoin&vs_currencies=usd`
- **headers**, extra info such as our API key: `x-cg-demo-api-key: CG-xxxx`

The reply has a **status code** (`200` = OK, `401` = bad or missing key, `404` = not found,
`429` = too many requests) and a **body** (the JSON).

## 2. Get your free API key

1. Make a free account at <https://www.coingecko.com>.
2. Open the [Developer Dashboard / API pricing page](https://www.coingecko.com/en/api/pricing),
   choose the free **Demo** plan and create a key. It looks like `CG-abc123...`.
3. In the app, go to **Manage & Settings → CoinGecko live prices**, paste the key and press
   **Save & test**. You should see "Connected! Bitcoin is $...".

Demo plan limits (from CoinGecko's docs): **100 calls per minute**, **10,000 calls per month**,
and **365 days** of price history. Every call counts, even failed ones.

> Never commit your API key to GitHub. The app saves it in your computer's settings
> (QSettings), not in the project folder, so it is never pushed.

## 3. Try it yourself first (no C++ needed)

Paste these into your browser (replace `YOUR_KEY`) or run them with `curl`:

```bash
# Latest price of two coins
curl -H "x-cg-demo-api-key: YOUR_KEY" \
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd"
# -> {"bitcoin":{"usd":67187.33},"ethereum":{"usd":3500.12}}

# One price per day for the last 30 days
curl -H "x-cg-demo-api-key: YOUR_KEY" \
  "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=30&interval=daily"
# -> {"prices":[[1727136000000,63201.5],[1727222400000,64012.9], ...],
#     "market_caps":[...], "total_volumes":[...]}
```

In `market_chart`, each item in `prices` is `[timestamp, price]`. The timestamp is
**milliseconds since 1 January 1970 (UTC)**. The last item is "right now".

### What is a coin "id"?

CoinGecko names coins by an **id**, not by their symbol, because many coins share symbols.
Examples: `bitcoin`, `ethereum`, `solana`, `binancecoin`, `dogecoin`, `pax-gold`.
To find one, open the coin's page on coingecko.com and look for **"API ID"**.

## 4. The two endpoints we use

| What we need | Endpoint | Used for |
|---|---|---|
| Latest prices of all live coins in **one** call | `GET /simple/price?ids=a,b,c&vs_currencies=usd` | Every 60 seconds, and when you press *Refresh prices* |
| One year of daily prices for one coin | `GET /coins/{id}/market_chart?vs_currency=usd&days=365&interval=daily` | At start-up when our saved history is missing or old, and when you add a new live coin |

That's about 6 calls when the app starts and 1 call per minute after that, well under the limit.

## 5. How it's built in C++ (the code)

There are three layers. Each one only knows about the one below it.

```
 gui/MainWindow.cpp       uses the prices: updates assets, refreshes the screen
        |  signals: pricesReceived / historyReceived / requestFailed
 api/CoinGeckoClient.cpp  sends HTTP requests with Qt's QNetworkAccessManager
        |  raw JSON bytes
 api/CoinGeckoParser.cpp  turns JSON text into C++ values
```

### 5.1 `PriceProvider`: an abstract interface (OOP)

[`api/PriceProvider.h`](../api/PriceProvider.h) declares *what* a price source can do
(pure virtual functions) and the **signals** it emits when answers arrive.
`CoinGeckoClient` inherits from it. If your group later wants real stock prices, you write
a new subclass (for example `AlphaVantageClient : public PriceProvider`) and the GUI
doesn't need to change. That is polymorphism.

### 5.2 Sending a request: `CoinGeckoClient::get()`

[`api/CoinGeckoClient.cpp`](../api/CoinGeckoClient.cpp), simplified:

```cpp
QUrl url(baseUrl_ + path);           // https://api.coingecko.com/api/v3/simple/price
url.setQuery(query);                 // ?ids=bitcoin,ethereum&vs_currencies=usd

QNetworkRequest request(url);
request.setRawHeader("x-cg-demo-api-key", apiKey_.toUtf8());   // our key
request.setTransferTimeout(15000);   // give up after 15 s

QNetworkReply* reply = network_.get(request);   // returns IMMEDIATELY

connect(reply, &QNetworkReply::finished, this, [=]() {   // runs LATER
    reply->deleteLater();
    QByteArray body = reply->readAll();
    if (reply->error() == QNetworkReply::NoError) onSuccess(body);
    else onFailure(describeError(reply, body));
});
```

**The key idea is that this is asynchronous.** `network_.get()` doesn't wait for the
internet. It returns straight away, so the window never freezes. When the reply arrives,
Qt calls the lambda we connected to `finished`. This **signal and slot** pattern is how all
Qt networking works.

### 5.3 Reading the JSON: `CoinGeckoParser`

[`api/CoinGeckoParser.cpp`](../api/CoinGeckoParser.cpp) uses Qt's built-in JSON classes:

```cpp
// body = {"bitcoin":{"usd":67187.33},"ethereum":{"usd":3500.12}}
QJsonObject root = QJsonDocument::fromJson(body).object();
for (auto it = root.begin(); it != root.end(); ++it) {
    double usd = it.value().toObject().value("usd").toDouble();
    prices.insert(it.key(), usd);          // "bitcoin" -> 67187.33
}
```

For `market_chart`, it loops over the `"prices"` array and makes a `QPointF(timestamp, price)`
for each pair. Keeping the parser separate from the network code means we can test it with
sample JSON, without the internet ([`tests/api_tests.cpp`](../tests/api_tests.cpp)).

### 5.4 Using the prices: `MainWindow`

[`gui/MainWindow.cpp`](../gui/MainWindow.cpp) connects the client's signals to its own functions:

```cpp
connect(prices_, &PriceProvider::pricesReceived,  this, &MainWindow::onPricesReceived);
connect(prices_, &PriceProvider::historyReceived, this, &MainWindow::onHistoryReceived);
connect(prices_, &PriceProvider::requestFailed,   this, &MainWindow::onRequestFailed);
```

- `onPricesReceived` finds each asset by its CoinGecko id (`Market::findByApiId`) and calls
  `asset->setPrice(today, price)`.
- `onHistoryReceived` converts each millisecond timestamp to a calendar day
  (`DateUtil::fromUnixMillis`), keeps the last price of each day, and calls `asset->setHistory(...)`.
- `onRequestFailed` shows the error in the status line. The app keeps working with the
  last saved prices, but **won't let you trade a live coin at a stale price**.

A `QTimer` calls `requestLivePrices()` every 60 seconds.

### 5.5 Being polite: rate limiting and errors

- Requests go into a **queue** and are sent **at most one every 1.5 seconds**
  (`pending_` + `throttle_` in `CoinGeckoClient`).
- `describeError()` turns status codes into readable messages:
  `429` → "Too many requests…", `401` → "needs a free Demo API key / rejected the key",
  `404` → "doesn't know that coin id", no connection → "Can't reach CoinGecko".

## 6. Testing without the internet

`tests/api_tests.cpp` starts a **tiny fake CoinGecko server** on your own computer
(`QTcpServer`) that replies with the same JSON shapes. The client is pointed at it with
`setBaseUrl("http://127.0.0.1:<port>/api/v3")`. The test checks that:

- the right URL and API-key header are sent,
- prices and history are parsed correctly,
- 404, 429 and "server unreachable" give the right messages.

You can also point the **whole app** at a fake server by setting an environment variable
before starting it:

```bash
COINGECKO_BASE_URL=http://127.0.0.1:8765/api/v3 ./AssetDashboard
```

## 7. Ideas to extend it (good for your report)

- Show the coin's logo: `/coins/markets?vs_currency=usd&ids=...` also returns an `image` URL.
- Show prices in PKR: use `vs_currencies=pkr`.
- Add a "search any coin" box with `/search?query=doge`.
- Add real stock prices by writing another `PriceProvider` subclass for a stock API.
