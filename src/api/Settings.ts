/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { SettingsStore as SettingsStoreClass } from "@shared/SettingsStore";
import { Logger } from "@utils/Logger";
import { mergeDefaults } from "@utils/mergeDefaults";
import { DefinedSettings, OptionType, SettingsChecks, SettingsDefinition } from "@utils/types";
import { useEffect, useReducer } from "@webpack/common";

import plugins from "~plugins";

const logger = new Logger("Settings");

/**
 * Plugins Zycord turns on for a fresh install.
 *
 * Upstream Vencord ships every plugin disabled, so a new user sees stock Discord
 * until they find Settings > Plugins. Zycord is opinionated: the features people
 * install a client mod for are on out of the box. Each entry can still be turned
 * off in Settings > Plugins, and only applies when the user has no saved value.
 */
export const ZYCORD_DEFAULT_PLUGINS = [
    "ZycordDesktop",
    "SplitLargeMessages",
    "VoiceChannelChat",
    // Appearance / information density
    "ShowHiddenChannels",
    "ShowHiddenThings",
    "ShowMeYourName",
    "MemberCount",
    "ServerListIndicators",
    "PlatformIndicators",
    "RoleColorEverywhere",
    "AlwaysExpandRoles",
    "BetterRoleContext",
    "BetterRoleDot",
    "ViewIcons",
    "UserMessagesPronouns",
    "UserVoiceShow",
    "ShowConnections",
    "MutualGroupDMs",
    "PermissionsViewer",
    "ServerInfo",
    "WhoReacted",
    // Chat quality of life
    "MessageLogger",
    "MessageLinkEmbeds",
    "Unindent",
    "FixCodeblockGap",
    "ShikiCodeblocks",
    "NoReplyMention",
    "NoMosaic",
    "ImageZoom",
    "ImageLink",
    "BetterSearch",
    "KeepCurrentChannel",
    "JumpToTop",
    "QuickReply",
    "PreviewMessage",
    "ShowAllMessageButtons",
    "ReadAllNotificationsButton",
    "PinDMs",
    "TypingIndicator",
    "TypingTweaks",
    "SilentTyping",
    "CharacterCounter",
    "SendTimestamps",
    "ReplyTimestamp",
    "UnsuppressEmbeds",
    "RevealAllSpoilers",
    "HideDisabledEmojis",
    // Media + voice
    "PictureInPicture",
    "MediaPlaybackSpeed",
    "BetterGifPicker",
    "BetterGifAltText",
    "GifPaste",
    "StickerPaste",
    "VolumeBooster",
    "VoiceMessages",
    "VoiceDownload",
    "CallTimer",
    "DisableCallIdle",
    // Privacy / control
    "NoTrack",
    "NoDevtoolsWarning",
    "NoTypingAnimation",
    "BetterSessions",
    "RelationshipNotifier",
    "NoBlockedMessages",
    "NoPendingCount",
    "NoOnboardingDelay",
    "NoF1",
    "NoMaskedUrlPaste",
    "ClearURLs",
    "BetterSettings",
    "BetterUploadButton",
    "Experiments",
    "PauseInvitesForever",
    "FakeNitro",
    "FakeProfileThemes",
    "ClientTheme",
    "ThemeAttributes",
    "AlwaysAnimate",
    // Desktop integration
    "DirectFileDownload",
    "WebContextMenus",
    "WebKeybinds",
    "WebScreenShareFixes",
    "OpenInApp",
    "SpotifyControls",
    "SpotifyCrack",
    "SpotifyShareCommands",
    "CustomStatusPresets",
];

export interface SettingsPluginUiElement {
    enabled: boolean;
    // TODO
    /** not implemented for now */
    order?: number;
}
export type SettingsPluginUiElements = {
    /** id will be whatever id the element was registered with. Usually, but not always, the plugin name */
    [id: string]: SettingsPluginUiElement;
};

export interface Settings {
    autoUpdate: boolean;
    autoUpdateNotification: boolean,
    useQuickCss: boolean;
    eagerPatches: boolean;
    enabledThemes: string[];
    enableReactDevtools: boolean;
    themeLinks: string[];
    frameless: boolean;
    transparent: boolean;
    winCtrlQ: boolean;
    macosVibrancyStyle:
    | "content"
    | "fullscreen-ui"
    | "header"
    | "hud"
    | "menu"
    | "popover"
    | "selection"
    | "sidebar"
    | "titlebar"
    | "tooltip"
    | "under-page"
    | "window"
    | undefined;
    windowsMaterial: "none" | "mica" | "tabbed" | "acrylic";
    disableMinSize: boolean;
    nativeTitleBar: boolean;
    plugins: {
        [plugin: string]: {
            enabled: boolean;
            isFavorite?: boolean;
            [setting: string]: any;
        };
    };

