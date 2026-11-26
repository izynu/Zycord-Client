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

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, copyFileSync } from "fs";
import { createRequire } from "module";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSET_DIR = join(ROOT, "dist", "patcher");

// Files the patcher reads from __dirname at runtime. Shipping patcher.js on its
// own produces an app that boots and then dies on the first window, because the
// preload and renderer scripts are loaded from the same directory.
const ASSETS = [
    "patcher.js",
    "preload.js",
    "renderer.js",
    "renderer.css",
    "patcher.js.LEGAL.txt",
    "renderer.js.LEGAL.txt"
];

const BRANCHES = {
    stable: "Discord",
    ptb: "DiscordPTB",
    canary: "DiscordCanary",
    development: "DiscordDevelopment"
};

const MARKER = "zycord-patch.json";
const VERSION = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")).version;

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

/**
 * Discord installs to %LocalAppData%; older and portable layouts use
 * %AppData%. Both are searched, so a real installation is never missed.
 */
function discordRoots(branch) {
    const name = BRANCHES[branch];
    if (!name) throw new Error(`Unknown branch "${branch}". Use stable, ptb, canary or development.`);

    const roots = [process.env.LOCALAPPDATA, process.env.APPDATA]
        .filter(Boolean)
        .map(base => join(base, name));

    if (!roots.length) throw new Error("Neither LOCALAPPDATA nor APPDATA is set. This command only works on Windows.");

    // Sorted across both roots so the newest build on the machine is first,
    // regardless of which folder it lives in.
    return roots
        .flatMap(root => versionDirs(root).map(v => ({ ...v, root })))
        .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
}

/** Newest install for a branch across both roots, or null. */
function discordRoot(branch) {
    return discordRoots(branch)[0] ?? null;
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
        const versions = discordRoots(branch);
        if (!versions.length) continue;
        found = true;

        console.log(`\n${branch}`);
        for (const v of versions) {
            const target = join(v.dir, "resources", "app.asar");
            const backup = join(v.dir, "resources", "_app.asar");
            console.log(`  ${v.version.padEnd(16)} ${existsSync(backup) ? "patched" : "vanilla"}   ${v.root}`);
            if (!existsSync(target)) console.log("    (resources/app.asar missing)");
        }
    }
    if (!found) console.log("No Discord installation found.");
}

async function buildPatcherAsar() {
    const missing = ASSETS.filter(f => !existsSync(join(ASSET_DIR, f)));
    if (missing.length) {
        throw new Error(`Missing ${missing.join(", ")} in dist/patcher. Run pnpm build first.`);
    }

    const asar = loadAsar();
    const staging = join(ROOT, "dist", ".zycord-inject");
    const appDir = join(staging, "app");

    rmSync(staging, { recursive: true, force: true });
    mkdirSync(appDir, { recursive: true });

    // Discord's Electron entry point. It hands control to the patcher, which
    // then sets require.main.filename to the real _app.asar.
    writeFileSync(join(appDir, "index.js"), "require(__dirname + '/patcher.js');\n");
    for (const asset of ASSETS) copyFileSync(join(ASSET_DIR, asset), join(appDir, asset));

    writeFileSync(join(appDir, "package.json"), JSON.stringify({
        name: "discord",
        version: "0.0.0",
        main: "index.js"
    }, null, 2) + "\n");

    const out = join(staging, "app.asar");
    await asar.createPackage(appDir, out);

    writeFileSync(join(staging, MARKER), JSON.stringify({
        product: "Zycord",
        version: VERSION,
        builtAt: new Date().toISOString()
    }, null, 2) + "\n");

    return out;
}

