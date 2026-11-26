<p align="center">
  <a href="https://izynu.github.io/Zycord-Client/">
    <img src=".github/assets/wordmark.svg" alt="Zycord Client" width="420">
  </a>
</p>

<p align="center">
  <strong>A plugin layer for the Discord app you already have. 173 plugins, inside Discord itself.</strong>
</p>

<p align="center">
  <a href="https://github.com/izynu/Zycord-Client/releases/latest/download/Zycord-Patcher-Setup-1.0.0.exe">
    <img src=".github/assets/download-button.svg" alt="Download the Zycord installer for Windows" width="420">
  </a>
</p>

<p align="center">
  <sub>Version 1.0.0 &nbsp;|&nbsp; 520 KB &nbsp;|&nbsp; Windows 10 and 11, x64 &nbsp;|&nbsp; Requires Discord installed &nbsp;|&nbsp; Free and open source</sub>
</p>

<p align="center">
  <a href="https://github.com/izynu/Zycord-Client/releases"><img src="https://img.shields.io/github/v/release/izynu/Zycord-Client?label=release&color=5b6b7a&style=flat-square" alt="Latest release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licence-GPL--3.0--or--later-5b6b7a?style=flat-square" alt="Licence"></a>
  <a href="https://izynu.github.io/Zycord-Client/"><img src="https://img.shields.io/badge/website-online-5b6b7a?style=flat-square" alt="Website"></a>
</p>

<p align="center">
  <a href="#install">Install</a> &nbsp;|&nbsp;
  <a href="#what-it-does">Features</a> &nbsp;|&nbsp;
  <a href="#every-feature">All 173 plugins</a> &nbsp;|&nbsp;
  <a href="#how-it-installs">How it installs</a> &nbsp;|&nbsp;
  <a href="#build-from-source">Build</a> &nbsp;|&nbsp;
  <a href="#what-it-is-not">Disclaimer</a>
</p>

![divider](.github/assets/divider.svg)

## What it is

Zycord is a patch for the Discord desktop app on Windows. It does not install a second client or open a second window: it replaces the file Discord loads at startup with one that adds a plugin layer, then hands control back to Discord. You launch Discord exactly as you always have.

Inside Discord you get 173 plugins, a theme engine, interface zoom from 50 to 200 percent, a settings panel, and everything else listed below.


---

## Install

| Step | Action |
| --- | --- |
| 1 | Install the Discord desktop app if it is not already installed. |
| 2 | Close Discord completely. Right-click the tray icon and choose **Quit Discord**, then check Task Manager for any remaining `Discord.exe` process. |
| 3 | Download the installer using the button at the top of this page. |
| 4 | Run `Zycord-Patcher-Setup-1.0.0.exe` and pick **Install**. |
| 5 | Start Discord the way you normally do. |

Closing the window is not enough. Discord keeps running in the notification area, and while it runs it holds its own program files open, so the installer cannot replace them. If Discord is still running, the installer stops and says so instead of reporting a patch that did not happen.

If Discord is stuck and will not quit, end `Discord.exe` in Task Manager, or run this in Command Prompt:

```sh
taskkill /IM Discord.exe /F
```

The build is unsigned. Windows SmartScreen will show a warning the first time. Choose **More info**, then **Run anyway**.

<p align="center">
  <a href="https://github.com/izynu/Zycord-Client/releases/latest/download/Zycord-Patcher-Setup-1.0.0.exe">
    <img src=".github/assets/download-button.svg" alt="Download the Zycord installer for Windows" width="420">
  </a>
</p>

---

## What it does

