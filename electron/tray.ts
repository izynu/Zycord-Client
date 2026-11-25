/*
 * Zycord, a Discord client
 * Copyright (c) 2026 Zynu
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, BrowserWindow, Menu, NativeImage, nativeImage, Tray } from "electron";
import { join } from "path";

import { APP_DISPLAY_NAME } from "./constants";

let tray: Tray | null = null;
let trayIcon: NativeImage | null = null;
let trayMenu: Menu | null = null;
let trayWindow: BrowserWindow | null = null;
let quitting = false;
let notificationsMuted = false;

export const isQuitting = () => quitting;
export const markQuitting = () => { quitting = true; };
export const getTray = () => tray;
export const getTrayMenu = () => trayMenu;
export const getTrayIcon = () => trayIcon;
export const areNotificationsMuted = () => notificationsMuted;

// A flat Discord-blurple square used only when the staged PNG is missing. A
// missing icon must log, not leave the tray invisible or throw.
function placeholderIcon(size: number) {
    const bitmap = Buffer.alloc(size * size * 4);
    for (let i = 0; i < bitmap.length; i += 4) {
        bitmap[i] = 0xf2; // B
        bitmap[i + 1] = 0x65; // G
        bitmap[i + 2] = 0x58; // R
        bitmap[i + 3] = 0xff; // A
    }
    return nativeImage.createFromBitmap(bitmap, { width: size, height: size });
}

function loadTrayIcon(): NativeImage {
    const path = join(__dirname, "icon.png");
    let image = nativeImage.createFromPath(path);

    if (image.isEmpty()) {
        console.error(`[Zycord] Tray icon not found at ${path}; falling back to a placeholder`);
        image = placeholderIcon(16);
    }

    // macOS picks the right representation itself. Windows wants 16px and Linux
    // templates expect 32px; a 1024px source is blurred otherwise.
    if (process.platform === "darwin") return image;
    const size = process.platform === "win32" ? 16 : 32;
    return image.resize({ width: size, height: size });
}

function showWindow(win: BrowserWindow) {
    if (win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
}

export function toggleWindow(win: BrowserWindow) {
    if (win.isDestroyed()) return;
    if (win.isVisible()) win.hide();
    else showWindow(win);
}

function buildTrayMenu() {
    const win = trayWindow;
    if (!win) return null;

    trayMenu = Menu.buildFromTemplate([
        {
            label: "Open Zycord",
            click: () => showWindow(win)
        },
        {
            label: win.isVisible() ? "Hide to Tray" : "Show",
            click: () => toggleWindow(win)
        },
        {
            label: notificationsMuted ? "Unmute notifications" : "Mute notifications",
            click: () => {
                notificationsMuted = !notificationsMuted;
                refreshTrayMenu();
            }
        },
        { type: "separator" },
        {
            label: "Quit Zycord",
            click: () => {
                markQuitting();
                app.quit();
            }
        }
    ]);

    return trayMenu;
}

function refreshTrayMenu() {
    if (!tray || !trayWindow || trayWindow.isDestroyed()) return;
    tray.setContextMenu(buildTrayMenu());
}

function bindWindow(win: BrowserWindow) {
    trayWindow = win;
    // The menu label mirrors window state, so rebuild it whenever that changes.
    win.on("show", refreshTrayMenu);
    win.on("hide", refreshTrayMenu);
}

export function initTray(win: BrowserWindow): Tray | null {
    if (tray) {
        if (trayWindow !== win) {
            bindWindow(win);
            refreshTrayMenu();
        }
        return tray;
    }

    trayIcon = loadTrayIcon();
    tray = new Tray(trayIcon);
    tray.setToolTip(APP_DISPLAY_NAME);

    // A single click cannot be observed through Linux AppIndicator, so the
    // toggle is wired for Windows/Linux and skipped on macOS, where a click
    // already opens the context menu.
    if (process.platform !== "darwin") {
        tray.on("click", () => {
            if (trayWindow) toggleWindow(trayWindow);
        });
    }

    bindWindow(win);
    refreshTrayMenu();

    return tray;
}

export function destroyTray() {
    if (!tray) return;
    tray.destroy();
    tray = null;
    trayMenu = null;
    trayIcon = null;
    trayWindow = null;
}
