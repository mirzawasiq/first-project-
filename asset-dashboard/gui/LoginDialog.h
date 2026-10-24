#pragma once

#include <QDialog>

class AuthManager;
class QLabel;
class QLineEdit;
class QPushButton;
class QStackedWidget;

// First window: sign in, or create a new account.
class LoginDialog : public QDialog {
    Q_OBJECT
public:
    explicit LoginDialog(AuthManager& auth, QWidget* parent = nullptr);

    QString username() const { return username_; }
    bool isNewAccount() const { return newAccount_; }

private:
    QWidget* buildSignIn();
    QWidget* buildRegister();
    void signIn();
    void createAccount();
    void showError(QLabel* label, const QString& message);

    AuthManager& auth_;
    QString username_;
    bool newAccount_ = false;

    QStackedWidget* stack_;
    QPushButton* signInButton_;
    QPushButton* createButton_;
    QLineEdit* loginUser_;
    QLineEdit* loginPassword_;
    QLabel* loginError_;
    QLineEdit* registerUser_;
    QLineEdit* registerPassword_;
    QLineEdit* registerConfirm_;
    QLabel* registerError_;
};