async function install(branch, { all = false, force = false } = {}) {
    const versions = discordRoots(branch);
    if (!versions.length) throw new Error(`No Discord installation found for ${branch}`);

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
    const versions = discordRoots(branch);
    const targets = all ? versions : versions.slice(0, 1);
    if (!targets.length) throw new Error(`No Discord installation found for ${branch}`);

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

/** Where the patched build keeps its own state, beside Discord's app folder. */
function installStatePath(root) {
    return join(root, MARKER);
}

function readInstallState(root) {
    try {
        return JSON.parse(readFileSync(installStatePath(root), "utf-8"));
    } catch {
        return null;
    }
}

async function installAll({ force = false } = {}) {
    const built = await buildPatcherAsar();
    let count = 0;

    for (const branch of Object.keys(BRANCHES)) {
        const versions = discordRoots(branch);
        const root = versions[0]?.root;
        if (!versions.length) continue;

        for (const v of versions) {
            const resources = join(v.dir, "resources");
            const target = join(resources, "app.asar");
            const backup = join(resources, "_app.asar");

            if (existsSync(backup) && !force) {
                console.log(`${branch} ${v.version}: already patched`);
                continue;
            }
            if (!existsSync(target) && !existsSync(backup)) continue;

            if (!existsSync(backup)) renameSync(target, backup);
            copyFileSync(built, target);
            count++;

            mkdirSync(root, { recursive: true });
            writeFileSync(installStatePath(root), JSON.stringify({
                product: "Zycord",
                version: VERSION,
                branch,
                discordVersion: versions[0].version,
                installedAt: new Date().toISOString()
            }, null, 2) + "\n");

            console.log(`${branch} ${v.version}: patched`);
        }
    }

    rmSync(join(ROOT, "dist", ".zycord-inject"), { recursive: true, force: true });

    if (!count) console.log("Every detected Discord install is already patched.");
}

/**
 * Repair rewrites the patch from the currently installed files without
 * touching the backup, which is the only state that cannot be regenerated.
 */
async function repair() {
    let repaired = 0;

    for (const branch of Object.keys(BRANCHES)) {
        for (const v of discordRoots(branch)) {
            const resources = join(v.dir, "resources");
            const backup = join(resources, "_app.asar");
            if (!existsSync(backup)) continue;

            const built = await buildPatcherAsar();
            copyFileSync(built, join(resources, "app.asar"));
            repaired++;
            console.log(`${branch} ${v.version}: patch rewritten from backup`);
        }
    }

    rmSync(join(ROOT, "dist", ".zycord-inject"), { recursive: true, force: true });

    if (!repaired) {
        console.log("Nothing to repair: no patched Discord install was found.");
        console.log("Run install first.");
    }
}

/**
 * Update rebuilds the patch from the files bundled with this build and applies
 * it over whatever is installed. The original app.asar is never overwritten, so
 * a bad update can always be undone with uninstall.
 */
async function update() {
    await installAll({ force: true });
}

function purge() {
    for (const branch of Object.keys(BRANCHES)) {
        const installs = discordRoots(branch);
        if (!installs.length) continue;

        for (const v of installs) {
            const resources = join(v.dir, "resources");
            const backup = join(resources, "_app.asar");
            if (!existsSync(backup)) continue;

            rmSync(join(resources, "app.asar"), { force: true });
            renameSync(backup, join(resources, "app.asar"));
            console.log(`${branch} ${v.version}: restored the original app.asar`);
        }

        for (const root of new Set(installs.map(v => v.root))) {
            if (readInstallState(root)) {
                rmSync(installStatePath(root), { force: true });
                console.log(`${branch}: removed Zycord install state`);
            }
        }
    }

    const dataDir = join(process.env.APPDATA ?? "", "Zycord");
    if (dataDir && existsSync(dataDir)) {
        rmSync(dataDir, { recursive: true, force: true });
        console.log(`Removed settings and themes at ${dataDir}`);
    }
}

function usage(code = 0) {
    console.log(`Zycord patcher installer ${VERSION}

  install   [--branch stable|ptb|canary|development] [--all] [--force]
  repair
  update
  uninstall [--branch stable|ptb|canary|development] [--all]
  purge
  list

  install    patch the newest Discord build on each detected channel
  repair     rewrite the patch, leaving the original backup alone
  update     apply this build's patch over an existing install
  uninstall  restore the original app.asar for one channel or version
  purge      restore every channel and delete Zycord's own data
  list       show which channels are installed and patched

Examples
  node installer/cli.mjs list
  node installer/cli.mjs install
  node installer/cli.mjs update
  node installer/cli.mjs purge
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
            return all || branch === "all"
                ? installAll({ force })
                : install(branch, { all, force });
        case "repair":
            return repair();
        case "update":
            return update();
        case "uninstall":
            return uninstall(branch, { all });
        case "purge":
            return purge();
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
