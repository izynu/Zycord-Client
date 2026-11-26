[![Zycord Client](.github/assets/wordmark.svg)](https://izynu.github.io/Zycord-Client/)

Standalone Electron desktop client for Windows that runs Discord's web app in its own window.

[![Licence](https://img.shields.io/badge/licence-GPL--3.0--or--later-5b6b7a?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64-5b6b7a?style=flat-square)](https://github.com/izynu/Zycord-Client/releases)
[![Version](https://img.shields.io/badge/version-1.0.0-5b6b7a?style=flat-square)](https://github.com/izynu/Zycord-Client/releases)

[![Download for Windows](https://img.shields.io/badge/Download-Zycord%20Client%201.0.0%20for%20Windows-4a5a68?style=for-the-badge)](https://github.com/izynu/Zycord-Client/releases/latest/download/Zycord-Client-Setup-1.0.0-x64.exe)

![divider](.github/assets/divider.svg)

## What it is

Zycord Client is a standalone Electron application for Windows that loads Discord's web app in its own window and adds a large plugin system on top. It runs from its own install directory and starts as a separate program, so the official Discord installation is left untouched. The plugin system is the main part of the product: 108 plugins are enabled by default and 175 are available. Everything else in the client, from interface zoom to the theme engine, is built around making that plugin layer usable day to day.

## Features

| Feature | What it does |
| --- | --- |
| Plugin system | 108 plugins enabled by default, 175 available, each with its own settings. |
| Interface zoom | Scales the whole interface from 50% to 200%, under Settings > Zycord. |
| Feature Toggles | A dedicated panel with 8 switches for the client's own behaviour. |
| System tray | Runs in the notification area, with hide-to-tray so the window can stay closed. |
| Message logging | Records messages locally for later review. |
| Role and permission viewers | Shows the roles and permissions behind a member or channel. |
| Profile theming | Changes the look of user profiles. |
| Analytics blocking | Discord's analytics and crash reporting are blocked by default. |
| Theme engine | Loads CSS themes, with a QuickCSS editor for live changes. |

![divider](.github/assets/divider.svg)

## Install

1. Download `Zycord-Client-Setup-1.0.0-x64.exe` (97.7 MB) using the button above. It targets Windows 10 and Windows 11 on x64.
2. Run the installer and launch Zycord from the Start menu.
3. If Windows SmartScreen shows a warning, the build is unsigned. Choose "More info", then "Run anyway" to continue.

## What it is not

- It does not modify or patch the official Discord installation. The official app is never touched, and the two can be installed side by side.
- It is not affiliated with, endorsed by, or supported by Discord.
- Using a modified client may violate Discord's Terms of Service. Use at your own risk.

## Build from source

Requires Node.js 22 or newer and pnpm 10 or newer.

```sh
pnpm install   # install dependencies
pnpm build     # build the renderer and the Electron shell
pnpm start     # run the client from source
pnpm dist      # produce the Windows installer in release/
```

`pnpm dist` cross-compiles through electron-builder. Building on Linux needs Wine installed and on your `PATH`.

## Licence and credit

Zycord Client is licensed under the GNU General Public License, version 3.0 or later. The full text is in [LICENSE](LICENSE). Attribution and modification notices are in [NOTICE](NOTICE).

![divider](.github/assets/divider.svg)

**Zycord Client** by Zynu. [Website](https://izynu.github.io/Zycord-Client/) · [Repository](https://github.com/izynu/Zycord-Client) · [zynu.me](https://zynu.me)
