import { ItemView, MarkdownRenderer, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import type BeadsPlugin from "./main";
import {
	buildUpdateArgs,
	formatDate,
	formatStatus,
	statusIcon as getStatusIcon,
	type BeadIssue,
	type BeadIssueDetail,
	type DepEntry,
} from "./utils";

export const VIEW_TYPE_BEADS_EDIT = "beads-edit-view";

const PRIORITIES: Record<string, string> = {
	"0": "P0 — Critical",
	"1": "P1 — High",
	"2": "P2 — Medium",
	"3": "P3 — Low",
	"4": "P4 — Backlog",
};

const STATUSES: Record<string, string> = {
	open: "Open",
	in_progress: "In Progress",
	blocked: "Blocked",
	deferred: "Deferred",
	closed: "Closed",
};

const DEP_TYPES: Record<string, string> = {
	blocks: "Blocks",
	related: "Related",
	"discovered-from": "Discovered from",
	tracks: "Tracks",
};

export class BeadsEditView extends ItemView {
	plugin: BeadsPlugin;
	private issueId = "";
	private projectDir = "";
	private originalParent = "";
	private existingDeps: DepEntry[] = [];
	private editedDeps: DepEntry[] = [];
	private issueCache: { id: string; title: string }[] = [];
	private labelsArray: string[] = [];
	private createdAt = "";
	private updatedAt = "";
	private descTextarea: HTMLTextAreaElement | null = null;
	private descPreviewEl: HTMLElement | null = null;
	private descMode: "edit" | "preview" = "edit";
	private submitBtn: HTMLButtonElement | null = null;
	private formData = {
		title: "",
		type: "task",
		priority: "2",
		status: "open",
		assignee: "",
		labels: "",
		description: "",
		notes: "",
		design: "",
		due: "",
		parent: "",
		externalRef: "",
	};

	constructor(leaf: WorkspaceLeaf, plugin: BeadsPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string { return VIEW_TYPE_BEADS_EDIT; }
	getDisplayText(): string { return this.issueId ? `Edit ${this.issueId}` : "Edit Bead"; }
	getIcon(): string { return "pencil"; }

	async setState(state: { issueId: string; projectDir: string }, result: { history: boolean }): Promise<void> {
		this.issueId = state.issueId;
		this.projectDir = state.projectDir;
		this.originalParent = "";
		this.existingDeps = [];
		this.editedDeps = [];
		this.issueCache = [];
		this.labelsArray = [];
		this.createdAt = "";
		this.updatedAt = "";
		this.descMode = "edit";
		await this.loadAndRender();
		await super.setState(state, result);
	}

	getState(): Record<string, unknown> { return { issueId: this.issueId, projectDir: this.projectDir }; }
	async onOpen(): Promise<void> { /* rendered via setState */ }
	async onClose(): Promise<void> { this.descTextarea = null; this.descPreviewEl = null; }

	private async loadAndRender(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();

		if (!this.issueId || !this.projectDir) {
			container.createEl("div", { text: "No issue selected", cls: "beads-empty-state" });
			return;
		}

		container.createEl("div", { text: "Loading...", cls: "beads-loading" });

		let issueDetail: BeadIssueDetail | null = null;
		let allIssues: BeadIssue[] = [];
		let aborted = false;
		let showDone = false;
		let listDone = false;

		const tryRender = () => {
			if (aborted || !showDone || !listDone) return;
			container.empty();
			if (!issueDetail) return;
			const screen = container.createEl("div", { cls: "beads-view-screen" });
			this.renderForm(screen, issueDetail, allIssues);
			(this.leaf as any).updateHeader();
		};

		this.plugin.runBd(
			["show", this.issueId, "--json"],
			this.projectDir,
			(error, stdout, stderr) => {
				if (aborted) return;
				if (error) {
					aborted = true;
					container.empty();
					console.error("Beads: bd show failed", error.message, stderr);
					container.createEl("div", { text: "Failed to load issue", cls: "beads-error" });
					return;
				}
				let issues: BeadIssueDetail[];
				try {
					issues = JSON.parse(stdout);
					if (issues.length === 0) {
						aborted = true;
						container.empty();
						container.createEl("div", { text: "Issue not found", cls: "beads-error" });
						return;
					}
				} catch {
					aborted = true;
					container.empty();
					container.createEl("div", { text: "Failed to parse issue", cls: "beads-error" });
					return;
				}

				const issue = issues[0];
				const allDeps = issue.dependencies || [];
				const parentDep = allDeps.find((d) => d.dependency_type === "parent-child");
				const parentId = parentDep ? parentDep.id : (issue.parent_id || "");

				this.formData = {
					title: issue.title || "",
					type: issue.issue_type || "task",
					priority: String(issue.priority ?? 2),
					status: issue.status || "open",
					assignee: issue.assignee || "",
					labels: (issue.labels || []).join(", "),
					description: issue.description || "",
					notes: issue.notes || "",
					design: issue.design || "",
					due: issue.due_at || "",
					parent: parentId,
					externalRef: issue.external_ref || "",
				};
				this.labelsArray = (issue.labels || []).filter(Boolean);
				this.originalParent = parentId;
				this.existingDeps = allDeps
					.filter((d) => d.dependency_type !== "parent-child")
					.map((d) => ({ id: d.id, depType: d.dependency_type }));
				this.editedDeps = [...this.existingDeps];
				this.createdAt = issue.created_at || "";
				this.updatedAt = issue.updated_at || "";

				issueDetail = issue;
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
					this.issueCache = allIssues.map((i) => ({ id: i.id, title: i.title }));
				} catch { /* non-fatal */ }
				listDone = true;
				tryRender();
			},
		);
	}

	private renderForm(container: HTMLElement, issue: BeadIssueDetail, allIssues: BeadIssue[]): void {

		// ── HEADER (matches view-mode structure) ──────────────────────────
		const header = container.createEl("div", { cls: "beads-view-header" });

		const backBtn = header.createEl("button", { cls: "beads-view-back-btn" });
		setIcon(backBtn.createEl("span", { cls: "beads-view-back-icon" }), "arrow-left");
		backBtn.createEl("span", { text: "Back to beads" });
		backBtn.addEventListener("click", () => this.leaf.detach());

		const titleRow = header.createEl("div", { cls: "beads-view-title-row" });
		const titleBlock = titleRow.createEl("div", { cls: "beads-view-title-block" });

		// Title as H1-styled input
		const titleInput = titleBlock.createEl("input", {
			cls: "beads-edit-title-input",
			attr: { type: "text", placeholder: "Bead title..." },
		});
		titleInput.value = this.formData.title;
		titleInput.addEventListener("input", () => { this.formData.title = titleInput.value; });

		titleBlock.createEl("div", { cls: "beads-view-issue-id", text: this.issueId });

		// Actions: Cancel + Save
		const headerActions = titleRow.createEl("div", { cls: "beads-view-header-actions" });
		const cancelBtn = headerActions.createEl("button", { cls: "beads-view-edit-btn", text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.leaf.detach());
		const saveBtn = headerActions.createEl("button", { cls: "beads-view-edit-btn mod-cta", text: "Save" });
		this.submitBtn = saveBtn;
		saveBtn.addEventListener("click", () => this.handleSubmit());

		// ── METADATA CARD (editable, same dark panel as view) ─────────────
		const metaCard = container.createEl("div", { cls: "beads-view-meta-card" });

		// Type
		this.renderEditMetaField(metaCard, "Type", (val) => {
			const availableTypes = this.plugin.settings.issueTypes.includes(this.formData.type)
				? this.plugin.settings.issueTypes
				: [...this.plugin.settings.issueTypes, this.formData.type];
			const sel = val.createEl("select", { cls: "beads-meta-card-select" });
			for (const type of availableTypes) {
				sel.createEl("option", { value: type, text: type.charAt(0).toUpperCase() + type.slice(1) });
			}
			sel.value = this.formData.type;
			sel.addEventListener("change", () => { this.formData.type = sel.value; });
		});

		// Status
		this.renderEditMetaField(metaCard, "Status", (val) => {
			const sel = val.createEl("select", { cls: "beads-meta-card-select" });
			for (const [value, label] of Object.entries(STATUSES)) {
				sel.createEl("option", { value, text: label });
			}
			sel.value = this.formData.status;
			sel.addEventListener("change", () => { this.formData.status = sel.value; });
		});

		// Priority
		this.renderEditMetaField(metaCard, "Priority", (val) => {
			const sel = val.createEl("select", { cls: "beads-meta-card-select" });
			for (const [value, label] of Object.entries(PRIORITIES)) {
				sel.createEl("option", { value, text: label });
			}
			sel.value = this.formData.priority;
			sel.addEventListener("change", () => { this.formData.priority = sel.value; });
		});

		// Assignee
		this.renderEditMetaField(metaCard, "Assignee", (val) => {
			const inp = val.createEl("input", {
				cls: "beads-meta-card-input",
				attr: { type: "text", placeholder: "Assignee..." },
			});
			inp.value = this.formData.assignee;
			inp.addEventListener("input", () => { this.formData.assignee = inp.value; });
		});

		// Labels (full width, editable pill row)
		this.renderEditMetaField(metaCard, "Labels", (val) => {
			this.mountLabelsPills(val);
		}, true);

		// Due
		this.renderEditMetaField(metaCard, "Due", (val) => {
			const inp = val.createEl("input", {
				cls: "beads-meta-card-input",
				attr: { type: "text", placeholder: "e.g. 2026-03-01" },
			});
			inp.value = this.formData.due;
			inp.addEventListener("input", () => { this.formData.due = inp.value; });
		});

		// External ref
		this.renderEditMetaField(metaCard, "Ext. Ref", (val) => {
			const inp = val.createEl("input", {
				cls: "beads-meta-card-input",
				attr: { type: "text", placeholder: "e.g. gh-123 or jira-PROJ-456" },
			});
			inp.value = this.formData.externalRef;
			inp.addEventListener("input", () => { this.formData.externalRef = inp.value; });
		});

		// Created (read-only)
		if (this.createdAt) {
			this.renderEditMetaField(metaCard, "Created", (val) => {
				val.createEl("span", { cls: "beads-view-ts", text: formatDate(this.createdAt) });
			});
		}
		// Updated (read-only)
		if (this.updatedAt) {
			this.renderEditMetaField(metaCard, "Updated", (val) => {
				val.createEl("span", { cls: "beads-view-ts", text: formatDate(this.updatedAt) });
			});
		}

		// ── DESCRIPTION ───────────────────────────────────────────────────
		const descSection = container.createEl("div", { cls: "beads-edit-description-section" });
		this.mountDescEditor(descSection, this.formData.description);

		// ── NOTES ─────────────────────────────────────────────────────────
		this.renderTextareaSection(container, "Notes (optional)", "beads-edit-textarea-section", "notes", "Additional notes", 5);

		// ── DESIGN ────────────────────────────────────────────────────────
		this.renderTextareaSection(container, "Design (optional)", "beads-edit-textarea-section", "design", "Design notes", 5);

		// ── DEPENDENCIES (editable) ───────────────────────────────────────
		const issueById = new Map(allIssues.map((i) => [i.id, i]));
		const dependents = allIssues.filter(
			(i) => i.id !== issue.id && i.dependencies?.some((d) => d.depends_on_id === issue.id),
		);
		this.renderDepSelector(container, issueById, dependents);
	}

	/** Renders a compact two-column metadata field into the meta card (edit variant). */
	private renderEditMetaField(
		container: HTMLElement,
		label: string,
		renderValue: (el: HTMLElement) => void,
		fullWidth = false,
	): void {
		const field = container.createEl("div", {
			cls: fullWidth ? "beads-view-meta-field beads-view-meta-field--full" : "beads-view-meta-field",
		});
		field.createEl("span", { cls: "beads-view-prop-label", text: label });
		const val = field.createEl("div", { cls: "beads-view-prop-value" });
		renderValue(val);
	}

	/** Inline label pill editor mounted inside a meta-card value cell. */
	private mountLabelsPills(container: HTMLElement): void {
		const renderLabels = () => {
			container.empty();
			for (const label of this.labelsArray) {
				const chip = container.createEl("span", { cls: "beads-dep-chip beads-dep-chip--sm" });
				chip.createEl("span", { text: label });
				const rm = chip.createEl("button", { cls: "beads-dep-chip-remove", text: "×" });
				rm.addEventListener("click", () => {
					this.labelsArray = this.labelsArray.filter((l) => l !== label);
					renderLabels();
				});
			}
			const addPill = container.createEl("button", { cls: "beads-add-pill beads-add-pill--sm", text: "+ add" });
			addPill.addEventListener("click", () => {
				addPill.style.display = "none";
				const input = container.createEl("input", {
					cls: "beads-label-inline-input",
					attr: { type: "text", placeholder: "label..." },
				});
				input.focus();
				const commit = () => {
					const val = input.value.trim().replace(/,+$/, "");
					if (val && !this.labelsArray.includes(val)) {
						this.labelsArray.push(val);
					}
					renderLabels();
				};
				input.addEventListener("keydown", (e: KeyboardEvent) => {
					if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(); }
					else if (e.key === "Escape") { renderLabels(); }
				});
				input.addEventListener("blur", () => { setTimeout(commit, 100); });
			});
			// Preset chips (only show presets not already added)
			const presets = this.plugin.settings.labelPresets ?? [];
			const remaining = presets.filter((p) => !this.labelsArray.includes(p));
			if (remaining.length > 0) {
				const presetsRow = container.createEl("div", { cls: "beads-label-presets" });
				for (const preset of remaining) {
					const btn = presetsRow.createEl("button", {
						cls: "beads-label-preset-chip",
						text: preset,
					});
					btn.addEventListener("click", () => {
						if (!this.labelsArray.includes(preset)) {
							this.labelsArray.push(preset);
							renderLabels();
						}
					});
				}
			}
		};
		renderLabels();
	}

	private mountDescEditor(container: HTMLElement, content: string): void {
		this.descTextarea = null;
		this.descPreviewEl = null;

		const header = container.createEl("div", { cls: "beads-description-header" });
		header.createEl("label", { cls: "beads-description-label", text: "Description" });
		const toggleBtn = header.createEl("button", {
			cls: "beads-desc-toggle clickable-icon",
			attr: { "aria-label": "Preview" },
		});
		setIcon(toggleBtn, "eye");

		this.descTextarea = container.createEl("textarea", {
			cls: "beads-description-editor",
			attr: { placeholder: "Description (markdown supported)", rows: "14" },
		});
		this.descTextarea.value = content;

		this.descPreviewEl = container.createEl("div", { cls: "beads-md-preview" });
		this.descPreviewEl.style.display = "none";

		toggleBtn.addEventListener("click", () => {
			if (this.descMode === "edit") {
				this.descMode = "preview";
				this.descTextarea!.style.display = "none";
				this.descPreviewEl!.style.display = "";
				this.descPreviewEl!.empty();
				setIcon(toggleBtn, "code");
				toggleBtn.setAttribute("aria-label", "Edit");
				void MarkdownRenderer.render(this.app, this.descTextarea!.value, this.descPreviewEl!, "", this);
			} else {
				this.descMode = "edit";
				this.descPreviewEl!.style.display = "none";
				this.descTextarea!.style.display = "";
				setIcon(toggleBtn, "eye");
				toggleBtn.setAttribute("aria-label", "Preview");
			}
		});
	}

	private getDescription(): string {
		return this.descTextarea?.value ?? this.formData.description;
	}

	private renderTextareaSection(
		container: HTMLElement,
		label: string,
		cls: string,
		field: "notes" | "design",
		placeholder: string,
		rows: number,
	): void {
		const section = container.createEl("div", { cls });
		section.createEl("div", { cls: "beads-section-label", text: label });
		const ta = section.createEl("textarea", {
			cls: "beads-notes-editor",
			attr: { placeholder, rows: String(rows) },
		});
		ta.value = this.formData[field];
		ta.addEventListener("input", () => { this.formData[field] = ta.value; });
	}

	private renderDepGroup(
		container: HTMLElement,
		label: string,
		ids: string[],
		issueById: Map<string, BeadIssue>,
	): void {
		const group = container.createEl("div", { cls: "beads-view-dep-group" });
		group.createEl("div", { cls: "beads-view-dep-group-label", text: label });
		const rows = group.createEl("div", { cls: "beads-view-dep-rows" });
		for (const id of ids) {
			this.renderDepRow(rows, id, issueById);
		}
	}

	private renderDepRow(container: HTMLElement, id: string, issueById: Map<string, BeadIssue>): void {
		const meta = issueById.get(id);
		const status = meta?.status ?? "open";
		const row = container.createEl("button", { cls: "beads-view-dep-row" });

		const iconEl = row.createEl("span", { cls: "beads-view-dep-icon" });
		setIcon(iconEl, getStatusIcon(status));
		iconEl.addClass(`beads-status-${status}`);

		row.createEl("span", { cls: "beads-view-dep-id", text: id });

		if (meta?.title) {
			row.createEl("span", { cls: "beads-view-dep-title", text: meta.title });
		}

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

	private renderDepSelector(
		container: HTMLElement,
		issueById: Map<string, BeadIssue>,
		dependents: BeadIssue[],
	): void {
		const section = container.createEl("div", { cls: "beads-deps-section" });

		let collapsed = false;
		const header = section.createEl("div", { cls: "beads-deps-header" });
		const arrow = header.createEl("span", { cls: "beads-deps-arrow", text: "▼" });
		header.createEl("span", { cls: "beads-deps-title", text: "Dependencies" });
		const countEl = header.createEl("span", { cls: "beads-deps-count" });

		const body = section.createEl("div", { cls: "beads-deps-body" });

		const refreshCount = () => {
			const n = this.editedDeps.length;
			countEl.textContent = n > 0 ? ` (${n})` : "";
		};

		header.addEventListener("click", () => {
			collapsed = !collapsed;
			body.style.display = collapsed ? "none" : "";
			arrow.textContent = collapsed ? "▶" : "▼";
		});

		for (const [depType, depLabel] of Object.entries(DEP_TYPES)) {
			const block = body.createEl("div", { cls: "beads-dep-block" });
			const row = block.createEl("div", { cls: "beads-dep-row" });
			row.createEl("span", { cls: "beads-dep-row-label", text: depLabel.toUpperCase() + ":" });
			const pillsArea = row.createEl("div", { cls: "beads-dep-row-pills" });
			const addBtn = row.createEl("button", { cls: "beads-dep-add-btn", text: "+ Add" });

			const searchArea = block.createEl("div", { cls: "beads-dep-search-area" });
			searchArea.style.display = "none";
			const searchWrap = searchArea.createEl("div", { cls: "beads-deps-search-wrap" });
			const searchInput = searchWrap.createEl("input", {
				cls: "beads-deps-input",
				attr: { type: "text", placeholder: `Search to add ${depLabel.toLowerCase()}…` },
			});
			const dropdown = searchWrap.createEl("div", { cls: "beads-deps-dropdown" });
			dropdown.style.display = "none";

			const renderPills = () => {
				pillsArea.empty();
				for (const dep of this.editedDeps.filter((d) => d.depType === depType)) {
					const chip = pillsArea.createEl("span", { cls: "beads-dep-chip" });
					const meta = issueById.get(dep.id);
					chip.createEl("span", { text: dep.id, cls: "beads-dep-chip-id" });
					if (meta?.title) {
						chip.createEl("span", { text: meta.title, cls: "beads-dep-chip-title" });
					}
					const rm = chip.createEl("button", { cls: "beads-dep-chip-remove", text: "×" });
					rm.addEventListener("click", () => {
						this.editedDeps = this.editedDeps.filter(
							(d) => !(d.id === dep.id && d.depType === depType),
						);
						renderPills();
						refreshCount();
					});
				}
			};

			const closeSearch = () => {
				searchArea.style.display = "none";
				addBtn.style.display = "";
				dropdown.style.display = "none";
				searchInput.value = "";
			};

			const renderDropdown = () => {
				dropdown.empty();
				const q = searchInput.value.toLowerCase();
				const usedIds = this.editedDeps.map((d) => d.id);
				const results = this.issueCache
					.filter((i) => i.id !== this.issueId && !usedIds.includes(i.id) &&
						(i.id.toLowerCase().includes(q) || i.title.toLowerCase().includes(q)))
					.slice(0, 8);
				if (results.length === 0) { dropdown.style.display = "none"; return; }
				dropdown.style.display = "";
				for (const issue of results) {
					const item = dropdown.createEl("div", { cls: "beads-deps-dropdown-item" });
					item.createEl("span", { text: issue.id, cls: "beads-dep-item-id" });
					item.createEl("span", { text: issue.title, cls: "beads-dep-item-title" });
					item.addEventListener("mousedown", (e) => {
						e.preventDefault();
						this.editedDeps.push({ id: issue.id, depType });
						renderPills();
						refreshCount();
						closeSearch();
					});
				}
			};

			addBtn.addEventListener("click", () => {
				addBtn.style.display = "none";
				searchArea.style.display = "";
				searchInput.focus();
				renderDropdown();
			});

			searchInput.addEventListener("input", () => renderDropdown());
			searchInput.addEventListener("keydown", (e: KeyboardEvent) => {
				if (e.key === "Escape") closeSearch();
			});
			searchInput.addEventListener("blur", () => { setTimeout(closeSearch, 150); });

			renderPills();
		}

		// Dependents are read-only (other issues point to this one)
		if (dependents.length > 0) {
			const block = body.createEl("div", { cls: "beads-dep-block" });
			const row = block.createEl("div", { cls: "beads-dep-row" });
			row.createEl("span", { cls: "beads-dep-row-label", text: "DEPENDENTS:" });
			const pillsArea = row.createEl("div", { cls: "beads-dep-row-pills" });
			for (const dep of dependents) {
				const chip = pillsArea.createEl("button", { cls: "beads-dep-chip" });
				chip.createEl("span", { text: dep.id, cls: "beads-dep-chip-id" });
				if (dep.title) chip.createEl("span", { text: dep.title, cls: "beads-dep-chip-title" });
				chip.addEventListener("click", () => this.plugin.openIssue(dep.id, this.projectDir));
			}
		}

		refreshCount();
	}

	private handleSubmit(): void {
		const title = this.formData.title.trim();
		if (!title) {
			new Notice("Title is required");
			return;
		}

		if (this.submitBtn) this.submitBtn.disabled = true;
		this.formData.description = this.getDescription();
		this.formData.labels = this.labelsArray.join(", ");
		const args = buildUpdateArgs(this.issueId, this.formData, this.originalParent);

		this.plugin.runBd(args, this.projectDir, (error, _stdout, stderr) => {
			if (error) {
				console.error("Beads: bd update failed", error.message, stderr);
				new Notice("Failed to update bead: " + (stderr || error.message));
				if (this.submitBtn) this.submitBtn.disabled = false;
				return;
			}

			// Diff deps: find adds and removes
			const depKey = (d: DepEntry) => `${d.depType}:${d.id}`;
			const existingKeys = new Set(this.existingDeps.map(depKey));
			const editedKeys = new Set(this.editedDeps.map(depKey));

			const toAdd = this.editedDeps.filter((d) => !existingKeys.has(depKey(d)));
			const toRemove = this.existingDeps.filter((d) => !editedKeys.has(depKey(d)));

			const finish = () => {
				new Notice(`Updated: ${this.issueId}`);
				this.plugin.refreshBeadsView();
				this.plugin.openIssue(this.issueId, this.projectDir);
			};

			const allChanges = [
				...toAdd.map((d) => ({ cmd: ["dep", "add", this.issueId, d.id, "--type", d.depType] })),
				...toRemove.map((d) => ({ cmd: ["dep", "remove", this.issueId, d.id] })),
			];

			if (allChanges.length === 0) { finish(); return; }

			let remaining = allChanges.length;
			for (const { cmd } of allChanges) {
				this.plugin.runBd(cmd, this.projectDir, (depErr, _out, depStderr) => {
					if (depErr) console.error(`Beads: ${cmd.join(" ")} failed`, depErr.message, depStderr);
					if (--remaining === 0) finish();
				});
			}
		});
	}
}
