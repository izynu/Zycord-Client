/*
 * Zycord, a Discord client
 * Copyright (c) 2026 Zynu
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import * as DataStore from "@api/DataStore";
import { ClockIcon, DeleteIcon, PlusIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import { Menu, PresenceStore, showToast, UserSettingsActionCreators, UserSettingsProtoStore, UserStore } from "@webpack/common";

const logger = new Logger("CustomStatusPresets");

/** Namespaced DataStore key. Never reuse this string elsewhere. */
const STORE_KEY = "CustomStatusPresets_presets";

/** Discord's "INFREQUENT_USER_ACTION" throttle bucket for settings updates. */
const INFREQUENT_USER_ACTION = 0;

/** Keep the menu manageable; silently drop the oldest entry past the cap. */
const MAX_PRESETS = 25;

export interface Preset {
    text: string;
    /** Unicode emoji, or a `<:name:id>` / `<a:name:id>` custom emoji string. */
    emoji?: string;
}

export interface PresetStore {
    presets: Preset[];
}

/** Mirrors the persisted store so the context menu can render synchronously. */
let presetCache: Preset[] = [];

function isUsable(preset: Preset | null | undefined): preset is Preset {
    return !!preset && typeof preset.text === "string" && preset.text.trim().length > 0;
}

/** Read the persisted store, tolerating missing or malformed data. */
export async function readPresets(): Promise<Preset[]> {
    const stored = await DataStore.get<PresetStore>(STORE_KEY);
    const presets = stored && Array.isArray(stored.presets) ? stored.presets.filter(isUsable) : [];
    return presets.map(({ text, emoji }) => emoji ? { text, emoji } : { text });
}

async function writePresets(presets: Preset[]): Promise<Preset[]> {
    const clean = presets.filter(isUsable).map(({ text, emoji }) => emoji ? { text, emoji } : { text });
    await DataStore.set(STORE_KEY, { presets: clean } satisfies PresetStore);
    presetCache = clean;
    return clean;
}

function samePreset(a: Preset, b: Preset) {
    return a.text === b.text && (a.emoji ?? "") === (b.emoji ?? "");
}

/** Save a preset. Rejects empty text and de-duplicates identical presets. */
export async function addPreset(preset: Preset): Promise<Preset[]> {
    const text = preset?.text?.trim();
    if (!text) throw new Error("Cannot save a preset without status text");

    const toSave: Preset = preset.emoji?.trim() ? { text, emoji: preset.emoji.trim() } : { text };
    const presets = await readPresets();

    const existing = presets.findIndex(p => samePreset(p, toSave));
    if (existing !== -1) {
        // Move the re-saved preset to the front instead of creating a duplicate
        presets.splice(existing, 1);
    }
    presets.unshift(toSave);

    return writePresets(presets.slice(0, MAX_PRESETS));
}

/** Delete the preset at {@link index}. Out-of-range indexes are a no-op. */
export async function removePreset(index: number): Promise<Preset[]> {
    const presets = await readPresets();
    if (index < 0 || index >= presets.length) return writePresets(presets);

    presets.splice(index, 1);
    return writePresets(presets);
}

export async function clearPresets(): Promise<Preset[]> {
    return writePresets([]);
}

export async function refreshCache() {
    presetCache = await readPresets();
    return presetCache;
}

function resolveEmoji(emoji?: string): { name: string; id: string; } | null {
    if (!emoji) return null;

    const custom = emoji.match(/^<(a?):(\w+):(\d+)>$/);
    if (custom) return { name: custom[2], id: custom[3] };

    return { name: emoji, id: "0" };
}

/** Discord's proto helper modules, resolved lazily so an early load does not break. */
function getPreloadedSettings() {
    return UserSettingsActionCreators.PreloadedUserSettingsActionCreators as any;
}

function searchProtoClassField(localName: string, protoClass: any) {
    const field = protoClass?.fields?.find((f: any) => f.localName === localName);
    if (!field) return;

    const fieldGetter = Object.values(field).find(value => typeof value === "function") as any;
    return fieldGetter?.();
}

/** discord_protos.discord_users.v1.CustomStatus */
function getCustomStatusProtoClass() {
    const preloaded = getPreloadedSettings()?.ProtoClass;
    return searchProtoClassField("customStatus", searchProtoClassField("status", preloaded));
}

/**
 * Read the custom status currently stored in Discord's user settings proto.
 * Falls back to the local presence activity if the proto has not been loaded yet.
 */
export function getCurrentCustomStatus(): Preset | null {
    const statusSettings = (UserSettingsProtoStore as any)?.settings?.status;
    const protoStatus = statusSettings?.customStatus;

    const protoText: string = protoStatus?.text ?? "";
    if (protoText.trim()) {
        const emojiId: string = protoStatus?.emojiId ?? "0";
        const emojiName: string = protoStatus?.emojiName ?? "";
        const emoji = emojiName
            ? emojiId && emojiId !== "0"
                ? `<:${emojiName}:${emojiId}>`
                : emojiName
            : undefined;

        return emoji ? { text: protoText, emoji } : { text: protoText };
    }

    try {
        const me = UserStore.getCurrentUser();
        if (!me) return null;

        const activity: any = PresenceStore.getActivities(me.id).find(a => a.type === 4); // CUSTOM_STATUS
        const text: string = activity?.state ?? "";
        if (!text.trim()) return null;

        const emoji: string | undefined = activity?.emoji?.name
            ? activity.emoji.id
                ? `<:${activity.emoji.name}:${activity.emoji.id}>`
                : activity.emoji.name
            : undefined;

        return emoji ? { text, emoji } : { text };
    } catch (e) {
        logger.error("Failed to read current custom status", e);
        return null;
    }
}