    uiElements: {
        messagePopoverButtons: SettingsPluginUiElements;
        chatBarButtons: SettingsPluginUiElements;
    },

    notifications: {
        timeout: number;
        position: "top-right" | "bottom-right";
        useNative: "always" | "never" | "not-focused";
        logLimit: number;
    };

    cloud: {
        authenticated: boolean;
        url: string;
        settingsSync: boolean;
        settingsSyncVersion: number;
    };
}

const DefaultSettings: Settings = {
    autoUpdate: true,
    autoUpdateNotification: true,
    useQuickCss: true,
    themeLinks: [],
    eagerPatches: false, // Eagerly patching no longer works due to module factories with the same id being able to have different sources now.
    enabledThemes: [],
    enableReactDevtools: false,
    frameless: false,
    transparent: false,
    winCtrlQ: false,
    macosVibrancyStyle: undefined,
    windowsMaterial: "none",
    disableMinSize: false,
    nativeTitleBar: false,
    plugins: {},

    uiElements: {
        chatBarButtons: {},
        messagePopoverButtons: {}
    },

    notifications: {
        timeout: 5000,
        position: "bottom-right",
        useNative: "not-focused",
        logLimit: 50
    },

    cloud: {
        authenticated: false,
        url: "https://api.vencord.dev/",
        settingsSync: false,
        settingsSyncVersion: 0
    }
};

const settings = !IS_REPORTER ? VencordNative.settings.get() : {} as Settings;
mergeDefaults(settings, DefaultSettings);

export const SettingsStore = new SettingsStoreClass(settings, {
    readOnly: true,
    getDefaultValue({
        target,
        key,
        path
    }) {
        const v = target[key];
        if (!plugins) return v; // plugins not initialised yet. this means this path was reached by being called on the top level

        if (path === "plugins" && key in plugins)
            return target[key] = {
                enabled: IS_REPORTER || plugins[key].required || plugins[key].enabledByDefault || ZYCORD_DEFAULT_PLUGINS.includes(key) || false
            };

        // Since the property is not set, check if this is a plugin's setting and if so, try to resolve
        // the default value.
        if (path.startsWith("plugins.")) {
            const plugin = path.slice("plugins.".length);
            if (plugin in plugins) {
                const setting = plugins[plugin].settings?.def[key];
                if (!setting) return v;

                if ("default" in setting)
                    // normal setting with a default value
                    return (target[key] = setting.default);

                if (setting.type === OptionType.SELECT) {
                    const def = setting.options.find(o => o.default);
                    if (def)
                        target[key] = def.value;
                    return def?.value;
                }
            }
        }
        return v;
    }
});

if (!IS_REPORTER) {
    SettingsStore.addGlobalChangeListener((_, path) => {
        SettingsStore.plain.cloud.settingsSyncVersion = Date.now();
        VencordNative.settings.set(SettingsStore.plain, path);
    });
}

/**
 * Same as {@link Settings} but unproxied. You should treat this as readonly,
 * as modifying properties on this will not save to disk or call settings
 * listeners.
 * WARNING: default values specified in plugin.settings will not be ensured here. In other words,
 * settings for which you specified a default value may be uninitialised. If you need proper
 * handling for default values, use {@link Settings}
 */
export const PlainSettings = settings;
/**
 * A smart settings object. Altering props automagically saves
 * the updated settings to disk.
 * This recursively proxies objects. If you need the object non proxied, use {@link PlainSettings}
 */
export const Settings = SettingsStore.store;

/**
 * Settings hook for React components. Returns a smart settings
 * object that automagically triggers a rerender if any properties
 * are altered
 * @param paths An optional list of paths to whitelist for rerenders
 * @returns Settings
 */
// TODO: Representing paths as essentially "string[].join('.')" wont allow dots in paths, change to "paths?: string[][]" later
export function useSettings(paths?: UseSettings<Settings>[]) {
    const [, forceUpdate] = useReducer(() => ({}), {});

    useEffect(() => {
        if (paths) {
            paths.forEach(p => {
                if (p.endsWith(".*")) {
                    SettingsStore.addPrefixChangeListener(p.slice(0, -2), forceUpdate);
                } else {
                    SettingsStore.addChangeListener(p, forceUpdate);
                }
            });

            return () => paths.forEach(p => {
                if (p.endsWith(".*")) {
                    SettingsStore.removePrefixChangeListener(p.slice(0, -2), forceUpdate);
                } else {
                    SettingsStore.removeChangeListener(p, forceUpdate);
                }
            });
        } else {
            SettingsStore.addGlobalChangeListener(forceUpdate);
            return () => SettingsStore.removeGlobalChangeListener(forceUpdate);
        }
    }, [paths]);

    return SettingsStore.store;
}

