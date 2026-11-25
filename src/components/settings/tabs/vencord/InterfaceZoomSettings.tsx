/*
 * Zycord, a Discord client
 * Copyright (c) 2026 Zynu
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { Margins } from "@utils/margins";
import { React, Slider } from "@webpack/common";

const ZOOM_PLUGIN = "ZycordDesktop";
const ZOOM_SETTING = "zoomLevel";
const MARKERS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

/**
 * Interface zoom, surfaced in the main Zycord tab.
 *
 * The value lives on the ZycordDesktop plugin setting so the plugin's own
 * control and this one cannot drift apart; both read and write the same store.
 */
export function InterfaceZoomSettings() {
    const plugin = Vencord.Plugins?.plugins?.[ZOOM_PLUGIN] as any;
    const def = plugin?.settings?.def?.[ZOOM_SETTING];
    const store = plugin?.settings?.store;

    if (!plugin || !store) return null;

    const current: number = store[ZOOM_SETTING] ?? def?.default ?? 1;

    return (
        <ErrorBoundary noop>
            <Heading className={Margins.bottom8}>Interface Zoom</Heading>
            <Paragraph className={Margins.bottom8}>
                Scales the whole window. 1.00 is 100%. Applies immediately, no restart.
            </Paragraph>

            <Slider
                markers={MARKERS}
                minValue={MARKERS[0]}
                maxValue={MARKERS[MARKERS.length - 1]}
                initialValue={current}
                onValueChange={(v: number) => {
                    store[ZOOM_SETTING] = v;
                }}
                onValueRender={(v: number) => `${Math.round(v * 100)}%`}
                stickToMarkers={false}
            />

            <Paragraph className={Margins.top8} style={{ color: "var(--text-muted)" }}>
                Current: {Math.round(current * 100)}%
            </Paragraph>
        </ErrorBoundary>
    );
}
