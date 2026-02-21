# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

An Obsidian plugin ("Beads") that adds a custom left sidebar panel for AI-native issue tracking. Uses the Beads CLI (`bd`) for issue tracking stored in `.beads/`.

## Build Commands

- `npm run dev` — watch mode, auto-copies plugin to `~/projects/obsidian/.obsidian/plugins/obsidian-beads/`
- `npm run build` — production build (type-checks with tsc, then bundles with esbuild)

Output: `main.js` (bundled CJS), copied alongside `manifest.json` and `styles.css` to the vault.

**Note:** The user runs `npm run dev` separately in watch mode. Do NOT run builds — esbuild will pick up changes automatically.

## Workflow

- Commit after every completed beads issue (`bd close` then git commit).
- Don't close bead until confirmed by human.

## Architecture

```
src/
├── main.ts        # BeadsPlugin (extends Plugin) — registers view, ribbon icon, command
└── BeadsView.ts   # BeadsView (extends ItemView) — left sidebar panel UI
```

- **Plugin entry** (`main.ts`): `BeadsPlugin.onload()` registers the `BeadsView`, adds a ribbon icon and command, and auto-opens the view on layout ready via `activateView()`.
- **Sidebar view** (`BeadsView.ts`): `VIEW_TYPE_BEADS` constant identifies the view. Renders into the left leaf using Obsidian's DOM helpers (`containerEl.createEl`).
- **Build** (`esbuild.config.mjs`): In dev mode, an `onEnd` plugin copies built files to the Obsidian vault. `obsidian` and codemirror packages are marked external.

## Issue Tracking

Uses Beads (`bd` CLI). Issues stored in `.beads/issues.jsonl`.

```bash
bd list              # view issues
bd show <id>         # issue details
bd create "title"    # new issue
bd update <id> --status done
```

## Useful docs

* CLI reference: https://github.com/steveyegge/beads/blob/main/docs/CLI_REFERENCE.md
* UI Philosophy: https://github.com/steveyegge/beads/blob/main/docs/UI_PHILOSOPHY.md
* Labels: https://github.com/steveyegge/beads/blob/main/docs/LABELS.md
 
