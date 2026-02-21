import { App, Notice, Platform, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from "obsidian";
import * as path from "path";
import { BeadsView, VIEW_TYPE_BEADS } from "./BeadsView";
import { BeadsIssueView, VIEW_TYPE_BEADS_ISSUE } from "./BeadsIssueView";
import { BeadsCreateView, VIEW_TYPE_BEADS_CREATE } from "./BeadsCreateView";
import { BeadsEditView, VIEW_TYPE_BEADS_EDIT } from "./BeadsEditView";
import { BeadsGraphView, VIEW_TYPE_BEADS_GRAPH } from "./BeadsGraphView";

const DEFAULT_ISSUE_TYPES = ["epic", "feature", "task", "bug"];

interface BeadsSettings {
	projects: string[];
	bdPath: string;
	issueTypes: string[];
	labelPresets: string[];
	defaultPriority: string;
	defaultIssueType: string;
	defaultAssignee: string;
}

const DEFAULT_SETTINGS: BeadsSettings = {
	projects: [],
	bdPath: "/opt/homebrew/bin/bd",
	issueTypes: [...DEFAULT_ISSUE_TYPES],
	labelPresets: [],
	defaultPriority: "2",
	defaultIssueType: "task",
	defaultAssignee: "",
};

export default class BeadsPlugin extends Plugin {
	settings: BeadsSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addSettingTab(new BeadsSettingTab(this.app, this));

		this.registerView(VIEW_TYPE_BEADS, (leaf) => new BeadsView(leaf, this));
		this.registerView(VIEW_TYPE_BEADS_ISSUE, (leaf) => new BeadsIssueView(leaf, this));
		this.registerView(VIEW_TYPE_BEADS_CREATE, (leaf) => new BeadsCreateView(leaf, this));
		this.registerView(VIEW_TYPE_BEADS_EDIT, (leaf) => new BeadsEditView(leaf, this));
		this.registerView(VIEW_TYPE_BEADS_GRAPH, (leaf) => new BeadsGraphView(leaf, this));

		this.addRibbonIcon("list-tree", "Open Beads", () => {
			this.activateView();
		});

		this.addCommand({
			id: "open-beads-view",
			name: "Open Beads panel",
			callback: () => {
				this.activateView();
			},
		});

		this.app.workspace.onLayoutReady(() => {
			this.activateView();
		});
	}

	onunload(): void {
		// cleanup
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	runBd(
		args: string[],
		cwd: string,
		callback: (error: Error | null, stdout: string, stderr: string) => void,
	): void {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const mod = "child_process";
		const cp = require(mod) as typeof import("child_process");
		cp.execFile(this.settings.bdPath, args, { cwd }, callback);
	}

	async openCreateIssue(projectDir: string, parentId?: string): Promise<void> {
		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({
			type: VIEW_TYPE_BEADS_CREATE,
			active: true,
			state: { projectDir, parentId: parentId || "" },
		});
		this.app.workspace.revealLeaf(leaf);
	}

	async openGraph(projectDir: string): Promise<void> {
		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({ type: VIEW_TYPE_BEADS_GRAPH, active: true, state: { projectDir } });
		this.app.workspace.revealLeaf(leaf);
	}

	async openEditIssue(issueId: string, projectDir: string): Promise<void> {
		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({
			type: VIEW_TYPE_BEADS_EDIT,
			active: true,
			state: { issueId, projectDir },
		});
		this.app.workspace.revealLeaf(leaf);
	}

	async openIssue(issueId: string, projectDir: string): Promise<void> {
		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({
			type: VIEW_TYPE_BEADS_ISSUE,
			active: true,
			state: { issueId, projectDir },
		});
		this.app.workspace.revealLeaf(leaf);
	}

	refreshBeadsView(): void {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_BEADS);
		for (const leaf of leaves) {
			const view = leaf.view as BeadsView;
			if (view.refresh) {
				view.refresh();
			}
		}
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_BEADS);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getLeftLeaf(false);
			if (leaf) {
				await leaf.setViewState({
					type: VIEW_TYPE_BEADS,
					active: true,
				});
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}
}

class BeadsSettingTab extends PluginSettingTab {
	plugin: BeadsPlugin;

