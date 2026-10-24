#pragma once

#include <QList>
#include <QMap>
#include <QObject>
#include <QPointF>
#include <QString>
#include <QStringList>

// Abstract interface for anything that can supply market prices.
// The app only talks to this interface, so another source (for example a
// stock-price API) can be added later as a new subclass.
//
// Network calls are asynchronous: the fetch functions return immediately and
// the answer arrives later through one of the signals.
class PriceProvider : public QObject {
    Q_OBJECT
public:
    using QObject::QObject;
    ~PriceProvider() override = default;

    virtual QString name() const = 0;
    virtual void fetchCurrentPrices(const QStringList& ids) = 0;
    virtual void fetchHistory(const QString& id, int days) = 0;
    virtual void testConnection() = 0;

signals:
    void pricesReceived(const QMap<QString, double>& usdPrices);           // id -> price
    void historyReceived(const QString& id, const QList<QPointF>& points); // x = unix ms, y = price
    void connectionTested(bool ok, const QString& message);
    void requestFailed(const QString& message);
};
