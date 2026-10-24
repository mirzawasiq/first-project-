#include "ManagePage.h"

#include "Format.h"

#include <QComboBox>
#include <QDesktopServices>
#include <QDoubleSpinBox>
#include <QFormLayout>
#include <QGridLayout>
#include <QGroupBox>
#include <QHBoxLayout>
#include <QLabel>
#include <QLineEdit>
#include <QMessageBox>
#include <QPushButton>
#include <QRegularExpressionValidator>
#include <QScrollArea>
#include <QUrl>
#include <QVBoxLayout>

#include <stdexcept>

ManagePage::ManagePage(AppState& state, const QString& apiKey, QWidget* parent) : Page(state, parent) {
    auto* outer = new QVBoxLayout(this);
    outer->setContentsMargins(0, 0, 0, 0);
    auto* scroll = new QScrollArea(this);
    scroll->setWidgetResizable(true);
    scroll->setFrameShape(QFrame::NoFrame);
    outer->addWidget(scroll);

    auto* content = new QWidget(scroll);
    content->setObjectName("content");
    auto* grid = new QGridLayout(content);
    grid->setContentsMargins(0, 0, 8, 0);
    grid->setSpacing(16);
    grid->addWidget(buildCashBox(), 0, 0);
    grid->addWidget(buildApiBox(apiKey), 0, 1);
    grid->addWidget(buildAddAssetBox(), 1, 0);
    grid->addWidget(buildRemoveBox(), 1, 1, Qt::AlignTop);
    grid->setRowStretch(2, 1);
    scroll->setWidget(content);
}

void ManagePage::setMessage(QLabel* label, const QString& text, bool ok) {
    label->setText(text);
    label->setStyleSheet("color: " + (ok ? Fmt::Colors::Green : Fmt::Colors::Red).name());
}

// ---------------------------------------------------------------- Cash

QWidget* ManagePage::buildCashBox() {
    auto* box = new QGroupBox("Cash", this);
    auto* layout = new QVBoxLayout(box);
    cashAmount_ = new QDoubleSpinBox(box);
    cashAmount_->setRange(1, 10'000'000);
    cashAmount_->setDecimals(2);
    cashAmount_->setPrefix("$ ");
    cashAmount_->setValue(1000);
    cashAmount_->setGroupSeparatorShown(true);
    auto* buttons = new QHBoxLayout;
    auto* deposit = new QPushButton("Deposit", box);
    deposit->setObjectName("buy");
    auto* withdraw = new QPushButton("Withdraw", box);
    withdraw->setObjectName("sell");
    buttons->addWidget(deposit);
    buttons->addWidget(withdraw);
    cashMessage_ = new QLabel(box);
    cashMessage_->setWordWrap(true);

    layout->addWidget(new QLabel("Amount", box));
    layout->addWidget(cashAmount_);
    layout->addLayout(buttons);
    layout->addWidget(cashMessage_);

    auto move = [this](bool isDeposit) {
        Portfolio& p = state_.user.getPortfolio();
        try {
            if (isDeposit) p.deposit(cashAmount_->value(), DateUtil::today());
            else p.withdraw(cashAmount_->value(), DateUtil::today());
            setMessage(cashMessage_, QString("%1 %2. Cash is now %3.")
                                         .arg(isDeposit ? "Deposited" : "Withdrew", Fmt::money(cashAmount_->value()),
                                              Fmt::money(p.getCash())), true);
            emit stateChanged();
        } catch (const std::exception& e) {
            setMessage(cashMessage_, e.what(), false);
        }
    };
    connect(deposit, &QPushButton::clicked, this, [move]() { move(true); });
    connect(withdraw, &QPushButton::clicked, this, [move]() { move(false); });
    return box;
}

// ---------------------------------------------------------------- Add asset

