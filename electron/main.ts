/*
 * Zycord, a Discord client
 * Copyright (c) 2026 Zynu
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Based on Vesktop, Copyright (c) 2023 Vendicated and Vencord contributors
 * Based on Vencord, Copyright (c) 2022 Vendicated and contributors
 */

import { app, ipcMain, shell } from "electron";

import { APP_ID, APP_NAME, discordUrl } from "./constants";
import { registerZycordIpc, ZycordIpc } from "./ipc";
import { buildMenu, configureSession, createMainWindow, getMainWindow } from "./window";

// The Zycord data directory mirrors what the Vencord main bundle expects.
process.env.VENCORD_USER_DATA_DIR ??= `${app.getPath("userData")}`;
process.env.DATA_DIR = process.env.VENCORD_USER_DATA_DIR;

app.setName(APP_NAME);
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
