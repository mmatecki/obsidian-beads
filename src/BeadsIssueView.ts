import { App, ItemView, MarkdownRenderer, Menu, Modal, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import type BeadsPlugin from "./main";
import {
	formatDate,
	formatStatus,
	statusIcon as getStatusIcon,
	type BeadIssue,
	type BeadIssueDetail,
} from "./utils";

export const VIEW_TYPE_BEADS_ISSUE = "beads-issue-view";

const PRIORITIES: Record<number, string> = {
	0: "P0 — Critical",
	1: "P1 — High",
	2: "P2 — Medium",
	3: "P3 — Low",
	4: "P4 — Backlog",
};

const DEP_TYPES: Record<string, string> = {
	blocks: "Blocks",
	related: "Related",
	"discovered-from": "Discovered from",
	tracks: "Tracks",
};

export class BeadsIssueView extends ItemView {
	plugin: BeadsPlugin;
	private issueId = "";
	private projectDir = "";
	private issueStatus = "";

	constructor(leaf: WorkspaceLeaf, plugin: BeadsPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string { return VIEW_TYPE_BEADS_ISSUE; }
	getDisplayText(): string { return this.issueId || "Bead"; }
	getIcon(): string { return "circle-dot"; }

	async setState(state: { issueId: string; projectDir: string }, result: { history: boolean }): Promise<void> {
		this.issueId = state.issueId;
		this.projectDir = state.projectDir;
		await this.loadAndRender();
		await super.setState(state, result);
	}

	getState(): Record<string, unknown> {
		return { issueId: this.issueId, projectDir: this.projectDir };
	}

	async onOpen(): Promise<void> {}
	async onClose(): Promise<void> {}

	private async loadAndRender(): Promise<void> {
		const outer = this.containerEl.children[1] as HTMLElement;
		outer.empty();
		outer.removeClass("beads-issue-detail");
		outer.removeClass("beads-view-screen");

		if (!this.issueId || !this.projectDir) {
			outer.createEl("div", { text: "No issue selected", cls: "beads-empty-state" });
			return;
		}

		outer.createEl("div", { text: "Loading...", cls: "beads-loading" });

		let issueDetail: BeadIssueDetail | null = null;
		let allIssues: BeadIssue[] = [];
		let aborted = false;
		let showDone = false;
		let listDone = false;

		const tryRender = () => {
			if (aborted || !showDone || !listDone) return;
			outer.empty();
			if (!issueDetail) return;
			const screen = outer.createEl("div", { cls: "beads-view-screen" });
			this.renderContent(screen, issueDetail, allIssues);
			(this.leaf as any).updateHeader();
		};

		this.plugin.runBd(
			["show", this.issueId, "--json"],
			this.projectDir,
			(error, stdout, stderr) => {
				if (aborted) return;
				if (error) {
					aborted = true;
					outer.empty();
					console.error("Beads: bd show failed", error.message, stderr);
					outer.createEl("div", { text: "Failed to load issue", cls: "beads-error" });
					return;
				}
				try {
					const issues = JSON.parse(stdout) as BeadIssueDetail[];
					if (issues.length === 0) {
						aborted = true;
						outer.empty();
						outer.createEl("div", { text: "Issue not found", cls: "beads-error" });
						return;
					}
					issueDetail = issues[0];
				} catch {
					aborted = true;
					outer.empty();
					outer.createEl("div", { text: "Failed to parse issue", cls: "beads-error" });
					return;
				}
				showDone = true;
				tryRender();
			},
		);

		this.plugin.runBd(
			["list", "--json", "--limit=0", "--all"],
			this.projectDir,
			(_err, stdout) => {
				if (aborted) return;
				try {
					allIssues = JSON.parse(stdout) as BeadIssue[];
				} catch { /* non-fatal */ }
				listDone = true;
				tryRender();
			},
		);
	}

	private renderContent(outer: HTMLElement, issue: BeadIssueDetail, allIssues: BeadIssue[]): void {
		this.issueStatus = issue.status;
		const issueById = new Map(allIssues.map((i) => [i.id, i]));

		const allDeps = issue.dependencies || [];
		const parentDep = allDeps.find((d) => d.dependency_type === "parent-child");
		const parentId = parentDep ? parentDep.id : issue.parent_id;
		const deps = allDeps.filter((d) => d.dependency_type !== "parent-child");

		const dependents = allIssues.filter(
			(i) => i.id !== issue.id && i.dependencies?.some((d) => d.depends_on_id === issue.id),
		);

		// ── HEADER ──────────────────────────────────────────
		const header = outer.createEl("div", { cls: "beads-view-header" });

		// Back link — small and subtle above title
		const backBtn = header.createEl("button", { cls: "beads-view-back-btn" });
		const backIcon = backBtn.createEl("span", { cls: "beads-view-back-icon" });
		setIcon(backIcon, "arrow-left");
		backBtn.createEl("span", { text: "Back to beads" });
		backBtn.addEventListener("click", () => this.leaf.detach());

		// Title row: H1 + actions top-right
		const titleRow = header.createEl("div", { cls: "beads-view-title-row" });

		const titleBlock = titleRow.createEl("div", { cls: "beads-view-title-block" });
		titleBlock.createEl("h1", { cls: "beads-view-title", text: issue.title });
		titleBlock.createEl("div", { cls: "beads-view-issue-id", text: issue.id });

		if (parentId) {
			const breadcrumb = titleBlock.createEl("div", { cls: "beads-view-parent-breadcrumb" });
			breadcrumb.createEl("span", { cls: "beads-view-breadcrumb-label", text: "Parent: " });
			const parentPill = breadcrumb.createEl("button", { cls: "beads-view-nav-pill" });
			parentPill.createEl("span", { text: parentId });
			parentPill.addEventListener("click", () => this.plugin.openIssue(parentId, this.projectDir));
		}

		const headerActions = titleRow.createEl("div", { cls: "beads-view-header-actions" });
		const moreBtn = headerActions.createEl("button", {
			cls: "beads-view-more-btn clickable-icon",
			attr: { "aria-label": "More actions" },
		});
		setIcon(moreBtn, "more-horizontal");
		moreBtn.addEventListener("click", (e) => this.showMoreMenu(e));

		const editBtn = headerActions.createEl("button", {
			cls: "beads-view-edit-btn mod-cta",
			text: "Edit Bead",
		});
		editBtn.addEventListener("click", () => this.plugin.openEditIssue(this.issueId, this.projectDir));

		// ── METADATA (two-column compact grid) ────────────
		const metaCard = outer.createEl("div", { cls: "beads-view-meta-card" });

		// Row 1: Type | Status
		this.renderMetaField(metaCard, "Type", (val) => {
			val.createEl("span", {
				cls: `beads-issue-type beads-type-${issue.issue_type}`,
				text: issue.issue_type,
			});
		});
		this.renderMetaField(metaCard, "Status", (val) => {
			val.createEl("span", {
				cls: `beads-view-status-${issue.status}`,
				text: formatStatus(issue.status),
			});
		});

		// Row 2: Priority | Assignee
		this.renderMetaField(metaCard, "Priority", (val) => {
			val.createEl("span", { text: PRIORITIES[issue.priority] ?? `P${issue.priority}` });
		});
		if (issue.assignee) {
			this.renderMetaField(metaCard, "Assignee", (val) => {
				val.createEl("span", { text: issue.assignee! });
			});
		}
		if (issue.owner) {
			this.renderMetaField(metaCard, "Owner", (val) => {
				val.createEl("span", { text: issue.owner! });
			});
		}
		if (issue.due_at) {
			this.renderMetaField(metaCard, "Due", (val) => {
				val.createEl("span", { cls: "beads-view-ts", text: formatDate(issue.due_at!) });
			});
		}

		// External ref
		if (issue.external_ref) {
			this.renderMetaField(metaCard, "Ext. Ref", (val) => {
				const ref = issue.external_ref!;
				// If it looks like a URL, render as a link
				if (ref.startsWith("http://") || ref.startsWith("https://")) {
					val.createEl("a", { text: ref, href: ref, cls: "external-link" });
				} else {
					val.createEl("span", { text: ref });
				}
			});
		}

		// Labels — full width
		if (issue.labels && issue.labels.length > 0) {
			this.renderMetaField(metaCard, "Labels", (val) => {
				for (const label of issue.labels!) {
					val.createEl("a", { cls: "tag", text: `#${label}`, href: "#" });
				}
			}, true);
		}

		// Timestamps — Created | Updated | Closed
		if (issue.created_at) {
			this.renderMetaField(metaCard, "Created", (val) => {
				val.createEl("span", { cls: "beads-view-ts", text: formatDate(issue.created_at!) });
			});
		}
		if (issue.created_by) {
			this.renderMetaField(metaCard, "Created by", (val) => {
				val.createEl("span", { text: issue.created_by! });
			});
		}
		if (issue.updated_at) {
			this.renderMetaField(metaCard, "Updated", (val) => {
				val.createEl("span", { cls: "beads-view-ts", text: formatDate(issue.updated_at!) });
			});
		}
		if (issue.closed_at) {
			this.renderMetaField(metaCard, "Closed", (val) => {
				val.createEl("span", { cls: "beads-view-ts", text: formatDate(issue.closed_at!) });
			});
		}
		if (issue.close_reason) {
			this.renderMetaField(metaCard, "Close reason", (val) => {
				val.createEl("span", { cls: "beads-view-close-reason", text: issue.close_reason! });
			}, true);
		}

		// ── DESCRIPTION ───────────────────────────────────
		if (issue.description) {
			// markdown-rendered gives Obsidian reading-mode typography;
			// padding:0 !important in CSS suppresses the theme padding that caused empty space
			const descEl = outer.createEl("div", { cls: "beads-view-description markdown-rendered" });
			void MarkdownRenderer.render(this.app, issue.description, descEl, "", this);
		}

		// ── NOTES (Obsidian callout) ───────────────────────
		if (issue.notes) {
			const notesEl = outer.createEl("div", { cls: "beads-view-notes" });
			const calloutMd = "> [!note] Notes\n> \n" +
				issue.notes.split("\n").map((line) => `> ${line}`).join("\n");
			void MarkdownRenderer.render(this.app, calloutMd, notesEl, "", this);
		}

		// ── DESIGN (Obsidian callout) ──────────────────────
		if (issue.design) {
			const designEl = outer.createEl("div", { cls: "beads-view-design" });
			const calloutMd = "> [!abstract] Design\n> \n" +
				issue.design.split("\n").map((line) => `> ${line}`).join("\n");
			void MarkdownRenderer.render(this.app, calloutMd, designEl, "", this);
		}

		// ── DEPENDENCIES ──────────────────────────────────
		if (deps.length > 0 || dependents.length > 0) {
			const depsSection = outer.createEl("div", { cls: "beads-view-section" });
			depsSection.createEl("h3", { cls: "beads-view-section-title", text: "Dependencies" });
			const depsContent = depsSection.createEl("div", { cls: "beads-view-deps" });

			if (deps.length > 0) {
				const byType = new Map<string, typeof deps>();
				for (const dep of deps) {
					const list = byType.get(dep.dependency_type) || [];
					list.push(dep);
					byType.set(dep.dependency_type, list);
				}
				for (const [depType, label] of Object.entries(DEP_TYPES)) {
					const group = byType.get(depType);
					if (!group || group.length === 0) continue;
					this.renderDepGroup(depsContent, label, group.map((d) => d.id), issueById);
				}
			}

			if (dependents.length > 0) {
				this.renderDepGroup(depsContent, "Dependents", dependents.map((d) => d.id), issueById);
			}
		}
	}

	/** Renders a compact two-column metadata field into the meta card. */
	private renderMetaField(
		outer: HTMLElement,
		label: string,
		renderValue: (el: HTMLElement) => void,
		fullWidth = false,
	): void {
		const field = outer.createEl("div", {
			cls: fullWidth ? "beads-view-meta-field beads-view-meta-field--full" : "beads-view-meta-field",
		});
		field.createEl("span", { cls: "beads-view-prop-label", text: label });
		const val = field.createEl("div", { cls: "beads-view-prop-value" });
		renderValue(val);
	}

	private renderDepGroup(
		outer: HTMLElement,
		label: string,
		ids: string[],
		issueById: Map<string, BeadIssue>,
	): void {
		const group = outer.createEl("div", { cls: "beads-view-dep-group" });
		group.createEl("div", { cls: "beads-view-dep-group-label", text: label });
		const rows = group.createEl("div", { cls: "beads-view-dep-rows" });
		for (const id of ids) {
			this.renderDepRow(rows, id, issueById);
		}
	}

	private renderDepRow(outer: HTMLElement, id: string, issueById: Map<string, BeadIssue>): void {
		const meta = issueById.get(id);
		const status = meta?.status ?? "open";
		const row = outer.createEl("button", { cls: "beads-view-dep-row" });

		// Status icon (left)
		const iconEl = row.createEl("span", { cls: "beads-view-dep-icon" });
		setIcon(iconEl, getStatusIcon(status));
		iconEl.addClass(`beads-status-${status}`);

		// ID
		row.createEl("span", { cls: "beads-view-dep-id", text: id });

		// Title — flexible, takes remaining space
		if (meta?.title) {
			row.createEl("span", { cls: "beads-view-dep-title", text: meta.title });
		}

		// Badges (right): type + status label
		const badges = row.createEl("div", { cls: "beads-view-dep-badges" });
		if (meta?.issue_type) {
			badges.createEl("span", {
				cls: `beads-issue-type beads-type-${meta.issue_type}`,
				text: meta.issue_type,
			});
		}
		if (meta?.status) {
			badges.createEl("span", {
				cls: `beads-view-dep-status-text beads-view-status-${meta.status}`,
				text: formatStatus(meta.status),
			});
		}

		row.addEventListener("click", () => this.plugin.openIssue(id, this.projectDir));
	}

	private showMoreMenu(event: MouseEvent): void {
		const menu = new Menu();

		if (this.issueStatus === "closed") {
			menu.addItem((item) =>
				item
					.setTitle("Reopen bead")
					.setIcon("rotate-ccw")
					.onClick(() => {
						new ReasonModal(this.app, "Reopen bead", "Reopen Bead", (reason) => {
							const args = reason
								? ["reopen", this.issueId, "--reason", reason]
								: ["reopen", this.issueId];
							this.plugin.runBd(args, this.projectDir, (error, _stdout, stderr) => {
								if (error) {
									new Notice("Failed to reopen: " + (stderr || error.message));
									return;
								}
								new Notice(`Reopened: ${this.issueId}`);
								this.plugin.refreshBeadsView();
								void this.loadAndRender();
							});
						}).open();
					}),
			);
		} else {
			menu.addItem((item) =>
				item
					.setTitle("Close bead")
					.setIcon("x-circle")
					.onClick(() => {
						new ReasonModal(this.app, "Close bead", "Close Bead", (reason) => {
							const args = reason
								? ["close", this.issueId, "--reason", reason]
								: ["close", this.issueId];
							this.plugin.runBd(args, this.projectDir, (error, _stdout, stderr) => {
								if (error) {
									new Notice("Failed to close: " + (stderr || error.message));
									return;
								}
								new Notice(`Closed: ${this.issueId}`);
								this.plugin.refreshBeadsView();
								this.leaf.detach();
							});
						}).open();
					}),
			);
		}

		menu.showAtMouseEvent(event);
	}
}

class ReasonModal extends Modal {
	private onConfirm: (reason: string) => void;
	private heading: string;
	private confirmLabel: string;

	constructor(app: App, heading: string, confirmLabel: string, onConfirm: (reason: string) => void) {
		super(app);
		this.heading = heading;
		this.confirmLabel = confirmLabel;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: this.heading, cls: "beads-modal-title" });

		const input = contentEl.createEl("input", {
			cls: "beads-modal-input",
			attr: { type: "text", placeholder: "Reason (optional)" },
		});

		const btnRow = contentEl.createEl("div", { cls: "beads-modal-btn-row" });
		const cancelBtn = btnRow.createEl("button", { text: "Cancel" });
		const confirmBtn = btnRow.createEl("button", { text: this.confirmLabel, cls: "mod-warning" });

		const confirm = () => { this.close(); this.onConfirm(input.value.trim()); };

		cancelBtn.addEventListener("click", () => this.close());
		confirmBtn.addEventListener("click", confirm);
		input.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter") confirm();
		});

		setTimeout(() => input.focus(), 50);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
