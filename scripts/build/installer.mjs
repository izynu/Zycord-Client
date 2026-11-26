/*
 * Zycord, a Discord client
 * Copyright (c) 2026 Zynu
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Stages the patch payload and builds the Windows installer.
 *
 * One payload folder per Discord channel, each containing the same patched
 * app.asar. They are identical today; keeping them separate means a future
 * channel-specific build can be dropped in without touching the installer.
 */

import { execFileSync } from "child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { createRequire } from "module";
import { homedir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ASSET_DIR = join(ROOT, "dist", "patcher");
const INSTALLER_DIR = join(ROOT, "installer");
const PAYLOAD = join(INSTALLER_DIR, "payload");
const RELEASE = join(ROOT, "release");

const ASSETS = [
    "patcher.js",
    "preload.js",
    "renderer.js",
    "renderer.css",
    "patcher.js.LEGAL.txt",
    "renderer.js.LEGAL.txt"
];

const version = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")).version;

// INetC, used by the Update action, is not part of the Debian nsis package.
// Stage it beside the script so the build does not depend on a machine copy.
const INETC_SRC = join(homedir(), ".cache", "electron-builder", "nsis-resources-3.4.1",
    "nsis-resources-3.4.1-2jx2y", "plugins", "x86-unicode", "INetC.dll");
const PLUGIN_DIR = join(INSTALLER_DIR, "plugins");

function requireAssets() {
    const missing = ASSETS.filter(f => !existsSync(join(ASSET_DIR, f)));
    if (missing.length) {
        throw new Error(`Missing ${missing.join(", ")} in dist/patcher. Run pnpm build:patcher first.`);
    }
}

async function buildPatchedAsar() {
    const asar = require("@electron/asar");
    const stage = join(INSTALLER_DIR, ".stage");

    rmSync(stage, { recursive: true, force: true });
    mkdirSync(stage, { recursive: true });

    writeFileSync(join(stage, "index.js"), "require(__dirname + '/patcher.js');\n");
    writeFileSync(join(stage, "package.json"), JSON.stringify({
        name: "discord",
        version,
        main: "index.js"
    }, null, 2) + "\n");

    for (const asset of ASSETS) copyFileSync(join(ASSET_DIR, asset), join(stage, asset));

    const out = join(INSTALLER_DIR, ".app.asar");
    await asar.createPackage(stage, out);

    rmSync(stage, { recursive: true, force: true });
    return out;
}

async function main() {
    requireAssets();

    const patched = await buildPatchedAsar();

    // One payload: every Discord build gets the same file, so there is nothing
    // to choose between at install time.
    rmSync(PAYLOAD, { recursive: true, force: true });
    mkdirSync(PAYLOAD, { recursive: true });
    copyFileSync(patched, join(PAYLOAD, "app.asar"));
    rmSync(patched, { force: true });

    mkdirSync(RELEASE, { recursive: true });

    if (!existsSync(join(PLUGIN_DIR, "INetC.dll"))) {
        if (!existsSync(INETC_SRC)) throw new Error(`Missing INetC.dll (looked in ${INETC_SRC})`);
        mkdirSync(PLUGIN_DIR, { recursive: true });
        copyFileSync(INETC_SRC, join(PLUGIN_DIR, "INetC.dll"));
    }

    console.log(`Building the Zycord ${version} installer...`);
    execFileSync("makensis", [join(INSTALLER_DIR, "zycord.nsi")],
        { stdio: "inherit", cwd: INSTALLER_DIR, env: { ...process.env } });

    const exe = join(RELEASE, `Zycord-Patcher-Setup-${version}.exe`);
    if (!existsSync(exe)) throw new Error(`makensis did not produce ${exe}`);

    // The Update action downloads this single file and copies it into place,
    // so it must be byte-identical to what the installer carries.
    const payloadAsar = join(RELEASE, "Zycord-Patcher.asar");
    copyFileSync(join(PAYLOAD, "app.asar"), payloadAsar);

    rmSync(PAYLOAD, { recursive: true, force: true });
    console.log(`\nWrote ${exe}`);
    console.log(`Wrote ${payloadAsar}`);
}

main().catch(err => {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
});
