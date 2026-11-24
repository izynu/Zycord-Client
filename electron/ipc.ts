/*
 * Zycord, a Discord client
 * Copyright (c) 2026 Zynu
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ipcMain } from "electron";
import { readFileSync } from "fs";
import { join } from "path";

export const enum ZycordIpc {
    GET_PRELOAD_SCRIPT = "ZycordGetPreloadScript",
    GET_RENDERER_SCRIPT = "ZycordGetRendererScript",
    GET_RENDERER_CSS = "ZycordGetRendererCss",
    RENDERER_STARTUP_ERROR = "ZycordRendererStartupError",
    OPEN_EXTERNAL = "ZycordOpenExternal",
    RELAUNCH = "ZycordRelaunch",
    GET_VERSION = "ZycordGetVersion"
}

function bundlePath(file: string) {
    return join(__dirname, file);
}

export function registerZycordIpc() {
    ipcMain.on(ZycordIpc.GET_PRELOAD_SCRIPT, e => {
        e.returnValue = readFileSync(bundlePath("vencordDesktopPreload.js"), "utf-8");
    });

    ipcMain.on(ZycordIpc.GET_RENDERER_SCRIPT, e => {
        e.returnValue = readFileSync(bundlePath("vencordDesktopRenderer.js"), "utf-8");
    });

    ipcMain.on(ZycordIpc.GET_RENDERER_CSS, e => {
        e.returnValue = readFileSync(bundlePath("vencordDesktopRenderer.css"), "utf-8");
    });

    // The preload reads this synchronously via sendSync, so it must be an `on` handler.
    // ipcMain.handle only replies to invoke(), which would block the renderer forever.
    ipcMain.on(ZycordIpc.GET_VERSION, e => {
        e.returnValue = process.env.ZYCORD_VERSION ?? "1.0.0";
    });

    ipcMain.handle(ZycordIpc.RENDERER_STARTUP_ERROR, (_e, message: string) => {
        console.error("[Zycord] Renderer startup error:", message);
        return message;
    });
}
