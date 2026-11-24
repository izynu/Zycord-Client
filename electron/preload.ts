/*
 * Zycord, a Discord client
 * Copyright (c) 2026 Zynu
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Based on Vesktop, Copyright (c) 2023 Vendicated and Vencord contributors
 */

import { contextBridge, ipcRenderer, webFrame } from "electron/renderer";

import { ZycordIpc } from "./ipc";

const ZycordNative = {
    app: {
        getVersion: () => ipcRenderer.sendSync(ZycordIpc.GET_VERSION) as string,
        relaunch: () => ipcRenderer.invoke(ZycordIpc.RELAUNCH),
        openExternal: (url: string) => ipcRenderer.invoke(ZycordIpc.OPEN_EXTERNAL, url)
    }
};

contextBridge.exposeInMainWorld("ZycordNative", ZycordNative);

function watchDiscordStartup() {
    return new Promise<string | undefined>(resolve => {
        let startupError: string | undefined;
        let startupTimeout: number | undefined;

        function finish(message: string | undefined) {
            window.clearTimeout(startupTimeout);
            document.removeEventListener("DOMContentLoaded", onDomReady);
            window.removeEventListener("error", onError);
            window.removeEventListener("unhandledrejection", onUnhandledRejection);
            resolve(message);
        }

        function recordError(message: string, filename: string, error: unknown) {
            const detail = error instanceof Error ? error.message : message.replace(/^Uncaught Error: /, "");
            if (
                detail === "Sentry successfully disabled" ||
                detail === "ResizeObserver loop completed with undelivered notifications." ||
                detail === "ResizeObserver loop limit exceeded"
            ) {
                return;
            }

            const stack = error instanceof Error ? error.stack : undefined;
            if (!filename && !stack) {
                return;
            }

            const origin = stack?.split("\n").find(line => line.trimStart().startsWith("at ")) ?? filename;
            const fromMod = /file:\/\/\/(?:ZycordRenderer\b|WebpackModule\d+\b)/.test(origin);
            if (fromMod) {
                finish(message);
            } else {
                startupError ??= message;
            }
        }

        function onError(event: ErrorEvent) {
            recordError(event.message, event.filename, event.error);
        }

        function onUnhandledRejection(event: PromiseRejectionEvent) {
            if (event.reason instanceof Error) {
                recordError(event.reason.message, "", event.reason);
            }
        }

        function onDomReady() {
            startupTimeout = window.setTimeout(() => {
                const appMount = document.getElementById("app-mount");
                finish(appMount?.childElementCount === 0 ? (startupError ?? "Discord failed to mount") : undefined);
            }, 10_000);
        }

        window.addEventListener("error", onError);
        window.addEventListener("unhandledrejection", onUnhandledRejection);

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", onDomReady, { once: true });
        } else {
            onDomReady();
        }
    });
}

async function loadRenderer() {
    // While sandboxed, Electron "polyfills" these APIs as local variables.
    // We have to pass them as arguments as they are not global
    Function("require", "process", ipcRenderer.sendSync(ZycordIpc.GET_PRELOAD_SCRIPT))(require, process);

    // The fork's own IPC only serves the renderer to the patcher build, so the
    // standalone shell supplies it.
    const rendererScript = ipcRenderer.sendSync(ZycordIpc.GET_RENDERER_SCRIPT);
    const hasRenderer = await webFrame.executeJavaScript(`${rendererScript}\n;window.Vencord != null`);
    if (!hasRenderer) {
        throw new Error("Zycord did not initialize window.Vencord");
    }
}

async function checkDiscordStartup() {
    // The watcher runs in Discord's JavaScript world so it can read the original error stack.
    const error = await webFrame.executeJavaScript(`(${watchDiscordStartup.toString()})()`).catch(error => {
        console.error("Failed to check Discord startup:", error);
    });
    if (error) {
        throw new Error(error);
    }
}

Promise.all([checkDiscordStartup(), loadRenderer()]).catch(error => {
    console.error("Failed to initialize the Zycord renderer:", error);
    return ipcRenderer.invoke(ZycordIpc.RENDERER_STARTUP_ERROR, String(error));
});