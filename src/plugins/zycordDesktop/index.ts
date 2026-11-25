/*
 * Zycord, a Discord client
 * Copyright (c) 2026 Zynu
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";

/**
 * Makes Discord render its desktop UI instead of its browser UI.
 *
 * Discord decides which chrome to draw from the CSS platform class on the app
 * root and from its internal "is this the embedded desktop app" check. Loaded
 * from discord.com inside our own window, both say "web", which is why the app
 * looks like a page in a browser: no native title bar, web-styled context
 * menus, no desktop-only affordances.
 */
const settings = definePluginSettings({
    desktopUI: {
        type: OptionType.BOOLEAN,
        description: "Render Discord's desktop interface (native title bar, desktop menus)",
        default: true,
        restartNeeded: true
    },
    zoomLevel: {
        type: OptionType.SLIDER,
        description: "Interface zoom. 1 = 100%. Applies to the whole window.",
        markers: [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2],
        default: 1,
        stickToMarkers: false
    }
});

const ZoomLevel = findByPropsLazy("setZoomLevel", "getZoomLevel");

function applyZoom(level: number) {
    // Prefer the shell: Chromium's zoom keeps layout correct, unlike CSS zoom.
    if (window.ZycordNative?.zoom?.set) {
        window.ZycordNative.zoom.set(level);
        return;
    }
    try {
        if (ZoomLevel?.setZoomLevel) {
            ZoomLevel.setZoomLevel(level);
            return;
        }
    } catch { }
    (document.documentElement as any).style.zoom = String(level);
}

export default definePlugin({
    name: "ZycordDesktop",
    description: "Desktop UI, interface zoom and richer presence for the standalone client",
    authors: [Devs.Zynu],
    settings,

    patches: [
        {
            // Discord tags the app root with this class to pick its chrome.
            find: "platform-web",
            predicate: () => settings.store.desktopUI,
            replacement: {
                match: '"platform-web"',
                replace: '"platform-win"'
            }
        }
    ],

    start() {
        // The renderer can boot before the page has a live webContents, and the
        // user may change the slider at any time, so keep the window in sync
        // rather than applying once.
        this.interval = setInterval(() => {
            const level = settings.store.zoomLevel;
            if (this.lastZoom === level) return;
            this.lastZoom = level;
            applyZoom(level);
        }, 500);
        applyZoom(settings.store.zoomLevel);
        this.lastZoom = settings.store.zoomLevel;
    },

    stop() {
        clearInterval(this.interval);
        applyZoom(1);
    }
});
