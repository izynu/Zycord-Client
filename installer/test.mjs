/*
 * Zycord, a Discord client
 * Copyright (c) 2026 Zynu
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Exercises installer/cli.mjs against a throwaway directory tree that mimics
 * Discord's layout, so the install/uninstall round trip is checked without a
 * real Discord installation.
 *
 *   node installer/test.mjs
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "installer", "cli.mjs");

function run(appData, ...args) {
    return execFileSync(process.execPath, [CLI, ...args], {
        env: { ...process.env, APPDATA: appData, LOCALAPPDATA: appData },
        encoding: "utf8"
    });
}

/** Run against distinct Roaming and Local roots, as Windows really has. */
function runSplit(roaming, local, ...args) {
    return execFileSync(process.execPath, [CLI, ...args], {
        env: { ...process.env, APPDATA: roaming, LOCALAPPDATA: local },
        encoding: "utf8"
    });
}

function runFails(appData, ...args) {
    try {
        run(appData, ...args);
    } catch (err) {
        return String(err.stderr ?? "");
    }
    throw new Error(`Expected "${args.join(" ")}" to fail`);
}

const asar = require("@electron/asar");

const sandbox = mkdtempSync(join(tmpdir(), "zycord-installer-"));
const appData = join(sandbox, "appdata");

function makeInstall(branch, version) {
    const resources = join(appData, branch, `app-${version}`, "resources");
    mkdirSync(resources, { recursive: true });
    writeFileSync(join(resources, "app.asar"), `ORIGINAL:${branch}:${version}`);
    return resources;
}

let failures = 0;
function check(name, fn) {
    try {
        fn();
        console.log(`  ok    ${name}`);
    } catch (err) {
        failures++;
        console.log(`  FAIL  ${name}\n        ${err.message}`);
    }
}

