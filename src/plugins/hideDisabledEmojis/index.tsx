/*
 * Zycord, a Discord client
 * Copyright (c) 2026 Zynu
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";

const settings = definePluginSettings({
    hideUnavailable: {
        type: OptionType.BOOLEAN,
        description: "Hide locked emoji (Nitro-locked, unavailable or role locked) from the emoji picker",
        default: true,
    },
});

export default definePlugin({
    name: "HideDisabledEmojis",
    description: "Hides locked/Nitro-only emojis in the emoji picker so you stop clicking dead entries",
    tags: ["Emotes", "Appearance"],
    authors: [Devs.Zynu],
    settings,

    shouldHide() {
        return settings.store.hideUnavailable;
    },

    patches: [
        {
            // The emoji picker: builds categories, grid and search result sections
            find: '"emoji-picker-categories"',
            replacement: [
                {
                    // Discord partitions each section into usable and disabled emojis,
                    // then concatenates the disabled ones to the end of the list.
                    // Drop them instead so locked emojis never reach the grid.
                    match: /(\i)=(\i)\.concat\((\i)\),/,
                    replace: (_, target, usable, disabled) =>
                        `${target}=$self.shouldHide()?${usable}:${usable}.concat(${disabled}),`
                },
                {
                    // The "Nitro upsell" section rendered from locked search results
                    match: /0!==\i\.locked\.length&&/,
                    replace: "$&!$self.shouldHide()&&"
                }
            ]
        }
    ]
});
