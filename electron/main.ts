/*
 * Zycord, a Discord client
 * Copyright (c) 2026 Zynu
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, ipcMain, shell } from "electron";
import { join } from "path";

import { APP_ID, APP_NAME, discordUrl } from "./constants";
import { registerZycordIpc, ZycordIpc } from "./ipc";
import { destroyTray, getTray, initTray, markQuitting } from "./tray";
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

// discord:// links arrive as a command-line argument, e.g. discord://-/channels/@me.
// Parse once here so a cold start and the second-instance handler agree.
function discordDeepLink(argv: string[]): string | undefined {
    const match = argv.find(arg => /^discord(?:-canary|-ptb)?:\/\//i.test(arg));
    if (!match) return undefined;
    try {
        // discord://-/channels/@me → https://discord.com/channels/@me
        const path = new URL(match).pathname.replace(/^\/-?/, "");
        return discordUrl(path || "channels/@me");
    } catch {
        return undefined;
    }
}

function openDeepLink(argv: string[]) {
    const target = discordDeepLink(argv);
    if (!target) return false;
    const win = getMainWindow();
    if (!win) return false;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    win.loadURL(target);
    return true;
}

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    // A second launch without a discord:// argument should just bring the
    // existing window forward; one with a link also navigates it.
    app.on("second-instance", (_event, argv) => {
        if (openDeepLink(argv)) return;
        const win = getMainWindow();
        if (!win) return;
        if (win.isMinimized()) win.restore();
        if (!win.isVisible()) win.show();
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
        // Using the launch link as the initial URL avoids a second navigation
        // that would abort the first and log ERR_ABORTED.
        const launchLink = discordDeepLink(process.argv.slice(1));
        const win = createMainWindow(launchLink);
        // After the window: initTray binds visibility listeners to it. Failure
        // here must not cost the user their client, hence the catch.
        try {
            initTray(win);
        } catch (err) {
            console.error("[Zycord] Failed to create tray icon:", err);
        }
    });

    app.on("before-quit", () => {
        markQuitting();
        destroyTray();
    });

    // The window normally hides rather than closes, so this only fires if it was
    // genuinely destroyed. With a tray alive the user can reopen it from there;
    // without one, leaving a headless process would strand the app.
    app.on("window-all-closed", () => {
        if (process.platform !== "darwin" && !getTray()) app.quit();
    });

    app.on("activate", () => {
        if (!getMainWindow()) createMainWindow();
        else getMainWindow()!.show();
    });
}

export { discordUrl };
// Tray state is re-exported so the bundling test harness can assert on the live
// instance without reaching into module internals.
export { destroyTray, getTray, getTrayIcon, getTrayMenu, isQuitting, markQuitting } from "./tray";
export { discordDeepLink };
