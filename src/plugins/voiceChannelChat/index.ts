/*
 * Zycord, a Discord client
 * Copyright (c) 2026 Zynu
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { ChannelRTCStore, ChannelStore, FluxDispatcher, UserStore } from "@webpack/common";

/**
 * Opens the text chat belonging to the voice channel you are connected to.
 *
 * Discord ships text-in-voice natively, but a guild voice call defaults to the
 * NO_CHAT layout, so the chat surface stays hidden. The store and actions that
 * drive it are present in the web client, so this only has to ask for it when a
 * voice connection starts.
 */
const settings = definePluginSettings({
    autoOpen: {
        type: OptionType.BOOLEAN,
        description: "Open the channel's text chat automatically when you join a voice channel",
        default: true
    }
});

const RTCActions = findByPropsLazy("updateChatOpen", "updateLayout") as {
    updateChatOpen(channelId: string, open: boolean): void;
};

const VOICE_CHANNEL = 2;

function onVoiceStateUpdate(event: any) {
    if (!settings.store.autoOpen) return;

    const selfId = UserStore.getCurrentUser()?.id;
    if (!selfId) return;

    for (const state of event.voiceStates ?? []) {
        if (state.userId !== selfId || !state.channelId) continue;

        const channel = ChannelStore.getChannel(state.channelId);
        if (!channel || channel.type !== VOICE_CHANNEL) continue;
        if (ChannelRTCStore.getChatOpen(state.channelId)) continue;

        try {
            RTCActions.updateChatOpen(state.channelId, true);
        } catch (e) {
            console.error("[Zycord] Failed to open voice channel chat", e);
        }
    }
}

export default definePlugin({
    name: "VoiceChannelChat",
    description: "Opens the text chat for the voice channel you are in, so you can type without leaving the call",
    authors: [Devs.Zynu],
    settings,

    start() {
        FluxDispatcher.subscribe("VOICE_STATE_UPDATES", onVoiceStateUpdate);
    },

    stop() {
        FluxDispatcher.unsubscribe("VOICE_STATE_UPDATES", onVoiceStateUpdate);
    }
});