QWidget* ManagePage::buildAddAssetBox() {
    auto* box = new QGroupBox("Add a new asset", this);
    auto* form = new QFormLayout(box);
    form->setLabelAlignment(Qt::AlignLeft);
    form->setVerticalSpacing(10);

    assetType_ = new QComboBox(box);
    assetType_->addItems({"Crypto", "Stock", "Commodity"});
    symbol_ = new QLineEdit(box);
    symbol_->setPlaceholderText("e.g. DOGE");
    symbol_->setValidator(new QRegularExpressionValidator(QRegularExpression("[A-Za-z0-9]{1,8}"), symbol_));
    name_ = new QLineEdit(box);
    name_->setPlaceholderText("e.g. Dogecoin");
    extra_ = new QLineEdit(box);
    apiId_ = new QLineEdit(box);
    apiId_->setPlaceholderText("e.g. dogecoin  (leave empty to simulate)");
    startPrice_ = new QDoubleSpinBox(box);
    startPrice_->setRange(0.0001, 10'000'000);
    startPrice_->setDecimals(4);
    startPrice_->setPrefix("$ ");
    startPrice_->setValue(100);
    volatility_ = new QDoubleSpinBox(box);
    volatility_->setRange(0, 50);
    volatility_->setSuffix(" % per day");
    volatility_->setValue(4.0);
    auto* add = new QPushButton("Add asset", box);
    add->setObjectName("primary");
    addMessage_ = new QLabel(box);
    addMessage_->setWordWrap(true);

    auto* idHelp = new QLabel("<a href='https://www.coingecko.com/' style='color:#a5b4fc'>Find the id</a>: "
                              "open the coin on coingecko.com and copy the \"API ID\" shown on its page.", box);
    idHelp->setObjectName("muted");
    idHelp->setWordWrap(true);
    idHelp->setOpenExternalLinks(true);

    form->addRow("Type", assetType_);
    form->addRow("Symbol", symbol_);
    form->addRow("Name", name_);
    form->addRow("Network", extra_);
    form->addRow("CoinGecko id", apiId_);
    form->addRow("", idHelp);
    form->addRow("Start price", startPrice_);
    form->addRow("Volatility", volatility_);
    form->addRow("", add);
    form->addRow("", addMessage_);

    // Change labels and defaults to fit the chosen type.
    auto updateForType = [this, form]() {
        QString type = assetType_->currentText();
        auto* label = qobject_cast<QLabel*>(form->labelForField(extra_));
        if (type == "Crypto") { label->setText("Network"); extra_->setPlaceholderText("e.g. Dogecoin"); volatility_->setValue(4.0); }
        if (type == "Stock") { label->setText("Sector"); extra_->setPlaceholderText("e.g. Technology"); volatility_->setValue(1.5); }
        if (type == "Commodity") { label->setText("Unit"); extra_->setPlaceholderText("e.g. barrel"); volatility_->setValue(0.8); }
    };
    connect(assetType_, &QComboBox::currentIndexChanged, this, updateForType);
    // With a CoinGecko id the price comes from the API, so no start price is needed.
    connect(apiId_, &QLineEdit::textChanged, this,
            [this](const QString& text) { startPrice_->setEnabled(text.trimmed().isEmpty()); });
    connect(add, &QPushButton::clicked, this, &ManagePage::addAsset);
    return box;
}

void ManagePage::addAsset() {
    auto clean = [](QString s) { return s.replace('|', '/').trimmed().toStdString(); };  // '|' is used in save files
    std::string symbol = symbol_->text().trimmed().toUpper().toStdString();
    std::string apiId = apiId_->text().trimmed().toLower().toStdString();
    if (symbol.empty()) {
        setMessage(addMessage_, "Please enter a symbol.", false);
        return;
    }
    std::string name = clean(name_->text());
    try {
        auto asset = Market::createAsset(assetType_->currentText().toStdString(), symbol,
                                         name.empty() ? symbol : name, volatility_->value() / 100.0,
                                         clean(extra_->text()), apiId);
        if (apiId.empty()) asset->setPrice(DateUtil::today(), startPrice_->value());
        state_.market.addAsset(std::move(asset));
    } catch (const std::exception& e) {
        setMessage(addMessage_, e.what(), false);
        return;
    }

    setMessage(addMessage_, apiId.empty()
                                ? QString::fromStdString(symbol) + " added with a simulated price."
                                : QString::fromStdString(symbol) + " added. Fetching its price from CoinGecko...",
               true);
    for (QLineEdit* field : {symbol_, name_, extra_, apiId_}) field->clear();
    emit stateChanged();
    if (!apiId.empty()) emit liveAssetAdded(QString::fromStdString(symbol));
}

