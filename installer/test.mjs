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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
        assert.deepEqual(entries.sort(), ["/index.js", "/package.json", "/patcher.js"]);

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
