/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { app } from "electron";
import { cpSync, existsSync, rmSync } from "fs";
import { join } from "path";

const configuredDataDir = process.env.ZYCORD_USER_DATA_DIR;

export const DATA_DIR = configuredDataDir ?? (
    process.env.DISCORD_USER_DATA_DIR
        ? join(process.env.DISCORD_USER_DATA_DIR, "..", "ZycordData")
        : join(app.getPath("userData"), "..", "Zycord")
);

export const SETTINGS_DIR = join(DATA_DIR, "settings");

// Settings, plugins and themes used to live in a folder named after the
// upstream project, alongside the current one. Move them across once rather
// than stranding an existing install on default settings.
if (!existsSync(SETTINGS_DIR)) {
    const legacyDataDir = join(DATA_DIR, "..", "Vencord");
    if (existsSync(join(legacyDataDir, "settings"))) {
        try {
            cpSync(legacyDataDir, DATA_DIR, { recursive: true });
            rmSync(legacyDataDir, { recursive: true, force: true });
        } catch (err) {
            console.error("[Zycord] Could not migrate the old data folder", err);
        }
    }
}

export const THEMES_DIR = join(DATA_DIR, "themes");
export const QUICK_CSS_PATH = join(SETTINGS_DIR, "quickCss.css");
export const SETTINGS_FILE = join(SETTINGS_DIR, "settings.json");
export const NATIVE_SETTINGS_FILE = join(SETTINGS_DIR, "native-settings.json");
export const ALLOWED_PROTOCOLS = [
    "https:",
    "http:",
    "steam:",
    "spotify:",
    "com.epicgames.launcher:",
    "tidal:",
    "itunes:",
];

export const IS_VANILLA = /* @__PURE__ */ process.argv.includes("--vanilla");
