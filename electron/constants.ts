/*
 * Zycord, a Discord client
 * Copyright (c) 2026 Zynu
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Based on Vesktop, Copyright (c) 2023 Vendicated and Vencord contributors
 * Based on Vencord, Copyright (c) 2022 Vendicated and contributors
 */

export const APP_NAME = "Zycord";
export const APP_DISPLAY_NAME = "Zycord Client";
export const APP_AUTHOR = "Zynu";
export const APP_ID = "app.zycord.client";
export const EXECUTABLE_NAME = "Zycord";
export const GITHUB_ORG = "SahilVerlice";
export const GITHUB_REPO = "Zycord";
export const GITHUB_URL = `https://github.com/${GITHUB_ORG}/${GITHUB_REPO}`;
export const WEBSITE_URL = "https://zynu.me";

export const USER_AGENT = `${APP_NAME}/${process.env.ZYCORD_VERSION ?? "1.0.0"} (${GITHUB_URL})`;

const VersionString = `AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome.split(".")[0]}.0.0.0 Safari/537.36`;

const BrowserUserAgents = {
    darwin: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ${VersionString}`,
    linux: `Mozilla/5.0 (X11; Linux x86_64) ${VersionString}`,
    windows: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${VersionString}`
};

export const BrowserUserAgent =
    BrowserUserAgents[process.platform] ?? BrowserUserAgents.windows;

export const MIN_WIDTH = 940;
export const MIN_HEIGHT = 500;
export const DEFAULT_WIDTH = 1280;
export const DEFAULT_HEIGHT = 800;

export function discordUrl(path = "channels/@me") {
    const branch = process.env.ZYCORD_DISCORD_BRANCH;
    const subdomain = branch === "canary" || branch === "ptb" ? `${branch}.` : "";
    return `https://${subdomain}discord.com/${path}`;
}
