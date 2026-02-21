import { ItemView, Notice, Platform, WorkspaceLeaf, setIcon } from "obsidian";
import * as path from "path";
import type BeadsPlugin from "./main";
import { statusIcon as getStatusIcon, buildParentChildMap, type BeadIssue } from "./utils";

export const VIEW_TYPE_BEADS = "beads-view";

export class BeadsView extends ItemView {
	plugin: BeadsPlugin;
	private projectListEl: HTMLElement | null = null;
	private expandedProjects: Set<string> = new Set();
	private expandedIssues: Set<string> = new Set();
	private refreshTimer: number | null = null;
	private draggedIssueId = "";
	private filterStatus = "";
	private filterSearch = "";

	constructor(leaf: WorkspaceLeaf, plugin: BeadsPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_BEADS;
	}

	getDisplayText(): string {
		return "Beads";
	}

	getIcon(): string {
		return "list-tree";
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		container.empty();

		const root = container.createEl("div", { cls: "beads-root" });

		const header = root.createEl("div", { cls: "beads-header" });
		header.createEl("span", { text: "Projects", cls: "beads-header-title" });

		if (Platform.isDesktop) {
			const addBtn = header.createEl("button", {
				cls: "beads-add-project-btn clickable-icon",
				attr: { "aria-label": "Add project" },
			});
			setIcon(addBtn, "plus");
			addBtn.addEventListener("click", () => this.addProject());
		}

		// ── Filter bar ────────────────────────────────────
		const filterBar = root.createEl("div", { cls: "beads-filter-bar" });

		const searchInput = filterBar.createEl("input", {
			cls: "beads-filter-search",
			attr: { type: "text", placeholder: "Search…" },
		});
		searchInput.value = this.filterSearch;
		searchInput.addEventListener("input", () => {
			this.filterSearch = searchInput.value;
			this.refresh();
		});

		const statusSel = filterBar.createEl("select", { cls: "beads-filter-status" });
		const statusOptions: [string, string][] = [
			["", "All"],
			["open", "Open"],
			["in_progress", "In Progress"],
			["blocked", "Blocked"],
			["deferred", "Deferred"],
			["closed", "Closed"],
		];
		for (const [val, label] of statusOptions) {
			const opt = statusSel.createEl("option", { value: val, text: label });
			if (val === this.filterStatus) opt.selected = true;
		}
		statusSel.addEventListener("change", () => {
			this.filterStatus = statusSel.value;
			this.refresh();
		});

		this.projectListEl = root.createEl("div", { cls: "beads-project-list" });
		this.renderProjects();

		this.refreshTimer = window.setInterval(() => this.refresh(), 30000);
	}

	async onClose(): Promise<void> {
		if (this.refreshTimer !== null) {
			window.clearInterval(this.refreshTimer);
			this.refreshTimer = null;
		}
	}

	refresh(): void {
		if (!this.projectListEl) return;
		for (const dir of this.expandedProjects) {
			const projectEl = this.projectListEl.querySelector(
				`[data-project-dir="${CSS.escape(dir)}"]`,
			);
			if (projectEl) {
				const childrenEl = projectEl.querySelector(".beads-children") as HTMLElement;
				if (childrenEl) {
					this.loadBeads(dir, childrenEl);
				}
			}
		}
	}

	private renderProjects(): void {
		if (!this.projectListEl) return;
		this.projectListEl.empty();

		const projects = this.plugin.settings.projects;

		if (projects.length === 0) {
			this.projectListEl.createEl("div", {
				cls: "beads-empty-state",
				text: "No projects added yet",
			});
			return;
		}

		for (const dir of projects) {
			this.renderProjectNode(dir);
		}
	}

