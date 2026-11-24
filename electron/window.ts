/*
 * Zycord, a Discord client
 * Copyright (c) 2026 Zynu
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BrowserWindow, dialog, Menu, screen, session, shell } from "electron";
import { join } from "path";

import {
    BrowserUserAgent,
    DEFAULT_HEIGHT,
    DEFAULT_WIDTH,
    discordUrl,
    MIN_HEIGHT,
    MIN_WIDTH
} from "./constants";
import { ZycordIpc } from "./ipc";

let mainWin: BrowserWindow | null = null;
export const getMainWindow = () => mainWin;

function isDiscordUrl(url: string) {
    try {
        const { hostname } = new URL(url);
        return hostname === "discord.com" || hostname.endsWith(".discord.com") || hostname === "discordapp.com";
    } catch {
        return false;
    }
}

function makeLinksOpenExternally(win: BrowserWindow) {
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (isDiscordUrl(url)) return { action: "allow" };
        try {
            const { protocol } = new URL(url);
            if (["https:", "http:"].includes(protocol)) shell.openExternal(url);
        } catch { }
        return { action: "deny" };
    });

    win.webContents.on("will-navigate", (e, url) => {
        if (isDiscordUrl(url)) return;
        e.preventDefault();
        try {
            const { protocol } = new URL(url);
            if (["https:", "http:"].includes(protocol)) shell.openExternal(url);
        } catch { }
    });
}

export function createMainWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    mainWin = new BrowserWindow({
        width: Math.min(DEFAULT_WIDTH, width),
        height: Math.min(DEFAULT_HEIGHT, height),
        minWidth: MIN_WIDTH,
        minHeight: MIN_HEIGHT,
        title: "Zycord",
        icon: join(__dirname, "icon.png"),
        backgroundColor: "#313338",
        // A native Windows title bar and frame. Without this Electron defaults to
        // frameless, which makes the app read as "a web page in a window".
        frame: true,
        autoHideMenuBar: true,
        show: false,
        webPreferences: {
            nodeIntegration: false,
            sandbox: true,
            contextIsolation: true,
            devTools: true,
            preload: join(__dirname, "preload.js"),
            spellcheck: true,
            backgroundThrottling: false
        }
    });

    mainWin.webContents.session.setUserAgent(BrowserUserAgent);
    mainWin.webContents.setUserAgent(BrowserUserAgent);

    // Avoid the white flash while Discord's first paint is pending.
    mainWin.once("ready-to-show", () => mainWin?.show());

    makeLinksOpenExternally(mainWin);

    mainWin.on("closed", () => {
        mainWin = null;
    });

    mainWin.webContents.on("ipc-message", (_e, channel, ...args) => {
        if (channel !== ZycordIpc.RENDERER_STARTUP_ERROR) return;
        showStartupError(String(args[0] ?? "Unknown error"));
    });

    mainWin.loadURL(discordUrl()).catch(err => {
        console.error("[Zycord] Failed to load Discord:", err);
        if (mainWin && !mainWin.isDestroyed()) {
            mainWin.loadURL("about:blank");
        }
    });

    return mainWin;
}

function showStartupError(message: string) {
    if (!mainWin || mainWin.isDestroyed()) return;

    dialog.showMessageBox(mainWin, {
        type: "error",
        title: "Zycord failed to start",
        message: "Zycord could not initialize its renderer.",
        detail: message,
        buttons: ["Quit"],
        defaultId: 0,
        noLink: true
    }).then(() => {
        const { app } = require("electron");
        app.quit();
    });
}

export function buildMenu() {
    const template = [
        {
            label: "Zycord",
            submenu: [
                {
                    label: "About Zycord",
                    click: () => {
                        if (!mainWin) return;
                        dialog.showMessageBox(mainWin, {
                            type: "info",
                            title: "About Zycord",
                            message: "Zycord Client",
                            detail: `Zycord ${process.env.ZYCORD_VERSION ?? "1.0.0"}\nBy Zynu\n\nElectron ${process.versions.electron}\nChromium ${process.versions.chrome}\n\nBased on Vencord, Copyright (c) Vendicated and contributors.\nLicensed under GPL-3.0-or-later.`,
                            buttons: ["OK"],
                            noLink: true
                        });
                    }
                },
                { type: "separator" },
                { role: "reload" },
                { role: "forceReload" },
                { role: "toggleDevTools" },
                { type: "separator" },
                { label: "Relaunch", click: () => { const { app } = require("electron"); app.relaunch(); app.exit(0); } },
                { label: "Quit Zycord", role: "quit" }
            ]
        },
        {
            label: "Edit",
            submenu: [
                { role: "undo" }, { role: "redo" }, { type: "separator" },
                { role: "cut" }, { role: "copy" }, { role: "paste" },
                { role: "selectAll" }
            ]
        },
        {
            label: "View",
            submenu: [
                { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
                { type: "separator" }, { role: "togglefullscreen" }
            ]
        }
    ] as const;

    Menu.setApplicationMenu(Menu.buildFromTemplate(template as any));
}

export function configureSession() {
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
        const allowed = [
            "media", "audioCapture", "videoCapture", "notifications",
            "clipboard-read", "clipboard-sanitized-write", "fullscreen",
            "display-capture", "speaker-selection"
        ];
        callback(allowed.includes(permission));
    });
}
