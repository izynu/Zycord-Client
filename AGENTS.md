# Agent Development Guide

Zycord Client is a standalone Electron desktop client for Windows. It loads Discord's web app in its own window and injects a compiled renderer that adds a plugin system.

## Layout

- `electron/` the desktop shell: window, tray, preload, IPC
- `src/` the renderer and plugin system
- `scripts/build/` esbuild pipelines for the renderer bundles and the shell
- `docs/` the published website

## Tooling

- Always use pnpm, not npm.
- Build with `pnpm build`, which runs the renderer bundles and then the shell.
- `pnpm test:ts` typechecks. `pnpm lint` runs oxlint.
- `pnpm dist` builds the Windows installer with electron-builder.

## Style

- Write clean, simple code.
- Only add abstractions when they provide clear value. Do not future-proof prematurely.
- Only handle cases that are relevant. Do not over-engineer for hypothetical edge cases.
- Before adding common logic, search the codebase for an existing implementation. If one exists but is not exported, extract it into a util.
- Do not add comments unless they explain something a reader could not infer from the code.
- Only add JSDoc to the common API, never to private functions.
- Prefer functions or plain objects over classes.

## Issue and PR Guidelines

AI contributions require human oversight and review.

- Never create an issue.
- Never create a PR.
