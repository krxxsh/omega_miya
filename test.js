const { app } = require('electron');
console.log("App exists:", !!app);
if (app) {
    console.log("isPackaged:", app.isPackaged);
    app.quit();
} else {
    console.error("App is undefined. Exported object:", Object.keys(require('electron')));
    process.exit(1);
}
