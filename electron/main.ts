/*
 * Zycord, a Discord client
 * Copyright (c) 2026 Zynu
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, ipcMain, shell } from "electron";
import { join } from "path";

import { APP_ID, APP_NAME, discordUrl } from "./constants";
import { registerZycordIpc, ZycordIpc } from "./ipc";
import { buildMenu, configureSession, createMainWindow, getMainWindow } from "./window";

// setName must happen before any getPath call: Electron resolves userData lazily
// and caches it, so setting the name afterwards leaves the app writing to
// %APPDATA%\Electron instead of %APPDATA%\Zycord.
app.setName(APP_NAME);

// The Zycord data directory mirrors what the Vencord main bundle expects.
// Pin it explicitly so a stale folder from another build cannot shadow it.
const userData = join(app.getPath("appData"), APP_NAME);
app.setPath("userData", userData);
process.env.VENCORD_USER_DATA_DIR = userData;
process.env.DATA_DIR = userData;

if (process.platform === "win32") app.setAppUserModelId(APP_ID);

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on("second-instance", () => {
        const win = getMainWindow();
        if (!win) return;
        if (win.isMinimized()) win.restore();
        win.focus();
    });

    registerZycordIpc();

    ipcMain.handle(ZycordIpc.OPEN_EXTERNAL, (_, url: string) => {
        try {
            const { protocol } = new URL(url);
            if (["https:", "http:", "discord:"].includes(protocol)) return shell.openExternal(url);
        } catch { }
    });

    ipcMain.handle(ZycordIpc.RELAUNCH, () => {
        app.relaunch();
        app.exit(0);
    });

    // Boots the Vencord main process: IPC handlers, settings stores, CSP patching
    // and the vencord:// protocol. Must run before the window loads Discord,
    // otherwise the injected renderer is blocked by Discord's CSP.
    app.whenReady().then(async () => {
        require("./vencordDesktopMain.js");

        // Core registers its own whenReady callback; yield so it runs first and
        // the CSP header patch is installed before the first Discord request.
        await new Promise(res => setImmediate(res));

        configureSession();
        buildMenu();
        createMainWindow();
    });

    app.on("window-all-closed", () => {
        if (process.platform !== "darwin") app.quit();
    });

    app.on("activate", () => {
        if (!getMainWindow()) createMainWindow();
        else getMainWindow()!.show();
    });
}

export { discordUrl };
