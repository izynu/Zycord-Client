# Zycord Client

A Discord client for Windows.
By Zynu.

---

## What it is

Zycord is a standalone Electron client for Windows. It opens
[discord.com](https://discord.com) inside its own application window and injects
a forked build of the [Vencord](https://github.com/Vendicated/Vencord) renderer
into that page.

In plain terms: it is Discord's own web app, running in a native desktop window,
with Vencord's plugin system added on top. That gives you the plugins it ships
with, the theme engine, and a QuickCSS editor — without touching the official
Discord desktop application. Zycord does not patch or modify the official
Discord app.

> [!WARNING]
> Using a client modification may violate Discord's Terms of Service. Read the
> [Disclaimer](#disclaimer) before installing.

---

## Install (Windows)

1. Download the latest Windows installer (`Zycord-Client-Setup-<version>-x64.exe`).
2. Run it. The installer lets you choose the install directory.
3. Launch **Zycord** from the Start menu or the desktop shortcut.

The app is per-user by default and does not require administrator rights.

---

## Build from source

Requirements:

- [Node.js](https://nodejs.org/) 22 or newer
- [pnpm](https://pnpm.io/) 10 or newer

```sh
# 1. Install dependencies
pnpm install

# 2. Build the renderer and the Electron shell
pnpm build

# 3. Run it
pnpm start
```

To produce the Windows installer:

```sh
pnpm dist
```

`pnpm dist` runs `electron-builder` targeting NSIS for Windows x64 and writes the
output to `release/`. If you build on Linux, this cross-compile step needs
[Wine](https://www.winehq.org/) installed and on your `PATH`.

---

## Features

- **Plugins** — 100+ built-in plugins, with per-plugin settings in the client's own UI.
- **Themes** — Built-in theme support, including the ability to import CSS themes.
- **QuickCSS** — A live CSS editor for tweaking the client without leaving it.
- **Settings sync** — Optionally sync your plugin settings and configuration between devices.
- **Privacy** — No telemetry. Ships with a plugin that blocks Discord's analytics and crash reporting out of the box.

Zycord is a fork of Vencord and carries Vencord's plugin system; feature scope
tracks upstream Vencord, with Zycord-specific shell behaviour layered on top.

---

## How it works

For the injection chain, build outputs, and packaging internals, see
[ARCHITECTURE.md](ARCHITECTURE.md).

---

## Disclaimer

**Zycord is an unofficial third-party client.**

- Using a modified Discord client may violate Discord's Terms of Service. Discord's
  ToS prohibits modifying or using modified versions of their client. Client mods
  operate in a grey area, and the risk falls on whoever runs and distributes the
  build. **Use at your own risk.**
- Zycord is **not affiliated with, authorized by, sponsored by, or endorsed by**
  Discord Inc., Vendicated, or the Vencord project.
- "Discord" is a trademark of Discord Inc. and is used here only to describe the
  service this client connects to.
- No warranty of any kind is provided. See the licence.

If you want a client Discord explicitly supports, use the official Discord app.

---

## Licence

Zycord is licensed under the **GNU General Public License, version 3.0 or later**
(GPL-3.0-or-later). The full licence text is in [LICENSE](./LICENSE).

Because Zycord is a modified version of Vencord, it must remain under the
GPL-3.0-or-later and cannot be relicensed. If you distribute a build, you must
also make the corresponding source available.

See [NOTICE](./NOTICE) for the full attribution, the modification notice required
by GPLv3 §5(a), the list of files under other licences, and where to obtain the
corresponding source.

### Credits

Zycord is built on the work of others:

- **[Vencord](https://github.com/Vendicated/Vencord)** — the plugin system and
  renderer Zycord forks. Copyright (c) Vendicated and contributors,
  GPL-3.0-or-later.
- **[Vesktop](https://github.com/Vencord/Vesktop)** — the Electron shell
  architecture Zycord follows. Copyright (c) Vendicated and Vencord contributors,
  GPL-3.0-or-later.

Thank you to both projects and their contributors.

---

## Author

**Zynu**

- GitHub: [@izynu](https://github.com/izynu)
- Discord: `@izynu`
- YouTube: [@izynu](https://youtube.com/@izynu)
- Website: [zynu.me](https://zynu.me)

Source code: <https://github.com/SahilVerlice/Zycord>