// ---------------------------------------------------------------- Remove

QWidget* ManagePage::buildRemoveBox() {
    auto* box = new QGroupBox("Remove an asset", this);
    auto* layout = new QVBoxLayout(box);
    removeChoice_ = new QComboBox(box);
    auto* remove = new QPushButton("Remove from market", box);
    remove->setObjectName("sell");
    removeMessage_ = new QLabel(box);
    removeMessage_->setWordWrap(true);
    auto* note = new QLabel("You can only remove assets you don't own.", box);
    note->setObjectName("muted");
    layout->addWidget(removeChoice_);
    layout->addWidget(remove);
    layout->addWidget(note);
    layout->addWidget(removeMessage_);

    connect(remove, &QPushButton::clicked, this, [this]() {
        std::string symbol = removeChoice_->currentData().toString().toStdString();
        if (symbol.empty()) return;
        if (state_.user.getPortfolio().getQuantity(symbol) > 0) {
            setMessage(removeMessage_, "Sell your " + QString::fromStdString(symbol) + " first.", false);
            return;
        }
        if (QMessageBox::question(this, "Remove asset",
                                  "Remove " + QString::fromStdString(symbol) + " and its price history?") !=
            QMessageBox::Yes)
            return;
        state_.market.removeAsset(symbol);
        setMessage(removeMessage_, QString::fromStdString(symbol) + " removed.", true);
        emit stateChanged();
    });
    return box;
}

// ---------------------------------------------------------------- API key

QWidget* ManagePage::buildApiBox(const QString& apiKey) {
    auto* box = new QGroupBox("CoinGecko live prices", this);
    auto* layout = new QVBoxLayout(box);
    auto* intro = new QLabel("Crypto and gold prices come from the CoinGecko API. Create a free account on "
                             "coingecko.com, make a Demo API key and paste it here.", box);
    intro->setWordWrap(true);
    intro->setObjectName("muted");

    apiKey_ = new QLineEdit(apiKey, box);
    apiKey_->setPlaceholderText("CG-xxxxxxxxxxxxxxxxxxxxxxxx");
    apiKey_->setEchoMode(QLineEdit::Password);
    auto* buttons = new QHBoxLayout;
    auto* save = new QPushButton("Save && test", box);
    save->setObjectName("primary");
    auto* getKey = new QPushButton("Get a free key", box);
    buttons->addWidget(save);
    buttons->addWidget(getKey);
    apiMessage_ = new QLabel(box);
    apiMessage_->setWordWrap(true);

    layout->addWidget(intro);
    layout->addWidget(new QLabel("Demo API key", box));
    layout->addWidget(apiKey_);
    layout->addLayout(buttons);
    layout->addWidget(apiMessage_);

    connect(save, &QPushButton::clicked, this, [this]() {
        apiMessage_->setStyleSheet("");
        apiMessage_->setText("Testing connection...");
        emit apiKeySaved(apiKey_->text().trimmed());
        emit testConnectionRequested();
    });
    connect(getKey, &QPushButton::clicked, this,
            []() { QDesktopServices::openUrl(QUrl("https://www.coingecko.com/en/api/pricing")); });
    return box;
}

void ManagePage::showConnectionResult(bool ok, const QString& message) {
    setMessage(apiMessage_, message, ok);
}

void ManagePage::refresh() {
    QStringList symbols;
    for (const auto& a : state_.market.getAssets()) symbols << Fmt::qs(a->getSymbol());
    if (Fmt::comboHasSymbols(removeChoice_, symbols)) return;

    QString keep = removeChoice_->currentData().toString();
    removeChoice_->clear();
    for (const auto& a : state_.market.getAssets())
        removeChoice_->addItem(Fmt::qs(a->getSymbol() + "  -  " + a->getName()), Fmt::qs(a->getSymbol()));
    int index = removeChoice_->findData(keep);
    if (index >= 0) removeChoice_->setCurrentIndex(index);
}
