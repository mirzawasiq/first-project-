#include "LoginDialog.h"

#include "AuthManager.h"
#include "Exceptions.h"

#include <QCheckBox>
#include <QLabel>
#include <QLineEdit>
#include <QPushButton>
#include <QStackedWidget>
#include <QVBoxLayout>

namespace {

QLineEdit* makeField(const QString& placeholder, bool password, QWidget* parent) {
    auto* field = new QLineEdit(parent);
    field->setPlaceholderText(placeholder);
    field->setMinimumHeight(40);
    if (password) field->setEchoMode(QLineEdit::Password);
    return field;
}

QCheckBox* makeShowPassword(const QList<QLineEdit*>& fields, QWidget* parent) {
    auto* box = new QCheckBox("Show password", parent);
    QObject::connect(box, &QCheckBox::toggled, parent, [fields](bool show) {
        for (QLineEdit* f : fields) f->setEchoMode(show ? QLineEdit::Normal : QLineEdit::Password);
    });
    return box;
}

QPushButton* makeLink(const QString& text, QWidget* parent) {
    auto* button = new QPushButton(text, parent);
    button->setObjectName("link");
    button->setCursor(Qt::PointingHandCursor);
    button->setFlat(true);
    return button;
}

}  // namespace

LoginDialog::LoginDialog(AuthManager& auth, QWidget* parent) : QDialog(parent), auth_(auth) {
    setWindowTitle("Asset Dashboard - Sign in");
    setObjectName("loginDialog");
    setFixedSize(440, 560);

    auto* layout = new QVBoxLayout(this);
    layout->setContentsMargins(40, 36, 40, 30);
    layout->setSpacing(6);

    auto* logo = new QLabel(QString(QChar(0x25C6)), this);  // diamond
    logo->setObjectName("logo");
    logo->setAlignment(Qt::AlignCenter);
    auto* title = new QLabel("Asset Dashboard", this);
    title->setObjectName("loginTitle");
    title->setAlignment(Qt::AlignCenter);
    auto* subtitle = new QLabel("Track, trade and grow your portfolio", this);
    subtitle->setObjectName("muted");
    subtitle->setAlignment(Qt::AlignCenter);
    layout->addWidget(logo);
    layout->addWidget(title);
    layout->addWidget(subtitle);
    layout->addSpacing(20);

    stack_ = new QStackedWidget(this);
    stack_->addWidget(buildSignIn());
    stack_->addWidget(buildRegister());
    layout->addWidget(stack_, 1);

    // Enter presses the main button of whichever form is showing (exactly once).
    for (QPushButton* b : findChildren<QPushButton*>()) b->setAutoDefault(false);
    signInButton_->setDefault(true);
    connect(stack_, &QStackedWidget::currentChanged, this, [this](int index) {
        (index == 0 ? signInButton_ : createButton_)->setDefault(true);
    });
}

QWidget* LoginDialog::buildSignIn() {
    auto* page = new QWidget(this);
    auto* layout = new QVBoxLayout(page);
    layout->setContentsMargins(0, 0, 0, 0);
    layout->setSpacing(10);

    loginUser_ = makeField("Username", false, page);
    loginPassword_ = makeField("Password", true, page);
    loginError_ = new QLabel(page);
    loginError_->setObjectName("error");
    loginError_->setWordWrap(true);
    auto* signIn = signInButton_ = new QPushButton("Sign in", page);
    signIn->setObjectName("primary");
    signIn->setMinimumHeight(42);
    auto* toRegister = makeLink("New here? Create an account", page);

    layout->addWidget(new QLabel("Welcome back", page));
    layout->addWidget(loginUser_);
    layout->addWidget(loginPassword_);
    layout->addWidget(makeShowPassword({loginPassword_}, page));
    layout->addWidget(loginError_);
    layout->addWidget(signIn);
    layout->addStretch();
    layout->addWidget(toRegister, 0, Qt::AlignCenter);

    connect(signIn, &QPushButton::clicked, this, &LoginDialog::signIn);
    connect(toRegister, &QPushButton::clicked, this, [this]() {
        stack_->setCurrentIndex(1);
        registerUser_->setFocus();
    });
    return page;
}

QWidget* LoginDialog::buildRegister() {
    auto* page = new QWidget(this);
    auto* layout = new QVBoxLayout(page);
    layout->setContentsMargins(0, 0, 0, 0);
    layout->setSpacing(10);

    registerUser_ = makeField("Choose a username (3-20 letters, numbers, _)", false, page);
    registerPassword_ = makeField("Password (6+ characters, a letter and a number)", true, page);
    registerConfirm_ = makeField("Confirm password", true, page);
    registerError_ = new QLabel(page);
    registerError_->setObjectName("error");
    registerError_->setWordWrap(true);
    auto* create = createButton_ = new QPushButton("Create account", page);
    create->setObjectName("primary");
    create->setMinimumHeight(42);
    auto* toSignIn = makeLink("Already have an account? Sign in", page);

    layout->addWidget(new QLabel("Create your account - you'll start with $10,000 to invest", page));
    layout->addWidget(registerUser_);
    layout->addWidget(registerPassword_);
    layout->addWidget(registerConfirm_);
    layout->addWidget(makeShowPassword({registerPassword_, registerConfirm_}, page));
    layout->addWidget(registerError_);
    layout->addWidget(create);
    layout->addStretch();
    layout->addWidget(toSignIn, 0, Qt::AlignCenter);

    connect(create, &QPushButton::clicked, this, &LoginDialog::createAccount);
    connect(toSignIn, &QPushButton::clicked, this, [this]() {
        stack_->setCurrentIndex(0);
        loginUser_->setFocus();
    });
    return page;
}

void LoginDialog::showError(QLabel* label, const QString& message) {
    label->setText(message);
}

void LoginDialog::signIn() {
    QString user = loginUser_->text().trimmed();
    if (user.isEmpty() || loginPassword_->text().isEmpty()) {
        showError(loginError_, "Please enter your username and password.");
        return;
    }
    if (!auth_.login(user.toStdString(), loginPassword_->text().toStdString())) {
        // Same message either way, so nobody can find out which usernames exist.
        showError(loginError_, "Wrong username or password.");
        loginPassword_->clear();
        return;
    }
    username_ = QString::fromStdString(AuthManager::normalize(user.toStdString()));
    newAccount_ = false;
    accept();
}

void LoginDialog::createAccount() {
    QString user = registerUser_->text().trimmed();
    if (registerPassword_->text() != registerConfirm_->text()) {
        showError(registerError_, "The two passwords don't match.");
        return;
    }
    try {
        auth_.registerUser(user.toStdString(), registerPassword_->text().toStdString());
    } catch (const std::exception& e) {
        showError(registerError_, e.what());
        return;
    }
    username_ = QString::fromStdString(AuthManager::normalize(user.toStdString()));
    newAccount_ = true;
    accept();
}
