/*
 * Zycord, a Discord client
 * Copyright (c) 2026 Zynu
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { pluginRequiresRestart, startDependenciesRecursive, startPlugin, stopPlugin } from "@api/PluginManager";
import { Settings, useSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { FormSwitch } from "@components/FormSwitch";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { Margins } from "@utils/margins";
import { identity } from "@utils/misc";
import { Select, showToast } from "@webpack/common";

const SPEED_MARKERS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

interface PluginToggle {
    name: string;
    title: string;
    description: string;
}

const PLUGIN_TOGGLES: PluginToggle[] = [
    {
        name: "VoiceChannelChat",
        title: "Voice channel text chat",
        description: "Opens the text chat of the voice channel you join."
    },
    {
        name: "UnsuppressEmbeds",
        title: "Unsuppress embeds",
        description: "Adds a context menu entry to show embeds Discord hid behind a warning."
    },
    {
        name: "ClearURLs",
        title: "Strip tracking from links",
        description: "Removes tracking parameters from links before you send or edit a message."
    },
    {
        name: "ShowHiddenChannels",
        title: "Show hidden channels",
        description: "Lists channels you cannot read instead of hiding them entirely."
    },
    {
        name: "MessageLogger",
        title: "Message logger",
        description: "Keeps deleted and edited messages visible for the current session."
    },
    {
        name: "AnonymiseFileNames",
        title: "Anonymise file names",
        description: "Renames uploaded files to hide what you are sending."
    },
];

function toast(text: string, critical = false) {
    showToast({ text, variant: critical ? "critical" : undefined, position: "bottom" });
}

/**
 * Turns a plugin on or off. Plugins without patches are started/stopped live;
 * patched plugins only flip their stored flag and apply on the next launch.
 */
function setPluginEnabled(name: string, enabled: boolean) {
    const plugin = Vencord.Plugins.plugins[name];
    const settings = Settings.plugins[name];

    if (!plugin || !settings) return;

    if (!enabled && !plugin.started) {
        settings.enabled = false;
        return;
    }

    if (enabled && plugin.dependencies?.length) {
        const { failures } = startDependenciesRecursive(plugin);
        if (failures.length) {
            toast(`Failed to start dependencies: ${failures.join(", ")}`, true);
            return;
        }
    }

    if (pluginRequiresRestart(plugin)) {
        settings.enabled = enabled;
        toast(`${plugin.name} will ${enabled ? "start" : "stop"} after you restart Zycord.`);
        return;
    }

    const ok = enabled ? startPlugin(plugin) : stopPlugin(plugin);
    if (!ok) {
        toast(`Failed to ${enabled ? "start" : "stop"} ${plugin.name}.`, true);
        return;
    }

    settings.enabled = enabled;
}

function PluginToggle({ name, title, description }: PluginToggle) {
    const plugin = Vencord.Plugins.plugins[name];
    const enabled = Settings.plugins[name]?.enabled ?? false;

    if (!plugin) return null;

    return (
        <FormSwitch
            title={title}
            description={pluginRequiresRestart(plugin) ? `${description} Needs a restart.` : `${description} Applies immediately.`}
            value={enabled}
            onChange={v => setPluginEnabled(name, v)}
            hideBorder
        />
    );
}

interface SettingDef {
    description?: string;
    default?: any;
}

function getSettingDef(pluginName: string, setting: string): SettingDef | undefined {
    return (Vencord.Plugins.plugins[pluginName]?.settings?.def as Record<string, SettingDef> | undefined)?.[setting];
}

function HideLockedEmojiToggle() {
    const plugin = Vencord.Plugins.plugins.HideDisabledEmojis;
    const def = getSettingDef("HideDisabledEmojis", "hideUnavailable");
    const enabled = Settings.plugins.HideDisabledEmojis?.enabled ?? false;
    const value: boolean = Settings.plugins.HideDisabledEmojis?.hideUnavailable ?? def?.default ?? true;

    if (!plugin || !def) return null;

    return (
        <FormSwitch
            title="Hide locked emoji"
            description={enabled
                ? def.description
                : "Enable the HideDisabledEmojis plugin below to use this."}
            value={value}
            disabled={!enabled}
            onChange={v => {
                Settings.plugins.HideDisabledEmojis.hideUnavailable = v;
            }}
            hideBorder
        />
    );
}

function PlaybackSpeedSetting() {
    const plugin = Vencord.Plugins.plugins.MediaPlaybackSpeed;
    const def = getSettingDef("MediaPlaybackSpeed", "speed");
    const current: number = Settings.plugins.MediaPlaybackSpeed?.speed ?? def?.default ?? 1;

    if (!plugin || !def) return null;

    return (
        <div>
            <Paragraph size="md" weight="medium">Media playback speed</Paragraph>
            <Paragraph size="sm" className={Margins.bottom8}>
                Playback speed used for audio and video players in chat. Changes apply to already loaded players.
            </Paragraph>
            <Select
                placeholder="Playback speed"
                options={SPEED_MARKERS.map(m => ({
                    label: `${m}x`,
                    value: m,
                    default: m === (def.default ?? 1)
                }))}
                closeOnSelect={true}
                select={(v: number) => {
                    Settings.plugins.MediaPlaybackSpeed.speed = v;
                }}
                isSelected={(v: number) => v === current}
                serialize={identity}
            />
        </div>
    );
}

/**
 * On/off switches for features that are backed by a plugin. Every switch here
 * writes real plugin state, either its enabled flag or one of its settings.
 */
export function ZycordToggles() {
    useSettings(["plugins.*"]);

    return (
        <ErrorBoundary noop>
            <section className={Margins.top16}>
                <Heading className={Margins.bottom8}>Feature Toggles</Heading>
                <Paragraph className={Margins.bottom8} style={{ color: "var(--text-muted)" }}>
                    Quick access to Zycord features. Anything marked as needing a restart is saved now and applied the next time Zycord launches.
                </Paragraph>

                <div className="vc-settings-switches">
                    <HideLockedEmojiToggle />
                    {PLUGIN_TOGGLES.map(t => <PluginToggle key={t.name} {...t} />)}
                </div>

                <div className={Margins.top16}>
                    <PlaybackSpeedSetting />
                </div>
            </section>
        </ErrorBoundary>
    );
}
