/*
 * Zycord, a Discord client
 * Copyright (c) 2026 Zynu
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Installs the Zycord patcher into an existing Discord installation by
 * replacing resources/app.asar and keeping the original as resources/_app.asar.
 *
 * Discord's own layout, and the layout the patcher expects:
 *
 *   Discord/
 *     app-<version>/resources/app.asar   <- our patcher entry (app/index.js)
 *     app-<version>/resources/_app.asar  <- original, read by the patcher
 *
 * Discord's updater drops a fresh app.asar into a new app-<version> folder on
 * every release, so the patch has to be re-applied after updates. The patcher
 * handles that itself at runtime; this command is for the initial install.
 */

import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync, copyFileSync } from "fs";
import { createRequire } from "module";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PATCHER = join(ROOT, "dist", "patcher.js");

const BRANCHES = {
    stable: "Discord",
    ptb: "DiscordPTB",
    canary: "DiscordCanary",
    development: "DiscordDevelopment"
};

const MARKER = "zycord-patch.json";

function loadAsar() {
    // @electron/asar ships inside the pnpm store through electron-builder.
    // Resolve it from the project rather than assuming a hoisted install.
    for (const c of ["@electron/asar", join(ROOT, "node_modules", "@electron", "asar")]) {
        try {
            return require(c);
        } catch { }
    }
    throw new Error("Could not load @electron/asar. Run pnpm install first.");
}

function discordRoot(branch) {
    const name = BRANCHES[branch];
    if (!name) throw new Error(`Unknown branch "${branch}". Use stable, ptb, canary or development.`);

    const appData = process.env.APPDATA || process.env.LOCALAPPDATA;
    if (!appData) throw new Error("APPDATA is not set. This command only works on Windows.");

    return join(appData, name);
}

/** Every installed app-<version> folder, newest first. */
function versionDirs(root) {
    if (!existsSync(root)) return [];
    return readdirSync(root)
        .filter(d => d.startsWith("app-"))
        .map(d => ({ dir: join(root, d), version: d.slice("app-".length) }))
        .filter(v => existsSync(join(v.dir, "resources")))
        .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
}

function list() {
    let found = false;
    for (const branch of Object.keys(BRANCHES)) {
        const root = discordRoot(branch);
        const versions = versionDirs(root);
        if (!versions.length) continue;
        found = true;

        console.log(`\n${branch} (${root})`);
        for (const v of versions) {
            const target = join(v.dir, "resources", "app.asar");
            const backup = join(v.dir, "resources", "_app.asar");
            console.log(`  ${v.version.padEnd(16)} ${existsSync(backup) ? "patched" : "vanilla"}`);
            if (!existsSync(target)) console.log("    (resources/app.asar missing)");
        }
    }
    if (!found) console.log("No Discord installation found.");
}

async function buildPatcherAsar() {
    if (!existsSync(PATCHER)) {
        throw new Error(`Missing ${PATCHER}. Run pnpm build first.`);
    }

    const asar = loadAsar();
    const staging = join(ROOT, "dist", ".zycord-inject");
    const appDir = join(staging, "app");

    rmSync(staging, { recursive: true, force: true });
    mkdirSync(appDir, { recursive: true });

    // Discord's Electron entry point. It hands control to the patcher, which
    // then sets require.main.filename to the real _app.asar.
    writeFileSync(join(appDir, "index.js"), "require(__dirname + '/patcher.js');\n");
    copyFileSync(PATCHER, join(appDir, "patcher.js"));

    writeFileSync(join(appDir, "package.json"), JSON.stringify({
        name: "discord",
        version: "0.0.0",
        main: "index.js"
    }, null, 2) + "\n");

    const out = join(staging, "app.asar");
    await asar.createPackage(appDir, out);

    writeFileSync(join(staging, MARKER), JSON.stringify({
        product: "Zycord",
        patcher: PATCHER,
        builtAt: new Date().toISOString()
    }, null, 2) + "\n");

    return out;
}

async function install(branch, { all = false, force = false } = {}) {
    const root = discordRoot(branch);
    const versions = versionDirs(root);
    if (!versions.length) throw new Error(`No Discord installation found for ${branch} at ${root}`);

    const targets = all ? versions : [versions[0]];
    const built = await buildPatcherAsar();

    for (const v of targets) {
        const resources = join(v.dir, "resources");
        const target = join(resources, "app.asar");
        const backup = join(resources, "_app.asar");

        if (existsSync(backup) && !force) {
            console.log(`${v.version}: already patched, skipping (use --force to repatch)`);
            continue;
        }
        if (!existsSync(target)) {
            console.log(`${v.version}: resources/app.asar missing, skipping`);
            continue;
        }

        if (!existsSync(backup)) renameSync(target, backup);
        copyFileSync(built, target);
        console.log(`${v.version}: patched. Original saved as _app.asar`);
    }

    rmSync(join(ROOT, "dist", ".zycord-inject"), { recursive: true, force: true });
}

function uninstall(branch, { all = false } = {}) {
    const root = discordRoot(branch);
    const versions = versionDirs(root);
    const targets = all ? versions : versions.slice(0, 1);
    if (!targets.length) throw new Error(`No Discord installation found for ${branch} at ${root}`);

    for (const v of targets) {
        const resources = join(v.dir, "resources");
        const target = join(resources, "app.asar");
        const backup = join(resources, "_app.asar");

        if (!existsSync(backup)) {
            console.log(`${v.version}: not patched, nothing to do`);
            continue;
        }

        rmSync(target, { force: true });
        renameSync(backup, target);
        console.log(`${v.version}: restored the original app.asar`);
    }
}

function usage(code = 0) {
    console.log(`Zycord patcher installer

  install   [--branch stable|ptb|canary|development] [--all] [--force]
  uninstall [--branch stable|ptb|canary|development] [--all]
  list

Examples
  node installer/cli.mjs list
  node installer/cli.mjs install --branch stable
  node installer/cli.mjs uninstall --branch canary --all
`);
    process.exit(code);
}

async function main(argv) {
    const [command, ...rest] = argv;
    const branchIndex = rest.indexOf("--branch");
    const branch = branchIndex === -1 ? "stable" : rest[branchIndex + 1];
    const all = rest.includes("--all");
    const force = rest.includes("--force");

    switch (command) {
        case "install":
            return install(branch, { all, force });
        case "uninstall":
            return uninstall(branch, { all });
        case "list":
            return list();
        case undefined:
        case "-h":
        case "--help":
        case "help":
            return usage(0);
        default:
            console.error(`Unknown command "${command}"\n`);
            usage(2);
    }
}

try {
    await main(process.argv.slice(2));
} catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
}
