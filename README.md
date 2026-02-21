# Beads — Obsidian Plugin

An Obsidian plugin that brings [Beads](https://github.com/steveyegge/beads) issue tracking into your vault. Browse, create, and manage issues from a left-sidebar panel without leaving Obsidian.

## What is Beads?

[Beads](https://github.com/steveyegge/beads) is an AI-native issue tracker where issues live directly in your Git repository (`.beads/issues.jsonl`). The `bd` CLI manages them. This plugin surfaces that data inside Obsidian.

## Features

- **Sidebar panel** — collapsible tree of all your Beads projects and their issues
- **Issue detail view** — full metadata, markdown-rendered description, notes, and design docs rendered as Obsidian callouts
- **Create / Edit issues** — forms with type, priority, assignee, labels, description, notes, design, due date, and external ref
- **Dependency graph** — interactive Cytoscape.js graph showing blocking and parent-child relationships; click any node to open its issue
- **Drag-and-drop reparenting** — drag an issue onto another to set it as a child, or onto the project row to promote it to root
- **Filter bar** — filter by status (All / Open / In Progress / Blocked / Deferred / Closed) and free-text search
- **Close / Reopen** — close or reopen issues with an optional reason, directly from the detail view
- **Auto-refresh** — the sidebar refreshes every 30 seconds

## Requirements

- [Obsidian](https://obsidian.md/) 0.15.0 or later
- The [`bd` CLI](https://github.com/steveyegge/beads) installed and accessible on your system

## Installation

### Manual

1. Download or build `main.js`, `manifest.json`, and `styles.css`.
2. Copy them to `<your-vault>/.obsidian/plugins/obsidian-beads/`.
3. In Obsidian → Settings → Community plugins, enable **Beads**.

### From source

```bash
git clone https://github.com/<you>/obsidian-beads
cd obsidian-beads
npm install
npm run build
```

Then copy the output files to your vault's plugin directory as above.

## Configuration

Open **Settings → Beads** to configure:

| Setting | Description |
|---|---|
| **Beads CLI path** | Absolute path to the `bd` binary (default: `/opt/homebrew/bin/bd`) |
| **Default issue type** | Pre-selected type in the New Bead form |
| **Default priority** | Pre-selected priority (P0 Critical → P4 Backlog) |
| **Default assignee** | Pre-filled assignee for new beads |
| **Issue types** | Customise the list of available types (default: epic, feature, task, bug) |
| **Label presets** | Quick-add label chips shown when creating or editing beads |

## Usage

### Adding a project

Click the **+** button in the Beads sidebar header and select a directory that contains a `.beads/` folder (i.e. a repo already initialised with `bd init`).

### Working with issues

- **Expand** a project row to load its issues.
- **Click** an issue to open the detail view.
- **Click the + button** on a project or issue row to create a new (child) bead.
- **Click the graph icon** on a project row to open the dependency graph.
- **Drag** an issue onto another to reparent it; drag it onto the project row to make it a root-level issue.

### Keyboard / command

Run the **"Open Beads panel"** command from the Command Palette (`Ctrl/Cmd+P`) or click the ribbon icon to reveal the sidebar.

## Development

```bash
npm install
npm run dev   # watch mode — auto-copies to ~/projects/obsidian/.obsidian/plugins/obsidian-beads/
npm run build # production build with type checking
```

## License

MIT