try {
    const oldResources = makeInstall("Discord", "1.0.9001");
    const newResources = makeInstall("Discord", "1.0.9100");
    makeInstall("DiscordCanary", "1.0.9020");

    const target = join(newResources, "app.asar");
    const backup = join(newResources, "_app.asar");

    check("list finds every branch", () => {
        const out = run(appData, "list");
        assert.match(out, /stable/);
        assert.match(out, /canary/);
        assert.match(out, /1\.0\.9100/);
        assert.match(out, /vanilla/);
    });

    check("install patches the newest stable build only", () => {
        run(appData, "install");
        assert.ok(existsSync(backup), "backup should exist");
        assert.equal(readFileSync(backup, "utf8"), "ORIGINAL:Discord:1.0.9100");
        assert.equal(readFileSync(join(oldResources, "app.asar"), "utf8"), "ORIGINAL:Discord:1.0.9001",
            "older build must be left alone");
    });

    check("patched asar is a self-contained injector", () => {
        const entries = asar.listPackage(target);
        for (const required of ["/index.js", "/package.json", "/patcher.js", "/preload.js", "/renderer.js", "/renderer.css"]) {
            assert.ok(entries.includes(required), `${required} missing from the patch`);
        }

        const index = asar.extractFile(target, "index.js").toString();
        assert.match(index, /patcher\.js/);

        const pkg = JSON.parse(asar.extractFile(target, "package.json").toString());
        assert.equal(pkg.main, "index.js");

        const patcher = asar.extractFile(target, "patcher.js");
        assert.ok(patcher.length > 10_000, "patcher bundle looks truncated");
    });

    check("reinstall is a no-op", () => {
        const out = run(appData, "install");
        assert.match(out, /already patched/);
        assert.equal(readFileSync(backup, "utf8"), "ORIGINAL:Discord:1.0.9100");
    });

    check("--force rewrites without losing the original", () => {
        const out = run(appData, "install", "--force");
        assert.match(out, /patched/);
        assert.equal(readFileSync(backup, "utf8"), "ORIGINAL:Discord:1.0.9100");
    });

    check("--all patches every installed version", () => {
        run(appData, "install", "--all");
        assert.ok(existsSync(join(oldResources, "_app.asar")), "older build should be patched too");
        assert.equal(readFileSync(join(oldResources, "_app.asar"), "utf8"), "ORIGINAL:Discord:1.0.9001");
    });

    check("--branch selects the channel", () => {
        run(appData, "install", "--branch", "canary");
        const canary = join(appData, "DiscordCanary", "app-1.0.9020", "resources");
        assert.ok(existsSync(join(canary, "_app.asar")));
    });

    check("uninstall restores the original byte for byte", () => {
        run(appData, "uninstall", "--all");
        assert.equal(readFileSync(target, "utf8"), "ORIGINAL:Discord:1.0.9100");
        assert.equal(readFileSync(join(oldResources, "app.asar"), "utf8"), "ORIGINAL:Discord:1.0.9001");
        assert.ok(!existsSync(backup), "backup should be consumed");
    });

    check("uninstall on a clean install does nothing", () => {
        const out = run(appData, "uninstall", "--all");
        assert.match(out, /not patched/);
    });

    check("an unknown branch is rejected", () => {
        assert.match(runFails(appData, "install", "--branch", "beta"), /Unknown branch/);
    });

    check("a missing installation is reported, not guessed", () => {
        assert.match(runFails(join(sandbox, "empty"), "install"), /No Discord installation/);
    });

    check("the patched asar ships every runtime asset", () => {
        run(appData, "install", "--force");
        const entries = asar.listPackage(target).map(e => e.replace(/^\//, ""));
        for (const asset of ["patcher.js", "preload.js", "renderer.js", "renderer.css"]) {
            assert.ok(entries.includes(asset), `${asset} missing from the patch`);
        }
    });

    check("repair rewrites the patch and keeps the backup", () => {
        const out = run(appData, "repair");
        assert.match(out, /rewritten/);
        assert.equal(readFileSync(backup, "utf8"), "ORIGINAL:Discord:1.0.9100");
    });

    check("update applies over an existing patch", () => {
        const out = run(appData, "update");
        assert.match(out, /patched/);
        assert.equal(readFileSync(backup, "utf8"), "ORIGINAL:Discord:1.0.9100");
    });

    check("install writes an install state file", () => {
        const state = JSON.parse(readFileSync(join(appData, "Discord", "zycord-patch.json"), "utf8"));
        assert.equal(state.product, "Zycord");
        assert.equal(state.branch, "stable");
    });

    check("purge restores Discord and removes Zycord state", () => {
        const dataDir = join(appData, "Zycord");
        mkdirSync(join(dataDir, "settings"), { recursive: true });
        writeFileSync(join(dataDir, "settings", "settings.json"), "{}");

        run(appData, "purge");

        assert.equal(readFileSync(target, "utf8"), "ORIGINAL:Discord:1.0.9100");
        assert.ok(!existsSync(backup), "backup should be consumed");
        assert.ok(!existsSync(join(appData, "Discord", "zycord-patch.json")), "state file should be gone");
        assert.ok(!existsSync(dataDir), "data directory should be gone");
    });

    check("detects an install under LocalAppData, the real default", () => {
        // Discord installs to %LocalAppData%; searching only %AppData% misses it.
        const sandbox2 = mkdtempSync(join(tmpdir(), "zycord-local-"));
        const roaming = join(sandbox2, "Roaming");
        const local = join(sandbox2, "Local");
        const resources = join(local, "Discord", "app-1.0.9400", "resources");
        mkdirSync(resources, { recursive: true });
        writeFileSync(join(resources, "app.asar"), "LOCAL-ORIGINAL");

        try {
            const out = runSplit(roaming, local, "list");
            assert.match(out, /1\.0\.9400/);
            assert.match(out, /vanilla/);

            const installOut = runSplit(roaming, local, "install");
            assert.match(installOut, /patched/);
            assert.equal(readFileSync(join(resources, "_app.asar"), "utf8"), "LOCAL-ORIGINAL");
            assert.ok(statSync(join(resources, "app.asar")).size > 100_000);
        } finally {
            rmSync(sandbox2, { recursive: true, force: true });
        }
    });

    check("the newest build wins across both roots", () => {
        const sandbox3 = mkdtempSync(join(tmpdir(), "zycord-both-"));
        const roaming = join(sandbox3, "Roaming");
        const local = join(sandbox3, "Local");
        const oldRes = join(local, "Discord", "app-1.0.9200", "resources");
        const newRes = join(roaming, "Discord", "app-1.0.9300", "resources");
        mkdirSync(oldRes, { recursive: true });
        mkdirSync(newRes, { recursive: true });
        writeFileSync(join(oldRes, "app.asar"), "LOCAL-OLD");
        writeFileSync(join(newRes, "app.asar"), "ROAMING-NEW");

        try {
            runSplit(roaming, local, "install");
            assert.equal(readFileSync(join(newRes, "_app.asar"), "utf8"), "ROAMING-NEW", "newest should be patched");
            assert.ok(!existsSync(join(oldRes, "_app.asar")), "older build should be left alone");
        } finally {
            rmSync(sandbox3, { recursive: true, force: true });
        }
    });

    check("the scratch staging directory is cleaned up", () => {
        assert.ok(!existsSync(join(ROOT, "dist", ".zycord-inject")));
    });

    console.log(failures === 0
        ? `\nAll checks passed.`
        : `\n${failures} check(s) failed.`);
} finally {
    rmSync(sandbox, { recursive: true, force: true });
    process.exitCode = failures === 0 ? 0 : 1;
}
