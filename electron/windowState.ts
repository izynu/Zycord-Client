/*
 * Zycord, a Discord client
 * Copyright (c) 2026 Zynu
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, BrowserWindow, screen } from "electron";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

import { MIN_HEIGHT, MIN_WIDTH } from "./constants";

export interface WindowState {
    x?: number;
    y?: number;
    width: number;
    height: number;
    maximized?: boolean;
}

// Resolved lazily: main.ts calls app.setPath("userData") after this module is
// imported, and getPath caches its answer on first call.
const statePath = () => join(app.getPath("userData"), "window-state.json");

const isNumber = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value);

export function loadWindowState(): WindowState | null {
    try {
        const parsed = JSON.parse(readFileSync(statePath(), "utf-8"));
        if (!isNumber(parsed?.width) || !isNumber(parsed?.height)) return null;
        return {
            x: isNumber(parsed.x) ? parsed.x : undefined,
            y: isNumber(parsed.y) ? parsed.y : undefined,
            width: parsed.width,
            height: parsed.height,
            maximized: parsed.maximized === true
        };
    } catch {
        return null;
    }
}

// A window saved on a monitor that is no longer attached would otherwise open
// off-screen. getDisplayMatching picks the nearest display for a stale rect.
export function clampToWorkArea(state: WindowState): WindowState {
    const rect = {
        x: state.x ?? 0,
        y: state.y ?? 0,
        width: state.width,
        height: state.height
    };
    const { workArea } = screen.getDisplayMatching(rect);

    const width = Math.max(MIN_WIDTH, Math.min(state.width, workArea.width));
    const height = Math.max(MIN_HEIGHT, Math.min(state.height, workArea.height));

    if (state.x === undefined || state.y === undefined) {
        return { ...state, width, height };
    }

    return {
        ...state,
        width,
        height,
        x: Math.min(Math.max(state.x, workArea.x), workArea.x + workArea.width - width),
        y: Math.min(Math.max(state.y, workArea.y), workArea.y + workArea.height - height)
    };
}

export function trackWindowState(win: BrowserWindow) {
    let saveTimer: NodeJS.Timeout | undefined;

    const save = () => {
        if (win.isDestroyed()) return;
        // getNormalBounds reports the restored geometry while maximised, which is
        // what a later launch needs to un-maximise back to.
        const state: WindowState = { ...win.getNormalBounds(), maximized: win.isMaximized() };
        try {
            writeFileSync(statePath(), JSON.stringify(state));
        } catch (error) {
            console.error("[Zycord] Failed to save window state:", error);
        }
    };

    // Dragging fires resize/move continuously; coalesce to one write.
    const scheduleSave = () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(save, 400);
    };

    win.on("resize", scheduleSave);
    win.on("move", scheduleSave);
    // Close-to-tray hides instead of destroying, so this is the last reliable
    // moment for a quit that bypasses the debounce.
    win.on("close", save);
}
