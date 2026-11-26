# Zycord — how it works

Zycord Client is a **standalone Electron app** that opens Discord's web app in its own
window and injects a compiled renderer that adds the plugin system. It never touches,
patches, or modifies the official Discord desktop installation.

By Zynu. GPL-3.0-or-later. Attribution details are in NOTICE.

---

## The injection chain

Every custom Discord client of this type answers one question: *how does my code get
into a page that Discord controls?* Zycord answers it in four steps.

```
Zycord.exe
└── Electron main process
    ├── electron/main.ts
    │     app.whenReady() → require("./vencordDesktopMain.js")
    │         └─ core bundle: IPC handlers, settings stores, CSP patching,
    │            vencord:// protocol, theme + QuickCSS file watchers
    │     then createMainWindow()
    │
    ├── BrowserWindow  (webPreferences.preload = ./preload.js, sandbox: true)
    │     └── loads https://discord.com/channels/@me
    │
    └── electron/preload.ts  (runs inside the Discord page)
          1. contextBridge.exposeInMainWorld("ZycordNative", …)
          2. Function(rendererPreloadSource)(require, process)
             └─ core preload: exposes window.VencordNative
          3. webFrame.executeJavaScript(VencordRendererSource)
             └─ window.Vencord = { Api, Plugins, Components, … }
                └─ starts every enabled plugin
```

### Why each step is necessary

**① The CSP patch must land before the page loads.**
Discord serves a strict `Content-Security-Policy`. Injecting a multi-megabyte script
with `webFrame.executeJavaScript` is `eval`, which that policy blocks outright.
`src/main/csp/index.ts` installs a `webRequest.onHeadersReceived` hook that rewrites
the main-frame policy to allow `'unsafe-eval'`, `blob:`, `data:` and the hosts themes
load from. `electron/main.ts` therefore `require`s the core bundle *first* and yields
one tick (`setImmediate`) so the core's own `app.whenReady()` callback installs the
hook before the first Discord request is made.

**② The preload is sandboxed, so it cannot `require` like a normal module.**
With `sandbox: true` and `contextIsolation: true`, Electron polyfills `require` and
`process` as *local variables* inside the preload rather than globals. The harness
hands them in explicitly:

```ts
Function("require", "process", preloadSource)(require, process);
```

That executes the core preload, which exposes `window.VencordNative`, the bridge the
renderer calls for settings, themes, and native actions.

**③ The renderer is an IIFE that assigns a global.**
`scripts/build/build.mjs` builds the renderer with `format: "iife"` and
`globalName: "Vencord"`, so executing its source leaves `window.Vencord` populated. The
harness asserts this and fails loudly rather than showing a silent blank window:

```ts
const ok = await webFrame.executeJavaScript(`${source}\n;window.Vencord != null`);
if (!ok) throw new Error("Zycord did not initialize window.Vencord");
```

**④ Plugins then patch Discord at runtime.**
`src/webpack/patchWebpack.ts` installs a setter on `Function.prototype.m` to intercept
webpack's module factories, proxies each factory, and applies string/regex
replacements to the factory source. That is how all 169+ plugins work — they rewrite
Discord's own bundled modules in memory. No files on disk are modified.

---

## What the standalone shape changes vs. a patcher

| | Patcher approach | Zycord (standalone) |
|---|---|---|
| Discord's files | `app.asar` renamed to `_app.asar`; injector written in its place | untouched |
| Where code runs | inside Discord's own Electron process | inside Zycord's Electron process |
| Survives Discord updates | no — must re-patch each version | yes — nothing to re-patch |
| Needs Discord installed | yes | no |
| Distribution | installer + Go patcher binary | a normal `Zycord-Client-Setup.exe` |
| Renderer injection | `PRELOAD_GET_RENDERER_JS` IPC in the patcher | shell supplies the bundle |

Because the patcher path is unused, `src/main/patcher.ts` is dormant. The standalone
path is the `vencordDesktop*` build outputs — the same ones Vesktop consumes.

---

## Build outputs

```
dist/
├── vencordDesktopMain.js        core main process      (required by the shell)
├── vencordDesktopPreload.js     core preload           (executed via Function)
├── vencordDesktopRenderer.js    renderer + all plugins (executed via executeJavaScript)
├── vencordDesktopRenderer.css   the renderer's styles  (served over IPC)
├── patcher.js                   unused in standalone mode
├── renderer.js / preload.js     unused in standalone mode
└── js/
    ├── main.js                  Zycord shell main  (entry: package.json "main")
    ├── preload.js               Zycord shell preload
    └── vencordDesktop*.js|css   copied here by scripts/build/shell.mjs
```

`scripts/build/shell.mjs` copies the four core bundles next to the shell. This is not
cosmetic: `vencordDesktopMain.js` resolves its siblings through `__dirname`, so all
five files must sit in one directory (`dist/js/`) inside the packaged app.

---

## The native bridge

`window.ZycordNative.app` provides:

| method | transport | purpose |
|---|---|---|
| `getVersion()` | `sendSync` | version string for the settings info row |
| `relaunch()` | `invoke` | restart the client |
| `openExternal(url)` | `invoke` | open links in the system browser |

The renderer reaches these through `IS_VESKTOP` code paths, which the fork compiles
into the `vencordDesktopRenderer.js` target (`globPlugins("vesktop")`). All bridge
access is optional-chained (`ZycordNative?.app?.getVersion?.()`), so a missing or
future-extended bridge degrades instead of crashing Discord's page.

---

## Packaging

`electron-builder`, config in `package.json` → `build`.

- `appId` `app.zycord.client` — also set at runtime via `app.setAppUserModelId()`, which
  controls Windows toast attribution and taskbar grouping.
- `productName` / `executableName` — `Zycord` / `Zycord`.
- NSIS target, per-user install, selectable directory, desktop + start-menu shortcuts.
- `pnpm dist` produces `release/Zycord-Client-Setup-<version>-x64.exe`.

Cross-building on Linux needs Wine for the NSIS uninstaller step; without it the build
fails at that stage with a misleading spawn error. The produced installer is unsigned,
so Windows SmartScreen will warn on first run until the binary builds reputation.

---

## Known limitations

- **Unsigned build.** SmartScreen warns. Signing requires a Windows code-signing
  certificate.
- **Renderer injection depends on Discord's bundle shape.** The plugin patches match
  Discord's minified source by string. Discord ships new builds constantly; a Discord
  change can break individual plugins until the patch is updated upstream. The app keeps
  working — patches that no longer match are skipped and logged.
- **The upstream updater is disabled.** This fork has no release server, so the
  renderer's update check fails harmlessly (one log line). Shipping updates means
  standing up a `latest.yml` and an `electron-updater` feed, or rebuilding.
- **Upstream-only integrations are inert.** Cloud sync (`api.vencord.dev`), donor badges,
  and the support server point at upstream infrastructure and are not available to
  Zycord.
- **Windows is the only packaged target.** The shell is cross-platform Electron code,
  but only the NSIS installer is configured.