	private renderProjectNode(dir: string): void {
		if (!this.projectListEl) return;

		const projectEl = this.projectListEl.createEl("div", {
			cls: "beads-project",
			attr: { "data-project-dir": dir },
		});
		const isExpanded = this.expandedProjects.has(dir);

		const item = projectEl.createEl("div", { cls: "beads-tree-item beads-project-row" });

		const chevron = item.createEl("span", { cls: "beads-chevron" });
		setIcon(chevron, isExpanded ? "chevron-down" : "chevron-right");

		const iconEl = item.createEl("span", { cls: "beads-project-icon" });
		setIcon(iconEl, "folder");

		item.createEl("span", {
			text: path.basename(dir),
			cls: "beads-project-name",
		});

		const graphBtn = item.createEl("button", {
			cls: "beads-add-issue-btn",
			attr: { "aria-label": "Dependency graph" },
		});
		setIcon(graphBtn, "git-fork");
		graphBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.plugin.openGraph(dir);
		});

		const addIssueBtn = item.createEl("button", {
			cls: "beads-add-issue-btn",
			attr: { "aria-label": "New bead" },
		});
		setIcon(addIssueBtn, "plus");
		addIssueBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.plugin.openCreateIssue(dir);
		});

		const childrenEl = projectEl.createEl("div", { cls: "beads-children" });
		if (!isExpanded) {
			childrenEl.style.display = "none";
		}

		item.addEventListener("click", () => {
			if (this.expandedProjects.has(dir)) {
				this.expandedProjects.delete(dir);
				childrenEl.style.display = "none";
				setIcon(chevron, "chevron-right");
			} else {
				this.expandedProjects.add(dir);
				childrenEl.style.display = "";
				setIcon(chevron, "chevron-down");
				this.loadBeads(dir, childrenEl);
			}
		});

		// Drop on project row → remove parent (make root-level)
		item.addEventListener("dragover", (e) => {
			if (!e.dataTransfer?.types.includes("beads/issue-id")) return;
			e.preventDefault();
			e.dataTransfer.dropEffect = "move";
			item.addClass("beads-drop-target");
		});
		item.addEventListener("dragleave", (e) => {
			if (!item.contains(e.relatedTarget as Node)) {
				item.removeClass("beads-drop-target");
			}
		});
		item.addEventListener("drop", (e) => {
			e.preventDefault();
			item.removeClass("beads-drop-target");
			const draggedId = e.dataTransfer?.getData("beads/issue-id");
			const draggedDir = e.dataTransfer?.getData("beads/project-dir");
			if (!draggedId || draggedDir !== dir) return;
			this.plugin.runBd(
				["update", draggedId, "--parent", ""],
				dir,
				(error, _stdout, stderr) => {
					if (error) {
						new Notice("Failed to reparent: " + (stderr || error.message));
						return;
					}
					new Notice(`Moved ${draggedId} to root`);
					this.refresh();
				},
			);
		});

		if (isExpanded) {
			this.loadBeads(dir, childrenEl);
		}
	}

	private loadBeads(dir: string, containerEl: HTMLElement): void {
		containerEl.empty();
		const loading = containerEl.createEl("div", {
			cls: "beads-loading",
			text: "Loading...",
		});

		const listArgs = this.filterStatus
			? ["list", "--json", "--limit=0", "--status", this.filterStatus]
			: ["list", "--json", "--limit=0", "--all"];

		this.plugin.runBd(
			listArgs,
			dir,
			(error, stdout, stderr) => {
				loading.remove();

				if (error) {
					console.error("Beads: bd list failed", error.message, stderr);
					containerEl.createEl("div", {
						cls: "beads-error",
						text: "Failed to load beads",
					});
					return;
				}

				let issues: BeadIssue[];
				try {
					issues = JSON.parse(stdout);
				} catch {
					containerEl.createEl("div", {
						cls: "beads-error",
						text: "Failed to parse beads",
					});
					return;
				}

				// Client-side text filter
				if (this.filterSearch) {
					const q = this.filterSearch.toLowerCase();
					issues = issues.filter(
						(i) => i.id.toLowerCase().includes(q) || i.title.toLowerCase().includes(q),
					);
				}

				if (issues.length === 0) {
					containerEl.createEl("div", {
						cls: "beads-empty-state",
						text: "No beads found",
					});
					return;
				}

				// Build parent->children map
				// Use parent_id if set, otherwise infer from dotted ID
				// e.g. "proj-8.1" is a child of "proj-8", "proj-8.1.2" is a child of "proj-8.1"
				const { roots, childrenMap } = buildParentChildMap(issues);

				// Sort newest-first at every level: IDs are sequential so the
				// trailing integer is a reliable creation-order proxy.
				const trailingNum = (id: string) =>
					parseInt(id.match(/(\d+)$/)?.[1] ?? "0", 10);
				const byNewest = (a: BeadIssue, b: BeadIssue) =>
					trailingNum(b.id) - trailingNum(a.id);

				roots.sort(byNewest);
				for (const siblings of childrenMap.values()) {
					siblings.sort(byNewest);
				}

				for (const issue of roots) {
					this.renderBeadItem(containerEl, issue, dir, childrenMap);
				}
			},
		);
	}

	private renderBeadItem(
		containerEl: HTMLElement,
		issue: BeadIssue,
		projectDir: string,
		childrenMap: Map<string, BeadIssue[]>,
	): void {
		const children = childrenMap.get(issue.id) || [];
		const hasChildren = children.length > 0;
		const canHaveChildren = ["epic", "feature", "task"].includes(issue.issue_type);

		const wrapper = containerEl.createEl("div", { cls: "beads-issue-node" });
		const item = wrapper.createEl("div", { cls: "beads-tree-item beads-issue-row" });

		// Chevron for expandable items, spacer for leaf nodes
		if (hasChildren) {
			const issueKey = `${projectDir}:${issue.id}`;
			const isExpanded = this.expandedIssues.has(issueKey);

			const chevron = item.createEl("span", { cls: "beads-chevron" });
			setIcon(chevron, isExpanded ? "chevron-down" : "chevron-right");

			const childrenEl = wrapper.createEl("div", { cls: "beads-children" });
			if (!isExpanded) {
				childrenEl.style.display = "none";
			} else {
				for (const child of children) {
					this.renderBeadItem(childrenEl, child, projectDir, childrenMap);
				}
			}

			chevron.addEventListener("click", (e) => {
				e.stopPropagation();
				if (this.expandedIssues.has(issueKey)) {
					this.expandedIssues.delete(issueKey);
					childrenEl.style.display = "none";
					setIcon(chevron, "chevron-right");
				} else {
					this.expandedIssues.add(issueKey);
					childrenEl.style.display = "";
					childrenEl.empty();
					for (const child of children) {
						this.renderBeadItem(childrenEl, child, projectDir, childrenMap);
					}
					setIcon(chevron, "chevron-down");
				}
			});
		} else {
			item.createEl("span", { cls: "beads-chevron-spacer" });
		}

		// Status icon
		const statusIcon = item.createEl("span", { cls: "beads-issue-status" });
		const iconName = this.statusIcon(issue.status);
		setIcon(statusIcon, iconName);
		statusIcon.addClass(`beads-status-${issue.status}`);

		item.createEl("span", {
			text: issue.id,
			cls: "beads-issue-id",
		});

		item.createEl("span", {
			text: issue.title,
			cls: "beads-issue-title",
		});

		// Type badge for epics/features
		if (issue.issue_type === "epic" || issue.issue_type === "feature") {
			item.createEl("span", {
				text: issue.issue_type,
				cls: `beads-issue-type beads-type-${issue.issue_type}`,
			});
		}

		// Add child button
		if (canHaveChildren) {
			const addChildBtn = item.createEl("button", {
				cls: "beads-add-issue-btn",
				attr: { "aria-label": "Add child bead" },
			});
			setIcon(addChildBtn, "plus");
			addChildBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				this.plugin.openCreateIssue(projectDir, issue.id);
			});
		}

		// Drag source
		item.draggable = true;
		item.addEventListener("dragstart", (e) => {
			this.draggedIssueId = issue.id;
			e.dataTransfer!.setData("beads/issue-id", issue.id);
			e.dataTransfer!.setData("beads/project-dir", projectDir);
			e.dataTransfer!.effectAllowed = "move";
			item.addClass("beads-dragging");
		});
		item.addEventListener("dragend", () => {
			this.draggedIssueId = "";
			item.removeClass("beads-dragging");
		});

		// Drop target — reparent dragged issue under this one
		item.addEventListener("dragover", (e) => {
			if (this.draggedIssueId === issue.id) return;
			if (!e.dataTransfer?.types.includes("beads/issue-id")) return;
			e.preventDefault();
			e.dataTransfer!.dropEffect = "move";
			item.addClass("beads-drop-target");
		});
		item.addEventListener("dragleave", (e) => {
			if (!item.contains(e.relatedTarget as Node)) {
				item.removeClass("beads-drop-target");
			}
		});
		item.addEventListener("drop", (e) => {
			e.preventDefault();
			e.stopPropagation();
			item.removeClass("beads-drop-target");
			const draggedId = e.dataTransfer?.getData("beads/issue-id");
			const draggedDir = e.dataTransfer?.getData("beads/project-dir");
			if (!draggedId || draggedId === issue.id || draggedDir !== projectDir) return;
			this.plugin.runBd(
				["update", draggedId, "--parent", issue.id],
				projectDir,
				(error, _stdout, stderr) => {
					if (error) {
						new Notice("Failed to reparent: " + (stderr || error.message));
						return;
					}
					new Notice(`Moved ${draggedId} under ${issue.id}`);
					this.refresh();
				},
			);
		});

		// Click to open issue detail
		item.addEventListener("click", () => this.plugin.openIssue(issue.id, projectDir));
	}

	private statusIcon(status: string): string {
		return getStatusIcon(status);
	}

	private async addProject(): Promise<void> {
		try {
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const { remote } = require("electron");
			const result = await remote.dialog.showOpenDialog({
				properties: ["openDirectory"],
				title: "Select project directory",
			});

			if (result.canceled || result.filePaths.length === 0) return;

			const selected = result.filePaths[0];
			if (this.plugin.settings.projects.includes(selected)) return;

			this.plugin.settings.projects.push(selected);
			await this.plugin.saveSettings();
			this.renderProjects();
		} catch (e) {
			console.error("Beads: failed to open directory picker", e);
		}
	}
}
