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

import { onceDefined } from "@shared/onceDefined";
import electron, { app, BrowserWindowConstructorOptions, dialog, Menu } from "electron";
import { existsSync } from "fs";
import { dirname, join } from "path";

import { RendererSettings } from "./settings";
import { IS_VANILLA } from "./utils/constants";

console.log("[Zycord] Starting up...");

// Our injector file at app/index.js
const injectorPath = require.main!.filename;

// Original Discord app.asar name
const asarName = require.main!.path.endsWith("app.asar") ? "_app.asar" : "app.asar";

// Original Discord app.asar
const asarPath = join(dirname(injectorPath), "..", asarName);

const discordPkg = require(join(asarPath, "package.json"));

// If the backup is itself a Zycord patch, the original client was replaced
// before it could be saved. Loading it would start this patcher a second time
// in the same process, and every IPC handler it registers would throw on the
// duplicate. Refuse to go any further and tell the user how to recover.
if (existsSync(join(asarPath, "patcher.js"))) {
    dialog.showErrorBox(
        "Zycord cannot start",
        "The original Discord files were replaced by a previous Zycord install, "
        + "so there is nothing to hand control back to.\n\n"
        + "Reinstall Discord from discord.com, then run the Zycord installer again."
    );
    app.exit(1);
    throw new Error("Original app.asar is a Zycord patch");
}

require.main!.filename = join(asarPath, discordPkg.main);

// @ts-expect-error Untyped method? Dies from cringe
app.setAppPath(asarPath);

if (!IS_VANILLA) {
    const settings = RendererSettings.store;

    // Repatch after host updates on Windows and Linux
    if (process.platform === "win32" || process.platform === "linux") {
        require("./persistAfterDiscordUpdates");
    }

    if (process.platform === "win32" && settings.winCtrlQ) {
        const originalBuild = Menu.buildFromTemplate;
        Menu.buildFromTemplate = function (template) {
            if (template[0]?.label === "&File") {
                const { submenu } = template[0];
                if (Array.isArray(submenu)) {
                    submenu.push({
                        label: "Quit (Hidden)",
                        visible: false,
                        acceleratorWorksWhenHidden: true,
                        accelerator: "Control+Q",
                        click: () => app.quit()
                    });
                }
            }
            return originalBuild.call(this, template);
        };
    }

    class BrowserWindow extends electron.BrowserWindow {
        constructor(options: BrowserWindowConstructorOptions) {
            if (!options?.webPreferences?.preload || !options.title) {
                super(options);
                return;
            }

            const { nativeTitleBar, disableMinSize, transparent, macosVibrancyStyle, windowsMaterial } = settings;

            const original = options.webPreferences.preload;
            options.webPreferences.preload = join(__dirname, "preload.js");
            options.webPreferences.sandbox = false;

            if (nativeTitleBar) {
                delete options.frame;
            }

            if (disableMinSize) {
                options.minWidth = 0;
                options.minHeight = 0;
            }

            if (transparent) {
                options.transparent = true;
                options.backgroundColor = "#00000000";
            }
            if (process.platform === "darwin" && macosVibrancyStyle) {
                options.vibrancy = macosVibrancyStyle;
                options.backgroundColor = "#00000000";
            }
            if (process.platform === "win32" && windowsMaterial && windowsMaterial !== "none") {
                options.backgroundMaterial = windowsMaterial;
                options.backgroundColor = "#00000000";
            }

            process.env.DISCORD_PRELOAD = original;

            super(options);

            if (disableMinSize) {
                // Disable the Electron call entirely so that Discord can't dynamically change the size
                this.setMinimumSize = (_width: number, _height: number) => { };
            }
        }
    }
    Object.assign(BrowserWindow, electron.BrowserWindow);
    // esbuild may rename our BrowserWindow, which leads to it being excluded
    // from getFocusedWindow(), so this is necessary
    // https://github.com/discord/electron/blob/13-x-y/lib/browser/api/browser-window.ts#L60-L62
    Object.defineProperty(BrowserWindow, "name", { value: "BrowserWindow", configurable: true });

    // Replace electrons exports with our custom BrowserWindow
    const electronPath = require.resolve("electron");
    delete require.cache[electronPath]!.exports;
    require.cache[electronPath]!.exports = {
        ...electron,
        BrowserWindow
    };

    // Patch appSettings to force enable devtools
    onceDefined(global, "appSettings", s => {
        s.set("DANGEROUS_ENABLE_DEVTOOLS_ONLY_ENABLE_IF_YOU_KNOW_WHAT_YOURE_DOING", true);
    });

    process.env.DATA_DIR = join(app.getPath("userData"), "..", "Zycord");
} else {
    console.log("[Zycord] Running in vanilla mode. Plugins are disabled");
}

console.log("[Zycord] Loading original Discord app.asar");
require(require.main!.filename);