/**
 * Apply a preset as the account's custom status via the user settings proto,
 * which is the same path Discord's own custom status editor uses.
 */
export async function applyPreset(preset: Preset): Promise<void> {
    if (!isUsable(preset)) throw new Error("Cannot apply an empty preset");

    const actions = getPreloadedSettings();
    if (!actions?.updateAsync) throw new Error("Discord's user settings module is unavailable");

    const CustomStatusProto = getCustomStatusProtoClass();
    const emoji = resolveEmoji(preset.emoji);
    const now = `${Date.now()}`;

    await actions.updateAsync("status", (status: any) => {
        const customStatus = CustomStatusProto?.create() ?? {};
        customStatus.text = preset.text;
        customStatus.emojiId = emoji?.id ?? "0";
        customStatus.emojiName = emoji?.name ?? "";
        customStatus.expiresAtMs = "0";
        customStatus.createdAtMs = now;

        status.customStatus = customStatus;
        status.statusExpiresAtMs = "0";
    }, INFREQUENT_USER_ACTION);
}

/** Save whatever custom status the user is wearing right now. */
export async function saveCurrentStatusAsPreset(): Promise<Preset | null> {
    const current = getCurrentCustomStatus();
    if (!current) {
        showToast({ text: "You don't have a custom status to save.", variant: "critical" });
        return null;
    }

    await addPreset(current);
    showToast({ text: "Status saved as a preset.", variant: "success" });
    return current;
}

function applyWithFeedback(preset: Preset) {
    applyPreset(preset)
        .then(() => showToast({ text: "Custom status applied.", variant: "success" }))
        .catch(e => {
            logger.error("Failed to apply preset", e);
            showToast({ text: "Failed to apply custom status preset.", variant: "critical" });
        });
}

function saveWithFeedback() {
    saveCurrentStatusAsPreset().catch(e => {
        logger.error("Failed to save preset", e);
        showToast({ text: "Failed to save custom status preset.", variant: "critical" });
    });
}

function deleteWithFeedback(index: number) {
    removePreset(index)
        .then(() => showToast({ text: "Preset deleted.", variant: "success" }))
        .catch(e => {
            logger.error("Failed to delete preset", e);
            showToast({ text: "Failed to delete custom status preset.", variant: "critical" });
        });
}

function presetLabel(preset: Preset) {
    const label = `${preset.emoji ? `${preset.emoji} ` : ""}${preset.text}`;
    return label.length > 60 ? `${label.slice(0, 57)}...` : label;
}

const userContextPatch: NavContextMenuPatchCallback = (children, { user }: { user?: { id: string; }; }) => {
    const me = UserStore.getCurrentUser();
    if (!user || !me || user.id !== me.id) return;

    const saveItem = (
        <Menu.MenuItem
            id="vc-csp-save"
            key="vc-csp-save"
            label="Save Current Status as Preset"
            icon={PlusIcon}
            leadingAccessory={{ type: "icon", icon: PlusIcon }}
            action={saveWithFeedback}
        />
    );

    const applyItem = (
        <Menu.MenuItem
            id="vc-csp-apply"
            key="vc-csp-apply"
            label="Apply Status Preset"
            icon={ClockIcon}
            leadingAccessory={{ type: "icon", icon: ClockIcon }}
        >
            {presetCache.length === 0
                ? <Menu.MenuItem id="vc-csp-empty" key="vc-csp-empty" label="No presets saved yet" disabled />
                : presetCache.map((preset, index) => (
                    <Menu.MenuItem
                        id={`vc-csp-apply-${index}`}
                        key={`vc-csp-apply-${index}`}
                        label={presetLabel(preset)}
                        action={() => applyWithFeedback(preset)}
                    />
                ))
            }
        </Menu.MenuItem>
    );

    const deleteItem = presetCache.length === 0 ? null : (
        <Menu.MenuItem
            id="vc-csp-delete"
            key="vc-csp-delete"
            label="Delete Status Preset"
            icon={DeleteIcon}
            leadingAccessory={{ type: "icon", icon: DeleteIcon }}
        >
            {presetCache.map((preset, index) => (
                <Menu.MenuItem
                    id={`vc-csp-delete-${index}`}
                    key={`vc-csp-delete-${index}`}
                    label={presetLabel(preset)}
                    action={() => deleteWithFeedback(index)}
                />
            ))}
        </Menu.MenuItem>
    );

    const group = findGroupChildrenByChildId("copy-id", children) ?? children;
    group.push(saveItem, applyItem);
    if (deleteItem) group.push(deleteItem);
};

export default definePlugin({
    name: "CustomStatusPresets",
    description: "Save frequently used custom statuses (text and emoji) as presets and apply them with one click.",
    tags: ["Customisation", "Utility", "Friends"],
    authors: [Devs.Zynu],

    contextMenus: {
        "user-context": userContextPatch,
        "user-profile-actions": userContextPatch,
        "user-profile-overflow-menu": userContextPatch
    },

    async start() {
        try {
            await refreshCache();
        } catch (e) {
            logger.error("Failed to load presets", e);
        }
    },

    // Exposed on the plugin object so other plugins (and the verification probe)
    // can use the same code path the UI does.
    readPresets,
    addPreset,
    removePreset,
    clearPresets,
    applyPreset,
    saveCurrentStatusAsPreset,
    getCurrentCustomStatus
});
