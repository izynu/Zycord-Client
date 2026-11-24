#!/usr/bin/node
/*
 * Zycord, a Discord client
 * Copyright (c) 2026 Zynu
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// @ts-check

import { build, context } from "esbuild";
import { copyFileSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";

const PackageJSON = JSON.parse(readFileSync("package.json", "utf-8"));
const VERSION = PackageJSON.version;
const watch = process.argv.includes("--watch");
const IS_DEV = watch || process.argv.includes("--dev");

const define = {
    "process.env.ZYCORD_VERSION": JSON.stringify(VERSION),
    "process.env.NODE_ENV": JSON.stringify(IS_DEV ? "development" : "production")
};

const shared = {
    bundle: true,
    minify: !IS_DEV,
    sourcemap: IS_DEV ? "inline" : false,
    platform: "node",
    format: "cjs",
    target: ["esnext"],
    external: ["electron", "original-fs", "./vencordDesktopMain.js"],
    define,
    logLevel: "info",
    banner: {
        js: `// Zycord ${VERSION} — By Zynu — GPL-3.0-or-later — based on Vencord by Vendicated and contributors`
    }
};

/**
 * @type {import("esbuild").BuildOptions[]}
 */
const configs = [
    {
        ...shared,
        entryPoints: ["electron/main.ts"],
        outfile: "dist/js/main.js"
    },
    {
        ...shared,
        entryPoints: ["electron/preload.ts"],
        outfile: "dist/js/preload.js"
    }
];

if (watch) {
    await Promise.all(configs.map(cfg => context(cfg).then(ctx => ctx.watch())));
} else {
    await Promise.all(configs.map(cfg => build(cfg)));
}

// The shell loads Vencord's prebuilt bundles at runtime; verify they exist so a
// missing build fails here instead of at launch with a blank window.
const required = [
    "vencordDesktopMain.js",
    "vencordDesktopPreload.js",
    "vencordDesktopRenderer.js",
    "vencordDesktopRenderer.css"
];

const missing = required.filter(f => {
    try {
        readFileSync(join(process.cwd(), "dist", f));
        return false;
    } catch {
        return true;
    }
});

if (missing.length) {
    console.error(`\nMissing Vencord bundles: ${missing.join(", ")}\nRun "pnpm build:core" first.\n`);
    process.exit(1);
}

// Stage the core bundles next to the shell so both resolve from one directory.
// vencordDesktopMain.js reads its siblings via __dirname, so they must sit together.
mkdirSync("dist/js", { recursive: true });
for (const f of required) {
    copyFileSync(join("dist", f), join("dist", "js", f));
}

console.log("Zycord shell built → dist/js/main.js, dist/js/preload.js");
