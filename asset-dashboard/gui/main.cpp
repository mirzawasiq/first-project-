#include "AuthManager.h"
#include "LoginDialog.h"
#include "MainWindow.h"

#include <QApplication>
#include <QDir>
#include <QFile>
#include <QMessageBox>
#include <QStandardPaths>
#include <QStyleFactory>

int main(int argc, char* argv[]) {
    QApplication app(argc, argv);
    QApplication::setOrganizationName("AssetDashboard");
    QApplication::setApplicationName("AssetDashboard");
    QApplication::setStyle(QStyleFactory::create("Fusion"));

    QFile style(":/style.qss");
    if (style.open(QIODevice::ReadOnly)) app.setStyleSheet(QString::fromUtf8(style.readAll()));

    // Accounts and portfolios are saved in the user's app-data folder, e.g.
    // C:/Users/<you>/AppData/Roaming/AssetDashboard/AssetDashboard on Windows.
    QString dataDir = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
    if (!QDir().mkpath(dataDir)) {
        QMessageBox::critical(nullptr, "Asset Dashboard", "Cannot create data folder:\n" + dataDir);
        return 1;
    }
    AuthManager auth((dataDir + "/users.txt").toStdString());

    // Show the login window; logging out brings it back.
    while (true) {
        LoginDialog login(auth);
        if (login.exec() != QDialog::Accepted) return 0;

        MainWindow window(login.username(), dataDir, login.isNewAccount());
        window.show();
        app.exec();
        if (!window.loggedOut()) return 0;
    }
}
