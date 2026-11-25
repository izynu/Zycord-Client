/*
 * Zycord, a Discord client
 * Copyright (c) 2026 Zynu
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";

import managedStyle from "./style.css?managed";

const logger = new Logger("MediaPlaybackSpeed");

const MARKERS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const MEDIA_SELECTOR = "video, audio";

const settings = definePluginSettings({
    speed: {
        type: OptionType.SLIDER,
        description: "Playback speed for audio and video players in chat",
        markers: MARKERS,
        default: 1,
        stickToMarkers: true,
        onChange: () => applyToAllMedia()
    }
});

let button: HTMLButtonElement | null = null;
let anchor: HTMLMediaElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | undefined;

function isMedia(node: unknown): node is HTMLMediaElement {
    return node instanceof HTMLMediaElement;
}

/**
 * Sets the playback rate of a media element without throwing.
 * @returns the rate the element actually has after the attempt
 */
export function setPlaybackRate(media: HTMLMediaElement | null, rate: number): number {
    if (!media || !Number.isFinite(rate) || rate <= 0) return media?.playbackRate ?? 1;

    try {
        // Keep voices from sounding like chipmunks
        media.preservesPitch = true;
    } catch { /* not supported, harmless */ }

    try {
        media.playbackRate = rate;
    } catch (e) {
        // The media resource is not loaded yet (NETWORK_EMPTY). Remember the
        // rate and the loadedmetadata listener will apply it once it is.
        try {
            media.defaultPlaybackRate = rate;
        } catch { /* give up silently, never break playback */ }
        logger.debug("Deferred playback rate until metadata is available", e);
    }

    return media.playbackRate;
}

export function applyToAllMedia() {
    let rate: number;
    try {
        rate = settings.store.speed;
    } catch {
        return;
    }

    for (const media of document.querySelectorAll<HTMLMediaElement>(MEDIA_SELECTOR)) {
        setPlaybackRate(media, rate);
    }
    updateLabel();
}

function formatRate(rate: number) {
    return `${Number(rate.toFixed(2))}×`;
}

function updateLabel() {
    if (!button) return;
    let rate = 1;
    try {
        rate = settings.store.speed;
    } catch { }
    button.textContent = formatRate(rate);
    button.title = `Playback speed: ${formatRate(rate)} (click to change)`;
    button.setAttribute("aria-label", `Playback speed ${formatRate(rate)}, click to change`);
}

function nextRate(current: number) {
    const next = MARKERS.find(m => m > current + 0.001);
    return next ?? MARKERS[0];
}

function getButton() {
    if (button) return button;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "vc-media-speed-btn";
    btn.addEventListener("pointerdown", e => {
        // Never let the click reach Discord's player (play/pause etc.)
        e.preventDefault();
        e.stopPropagation();
    }, true);
    btn.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();

        try {
            settings.store.speed = nextRate(settings.store.speed);
        } catch (err) {
            logger.error("Failed to change the playback speed", err);
            return;
        }
        applyToAllMedia();
    });

    button = btn;
    return btn;
}

function updatePosition() {
    if (!button) return;

    if (!anchor || !anchor.isConnected) {
        hideButton();
        return;
    }

    const rect = anchor.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 24 || rect.bottom < 0 || rect.top > window.innerHeight) {
        hideButton();
        return;
    }

    button.style.top = `${Math.max(4, rect.top + 8)}px`;
    button.style.left = `${Math.min(window.innerWidth - 64, rect.right - 60)}px`;
}

function showFor(media: HTMLMediaElement) {
    anchor = media;
    const btn = getButton();
    if (!btn.isConnected) document.body.appendChild(btn);
    updateLabel();
    updatePosition();
}

function hideButton() {
    anchor = null;
    button?.remove();
}

function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => hideButton(), 500);
}

function onMouseOver(e: MouseEvent) {
    const { target } = e;
    if (!(target instanceof Element)) return;

    if (target === button || target.closest(".vc-media-speed-btn")) {
        clearTimeout(hideTimer);
        return;
    }

    const media = target.closest(MEDIA_SELECTOR);
    if (isMedia(media)) {
        clearTimeout(hideTimer);
        showFor(media);
    } else {
        scheduleHide();
    }
}

function onMediaEvent(e: Event) {
    const media = e.target;
    if (!isMedia(media)) return;

    try {
        setPlaybackRate(media, settings.store.speed);
    } catch (err) {
        logger.error("Failed to apply the playback rate", err);
    }
}

function onViewportChange() {
    if (anchor) updatePosition();
}

export default definePlugin({
    name: "MediaPlaybackSpeed",
    description: "Add a playback speed control (0.5x - 2x) to audio and video players in chat",
    tags: ["Media", "Utility"],
    authors: [Devs.Zynu],
    settings,
    managedStyle,

    setPlaybackRate,

    start() {
        document.addEventListener("play", onMediaEvent, true);
        document.addEventListener("loadedmetadata", onMediaEvent, true);
        document.addEventListener("mouseover", onMouseOver, true);
        window.addEventListener("scroll", onViewportChange, true);
        window.addEventListener("resize", onViewportChange);

        applyToAllMedia();
    },

    stop() {
        document.removeEventListener("play", onMediaEvent, true);
        document.removeEventListener("loadedmetadata", onMediaEvent, true);
        document.removeEventListener("mouseover", onMouseOver, true);
        window.removeEventListener("scroll", onViewportChange, true);
        window.removeEventListener("resize", onViewportChange);

        clearTimeout(hideTimer);
        hideButton();
        button = null;

        // Hand the players back at normal speed
        for (const media of document.querySelectorAll<HTMLMediaElement>(MEDIA_SELECTOR)) {
            setPlaybackRate(media, 1);
        }
    }
});