	constructor(app: App, plugin: BeadsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ── CLI ───────────────────────────────────────────────────────────
		containerEl.createEl("h3", { text: "General" });

		new Setting(containerEl)
			.setName("Beads CLI path")
			.setDesc("Absolute path to the bd binary")
			.addText((text) =>
				text
					.setPlaceholder("/opt/homebrew/bin/bd")
					.setValue(this.plugin.settings.bdPath)
					.onChange(async (value) => {
						this.plugin.settings.bdPath = value;
						await this.plugin.saveSettings();
						refreshVersion();
					}),
			);

		const versionEl = containerEl.createEl("p", {
			cls: "setting-item-description beads-settings-version",
			text: "Checking bd version…",
		});

		const refreshVersion = () => {
			versionEl.setText("Checking bd version…");
			this.plugin.runBd(["--version"], "/", (error, stdout) => {
				if (error) {
					versionEl.setText("bd not found or returned an error");
				} else {
					versionEl.setText("bd version: " + stdout.trim());
				}
			});
		};

		refreshVersion();

		// ── DEFAULTS FOR NEW BEADS ────────────────────────────────────────
		containerEl.createEl("h3", { text: "Defaults for new beads" });

		new Setting(containerEl)
			.setName("Default issue type")
			.setDesc("Pre-selected type when creating a new bead")
			.addDropdown((dd) => {
				for (const type of this.plugin.settings.issueTypes) {
					dd.addOption(type, type.charAt(0).toUpperCase() + type.slice(1));
				}
				dd.setValue(
					this.plugin.settings.issueTypes.includes(this.plugin.settings.defaultIssueType)
						? this.plugin.settings.defaultIssueType
						: this.plugin.settings.issueTypes[0] ?? "task",
				);
				dd.onChange(async (value) => {
					this.plugin.settings.defaultIssueType = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Default priority")
			.setDesc("Pre-selected priority when creating a new bead")
			.addDropdown((dd) => {
				dd.addOption("0", "P0 — Critical");
				dd.addOption("1", "P1 — High");
				dd.addOption("2", "P2 — Medium");
				dd.addOption("3", "P3 — Low");
				dd.addOption("4", "P4 — Backlog");
				dd.setValue(this.plugin.settings.defaultPriority);
				dd.onChange(async (value) => {
					this.plugin.settings.defaultPriority = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Default assignee")
			.setDesc("Pre-filled assignee for new beads (leave blank for none)")
			.addText((text) =>
				text
					.setPlaceholder("e.g. alice")
					.setValue(this.plugin.settings.defaultAssignee)
					.onChange(async (value) => {
						this.plugin.settings.defaultAssignee = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		// ── ISSUE TYPES ───────────────────────────────────────────────────
		containerEl.createEl("h3", { text: "Issue types" });
		containerEl.createEl("p", {
			text: "Types available when creating or editing beads. Defaults: epic, feature, task, bug.",
			cls: "setting-item-description",
		});

		const typeListEl = containerEl.createEl("div", { cls: "beads-settings-type-list" });
		const renderTypeList = () => {
			typeListEl.empty();
			for (const type of this.plugin.settings.issueTypes) {
				const row = typeListEl.createEl("div", { cls: "beads-settings-type-row" });
				row.createEl("span", { text: type, cls: "beads-settings-type-name" });
				new Setting(row)
					.addButton((btn) =>
						btn
							.setIcon("trash")
							.setTooltip("Remove")
							.setWarning()
							.onClick(async () => {
								this.plugin.settings.issueTypes =
									this.plugin.settings.issueTypes.filter((t) => t !== type);
								await this.plugin.saveSettings();
								renderTypeList();
							}),
					);
			}
		};
		renderTypeList();

		let newTypeName = "";
		new Setting(containerEl)
			.setName("Add issue type")
			.addText((text) =>
				text
					.setPlaceholder("e.g. spike")
					.onChange((v) => { newTypeName = v.trim().toLowerCase(); }),
			)
			.addButton((btn) =>
				btn
					.setButtonText("Add")
					.setCta()
					.onClick(async () => {
						if (!newTypeName || this.plugin.settings.issueTypes.includes(newTypeName)) return;
						this.plugin.settings.issueTypes.push(newTypeName);
						await this.plugin.saveSettings();
						newTypeName = "";
						this.display();
					}),
			);

		new Setting(containerEl)
			.addButton((btn) =>
				btn
					.setButtonText("Reset to defaults")
					.onClick(async () => {
						this.plugin.settings.issueTypes = [...DEFAULT_ISSUE_TYPES];
						await this.plugin.saveSettings();
						this.display();
					}),
			);

		// ── LABEL PRESETS ─────────────────────────────────────────────────
		containerEl.createEl("h3", { text: "Label presets" });
		containerEl.createEl("p", {
			text: "Commonly-used labels shown as quick-add chips when creating or editing beads.",
			cls: "setting-item-description",
		});

		const labelListEl = containerEl.createEl("div", { cls: "beads-settings-type-list" });
		const renderLabelList = () => {
			labelListEl.empty();
			for (const label of this.plugin.settings.labelPresets) {
				const row = labelListEl.createEl("div", { cls: "beads-settings-type-row" });
				row.createEl("span", { text: label, cls: "beads-settings-type-name" });
				new Setting(row)
					.addButton((btn) =>
						btn
							.setIcon("trash")
							.setTooltip("Remove")
							.setWarning()
							.onClick(async () => {
								this.plugin.settings.labelPresets =
									this.plugin.settings.labelPresets.filter((l) => l !== label);
								await this.plugin.saveSettings();
								renderLabelList();
							}),
					);
			}
		};
		renderLabelList();

		let newLabelName = "";
		new Setting(containerEl)
			.setName("Add label preset")
			.addText((text) =>
				text
					.setPlaceholder("e.g. backend or component:auth")
					.onChange((v) => { newLabelName = v.trim().toLowerCase(); }),
			)
			.addButton((btn) =>
				btn
					.setButtonText("Add")
					.setCta()
					.onClick(async () => {
						if (!newLabelName || this.plugin.settings.labelPresets.includes(newLabelName)) return;
						this.plugin.settings.labelPresets.push(newLabelName);
						await this.plugin.saveSettings();
						newLabelName = "";
						this.display();
					}),
			);
	}
}