| Feature | Detail |
| --- | --- |
| **Plugin system** | 173 plugins included, 87 of them on by default. Each has its own settings page. |
| **Interface zoom** | Scales the whole window from 50 to 200 percent. Found under Settings, Zycord. Applies instantly. |
| **Feature Toggles** | One panel with seven switches for the most used plugins, plus a playback speed selector. |
| **System tray** | Lives in the notification area. Closing the window hides it to the tray instead of quitting. |
| **Screen sharing** | Full display and window capture, wired through the shell so Discord's picker works. |
| **Voice channel chat** | Opens the text chat for the voice channel you join, without leaving the call. |
| **Message logging** | Keeps deleted and edited messages visible for the session. |
| **Role and permission viewers** | Shows the roles and permissions behind a member or a channel. |
| **Profile theming** | Custom profile colours on your own profile, plus role colours everywhere. |
| **Analytics blocking** | Discord's analytics and crash reporting are blocked before the first request. |
| **Theme engine** | Loads CSS themes, with a QuickCSS editor for live changes. |
| **Window memory** | Restores size and position on launch, clamped to the current display. |



---

## Every feature

Every feature and all 173 plugins are documented on the website, with screenshots.

<p align="center">
  <a href="https://izynu.github.io/Zycord-Client/features/">
    <img src="https://img.shields.io/badge/VIEW-ALL%20FEATURES-1a76f6?style=for-the-badge" alt="View all features" height="40">
  </a>
  &nbsp;&nbsp;
  <a href="https://izynu.github.io/Zycord-Client/screenshots/">
    <img src="https://img.shields.io/badge/VIEW-SCREENSHOTS-5b6b7a?style=for-the-badge" alt="View screenshots" height="40">
  </a>
</p>

---

## How it installs

The installer opens with four actions.

| Action | What it does |
| --- | --- |
| **Install** | Finds Discord Stable, PTB, Canary and Development under `%LocalAppData%` and `%AppData%`. Every installed build gets patched: `resources/app.asar` is moved to `resources/_app.asar` and the Zycord patcher is written in its place. |
| **Repair** | Rewrites the patch from the installed files without touching `_app.asar`. Use it if Discord starts but the plugins do not load. |
| **Update** | Downloads the current Zycord build from the latest release and applies it over the patched install. |
| **Uninstall** | Deletes the patch, renames `_app.asar` back to `app.asar`, and removes Zycord's own settings folder. Discord is left exactly as it was. |

`_app.asar` is your original client. The installer never overwrites it, so Uninstall always has something to restore.

If a previous install ever replaced that backup, the client cannot start: Zycord would open itself twice. It stops with a message instead of crashing, and the fix is to reinstall Discord from discord.com and then run this installer again.

Discord replaces `app.asar` when it updates itself. Zycord notices the new version at startup and re-applies the patch automatically, so you do not need to reinstall after a Discord update.

The same actions are available from the command line, which is what the build scripts use:

```sh
pnpm inject                 # install into every detected Discord build
pnpm inject:list            # show which channels are installed and patched
pnpm uninject               # restore the original app.asar
node installer/cli.mjs repair
node installer/cli.mjs update
node installer/cli.mjs purge
```

---

## Build from source

Requires Node.js 22 or newer and pnpm 10 or newer.

```sh
pnpm install   # install dependencies
pnpm build     # build the renderer bundles and the Electron shell
pnpm start     # run the client from source
pnpm dist      # produce the Windows installer in release/
```

`pnpm dist` cross-compiles with electron-builder. Building on Linux requires Wine on your `PATH`.

---

## What it is not

| | |
| --- | --- |
| **Not a replacement for Discord** | It needs Discord installed. The desktop client and the patcher run side by side. |
| **Not affiliated with Discord** | No endorsement, support, or partnership exists. |
| **Not guaranteed to stay allowed** | Using a modified client may violate Discord's Terms of Service. Use at your own risk. |

---

## Licence

GPL-3.0-or-later. The full text is in [LICENSE](LICENSE). Attribution and modification notices are in [NOTICE](NOTICE).

![divider](.github/assets/divider.svg)

<p align="center">
  <strong>Zycord Client</strong> by Zynu
</p>

<p align="center">
  <a href="https://izynu.github.io/Zycord-Client/">Website</a> &nbsp;|&nbsp;
  <a href="https://github.com/izynu/Zycord-Client">Repository</a> &nbsp;|&nbsp;
  <a href="https://github.com/izynu/Zycord-Client/releases">Releases</a> &nbsp;|&nbsp;
  <a href="https://zynu.me">zynu.me</a>
</p>