export function migratePluginSettings(name: string, ...oldNames: string[]) {
    const { plugins } = SettingsStore.plain;
    if (name in plugins) return;

    for (const oldName of oldNames) {
        if (oldName in plugins) {
            logger.info(`Migrating settings from old name ${oldName} to ${name}`);
            plugins[name] = plugins[oldName];
            delete plugins[oldName];
            SettingsStore.markAsChanged();
            break;
        }
    }
}

/**
 * Applies {@link ZYCORD_DEFAULT_PLUGINS} to an install that already has a settings file.
 *
 * getDefaultValue only fires for keys that are absent, but every plugin key is written
 * to settings.json on first launch, so existing installs would otherwise stay on stock
 * Discord forever. This runs once: it flips the listed plugins on, then records a marker
 * so it never re-enables something the user turned off afterwards.
 */
const DEFAULTS_APPLIED_KEY = "zycordDefaultsApplied";

/**
 * Plugins that were shipped enabled in an earlier build but turned out not to
 * work — either their patch no longer matches Discord's bundle, or they break a
 * Discord API. They are disabled once, even on installs whose settings file
 * already recorded the defaults, so nobody is left running a dead feature.
 */
const ZYCORD_BROKEN_PLUGINS = [
    // Patch targets a class method Discord has since removed; the patcher reports
    // "had no effect" and the feature silently does nothing.
    "FullSearchContext",
];

const BROKEN_APPLIED_KEY = "zycordBrokenDisabled";

export function applyZycordDefaultPlugins() {
    if (!SettingsStore.plain[BROKEN_APPLIED_KEY]) {
        const { plugins } = SettingsStore.plain;
        for (const name of ZYCORD_BROKEN_PLUGINS) {
            const entry = plugins[name];
            if (!entry?.enabled) continue;
            entry.enabled = false;
            logger.info(`Disabled ${name}: it no longer works against Discord's current bundle`);
        }
        (SettingsStore.plain as any)[BROKEN_APPLIED_KEY] = true;
        SettingsStore.markAsChanged();
    }

    if (SettingsStore.plain[DEFAULTS_APPLIED_KEY]) return;

    const { plugins } = SettingsStore.plain;
    let changed = 0;

    for (const name of ZYCORD_DEFAULT_PLUGINS) {
        if (!(name in plugins)) continue;
        const entry = plugins[name];
        if (!entry || entry.enabled) continue;

        entry.enabled = true;
        changed++;
    }

    (SettingsStore.plain as any)[DEFAULTS_APPLIED_KEY] = true;
    SettingsStore.markAsChanged();
    logger.info(`Applied Zycord defaults: enabled ${changed} plugin(s)`);
}

export function migratePluginSetting(pluginName: string, oldSetting: string, newSetting: string) {
    const settings = SettingsStore.plain.plugins[pluginName];
    if (!settings) return;

    if (!Object.hasOwn(settings, oldSetting) || Object.hasOwn(settings, newSetting)) return;

    settings[newSetting] = settings[oldSetting];
    delete settings[oldSetting];
    SettingsStore.markAsChanged();
}

export function definePluginSettings<
    Def extends SettingsDefinition,
    Checks extends SettingsChecks<Def>,
    PrivateSettings extends object = {}
>(def: Def, checks?: Checks) {
    if (checks) {
        for (const [name, check] of Object.entries(checks)) {
            Object.assign(def[name], check);
        }
    }

    const definedSettings: DefinedSettings<Def, PrivateSettings> = {
        get store() {
            if (!definedSettings.pluginName) throw new Error("Cannot access settings before plugin is initialized");
            return Settings.plugins[definedSettings.pluginName] as any;
        },
        get plain() {
            if (!definedSettings.pluginName) throw new Error("Cannot access settings before plugin is initialized");
            return PlainSettings.plugins[definedSettings.pluginName] as any;
        },
        use: settings => useSettings((
            settings
                ? settings.map(name => `plugins.${definedSettings.pluginName}.${name}`)
                : [`plugins.${definedSettings.pluginName}.*`]
        ) as UseSettings<Settings>[]).plugins[definedSettings.pluginName] as any,
        def,
        pluginName: "",

        withPrivateSettings<T extends object>() {
            return this as DefinedSettings<Def, T>;
        }
    };

    return definedSettings;
}

type UseSettings<T extends object> = ResolveUseSettings<T>[keyof T];

type ResolveUseSettings<T extends object> = {
    [Key in keyof T]:
    Key extends string
    ? T[Key] extends Record<string, unknown>
    // @ts-expect-error "Type instantiation is excessively deep and possibly infinite"
    ? `${Key}.*` | (ResolveUseSettings<T[Key]> extends Record<string, string> ? `${Key}.${ResolveUseSettings<T[Key]>[keyof T[Key]]}` : never)
    : Key
    : never;
};
