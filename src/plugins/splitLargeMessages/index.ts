/*
 * Zycord, a Discord client
 * Copyright (c) 2026 Zynu
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addMessagePreSendListener, MessageSendListener, removeMessagePreSendListener } from "@api/MessageEvents";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { sendMessage } from "@utils/discord";
import definePlugin, { OptionType } from "@utils/types";

const MAX_LENGTH = 2000;

const settings = definePluginSettings({
    splitOnNewlines: {
        type: OptionType.BOOLEAN,
        description: "Prefer splitting at line breaks instead of mid-sentence",
        default: true
    },
    addMarkers: {
        type: OptionType.BOOLEAN,
        description: "Append (1/3), (2/3) to each part so the order is obvious",
        default: true
    }
});

/** Split text into chunks of at most `limit` characters, preferring newlines then spaces. */
export function splitMessage(content: string, limit = MAX_LENGTH, preferNewlines = true): string[] {
    const text = content.trim();
    if (text.length <= limit) return [text];

    const chunks: string[] = [];
    let rest = text;

    while (rest.length > limit) {
        const window = rest.slice(0, limit);
        let cut = -1;

        if (preferNewlines) cut = window.lastIndexOf("\n");
        if (cut < limit * 0.5) cut = window.lastIndexOf(" ");
        if (cut < limit * 0.5) cut = limit;

        chunks.push(rest.slice(0, cut).trimEnd());
        rest = rest.slice(cut).trimStart();
    }

    if (rest.length) chunks.push(rest);
    return chunks;
}

export default definePlugin({
    name: "SplitLargeMessages",
    description: "Automatically sends messages longer than Discord's 2000 character limit as several parts",
    authors: [Devs.Zynu],
    settings,

    start() {
        // Cancel the original send and re-dispatch each part through Discord's own
        // send path, so replies and mentions behave normally.
        this.listener = addMessagePreSendListener(((channelId, message) => {
            const content: string = message.content ?? "";
            if (content.length <= MAX_LENGTH) return;

            const parts = splitMessage(content, MAX_LENGTH, settings.store.splitOnNewlines);
            if (parts.length < 2) return;

            const outgoing = settings.store.addMarkers
                ? parts.map((p, i) => `${p}\n(${i + 1}/${parts.length})`)
                : parts;

            (async () => {
                for (const part of outgoing) {
                    await sendMessage(channelId, { content: part, tts: message.tts } as any);
                }
            })();

            return { cancel: true };
        }) as MessageSendListener);
    },

    stop() {
        if (this.listener) removeMessagePreSendListener(this.listener);
    }
});
