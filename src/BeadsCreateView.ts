import { ItemView, MarkdownRenderer, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import type BeadsPlugin from "./main";
import { buildCreateArgs, type DepEntry } from "./utils";

export const VIEW_TYPE_BEADS_CREATE = "beads-create-view";

const PRIORITIES: Record<string, string> = {
	"0": "P0 — Critical",
	"1": "P1 — High",
	"2": "P2 — Medium",
	"3": "P3 — Low",
	"4": "P4 — Backlog",
};

const DEP_TYPES: Record<string, string> = {
	blocks: "Blocks",
	related: "Related",
	"discovered-from": "Discovered from",
	tracks: "Tracks",
};

interface IssueStub {
	id: string;
	title: string;
}

export class BeadsCreateView extends ItemView {
	plugin: BeadsPlugin;
	private projectDir = "";
	private parentId = "";
	private selectedDeps: DepEntry[] = [];
	private issueCache: IssueStub[] = [];
	private cacheLoaded = false;
	private descTextarea: HTMLTextAreaElement | null = null;
	private descPreviewEl: HTMLElement | null = null;
	private descMode: "edit" | "preview" = "edit";
	private labelsArray: string[] = [];
	private submitBtn: HTMLButtonElement | null = null;
	private formData = {
		title: "",
		type: "task",
		priority: "2",
		assignee: "",
		labels: "",
		description: "",
		notes: "",
		externalRef: "",
	};

	constructor(leaf: WorkspaceLeaf, plugin: BeadsPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string { return VIEW_TYPE_BEADS_CREATE; }
	getDisplayText(): string { return "New Bead"; }
	getIcon(): string { return "plus-circle"; }

	async setState(state: { projectDir: string; parentId?: string }, result: { history: boolean }): Promise<void> {
		this.projectDir = state.projectDir;
		this.parentId = state.parentId || "";
		this.selectedDeps = [];
		this.issueCache = [];
		this.cacheLoaded = false;
		this.labelsArray = [];
		const defaultType = this.plugin.settings.defaultIssueType &&
			this.plugin.settings.issueTypes.includes(this.plugin.settings.defaultIssueType)
			? this.plugin.settings.defaultIssueType
			: (this.plugin.settings.issueTypes[0] ?? "task");
		this.formData = {
			title: "",
			type: defaultType,
			priority: this.plugin.settings.defaultPriority ?? "2",
			assignee: this.plugin.settings.defaultAssignee ?? "",
			labels: "",
			description: "",
			notes: "",
			externalRef: "",
		};
		this.descMode = "edit";
		this.renderForm();
		await super.setState(state, result);
	}

	getState(): Record<string, unknown> { return { projectDir: this.projectDir, parentId: this.parentId }; }
	async onOpen(): Promise<void> { /* rendered via setState */ }
	async onClose(): Promise<void> { this.descTextarea = null; this.descPreviewEl = null; }

	private renderForm(): void {
		const outer = this.containerEl.children[1] as HTMLElement;
		outer.empty();
		outer.removeClass("beads-view-screen");
		const container = outer.createEl("div", { cls: "beads-view-screen" });

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
			attr: { type: "text", placeholder: this.parentId ? `Child of ${this.parentId}...` : "New bead title..." },
		});
		titleInput.addEventListener("input", () => { this.formData.title = titleInput.value; });

		if (this.parentId) {
			titleBlock.createEl("div", { cls: "beads-view-issue-id", text: `Child of ${this.parentId}` });
		} else {
			titleBlock.createEl("div", { cls: "beads-view-issue-id", text: "New Bead" });
		}

		// Actions: Cancel + Create
		const headerActions = titleRow.createEl("div", { cls: "beads-view-header-actions" });
		const cancelBtn = headerActions.createEl("button", { cls: "beads-view-edit-btn", text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.leaf.detach());
		const createBtn = headerActions.createEl("button", { cls: "beads-view-edit-btn mod-cta", text: "Create Bead" });
		this.submitBtn = createBtn;
		createBtn.addEventListener("click", () => this.handleSubmit());

		// ── METADATA CARD ──────────────────────────────────────────────────
		const metaCard = container.createEl("div", { cls: "beads-view-meta-card" });

		// Type
		this.renderEditMetaField(metaCard, "Type", (val) => {
			const sel = val.createEl("select", { cls: "beads-meta-card-select" });
			for (const type of this.plugin.settings.issueTypes) {
				sel.createEl("option", { value: type, text: type.charAt(0).toUpperCase() + type.slice(1) });
			}
			sel.value = this.formData.type;
			sel.addEventListener("change", () => { this.formData.type = sel.value; });
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

		// External ref
		this.renderEditMetaField(metaCard, "Ext. Ref", (val) => {
			const inp = val.createEl("input", {
				cls: "beads-meta-card-input",
				attr: { type: "text", placeholder: "e.g. gh-123 or jira-PROJ-456" },
			});
			inp.value = this.formData.externalRef;
			inp.addEventListener("input", () => { this.formData.externalRef = inp.value; });
		});

		// Labels (full width)
		this.renderEditMetaField(metaCard, "Labels", (val) => {
			this.mountLabelsPills(val);
		}, true);

		// Parent picker (full width if parent set or searching)
		this.renderEditMetaField(metaCard, "Parent", (val) => {
			this.mountParentPicker(val);
		}, true);

		// ── DESCRIPTION ───────────────────────────────────────────────────
		const descSection = container.createEl("div", { cls: "beads-edit-description-section" });
		this.mountDescEditor(descSection, this.formData.description);

		// ── NOTES ─────────────────────────────────────────────────────────
		this.renderTextareaSection(container, "Notes (optional)", "beads-edit-textarea-section", "notes", "Additional notes", 5);

		// ── DEPENDENCIES ──────────────────────────────────────────────────
		this.renderDepSelector(container);
	}

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

	private mountLabelsPills(container: HTMLElement): void {
		const renderLabels = () => {
			container.empty();
			// Active label chips (removable)
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

	private mountParentPicker(container: HTMLElement): void {
		const loadCache = (cb: () => void) => {
			if (this.cacheLoaded) { cb(); return; }
			this.plugin.runBd(["list", "--json", "--limit=0"], this.projectDir, (_err, stdout) => {
				try { this.issueCache = JSON.parse(stdout); } catch { /* ignore */ }
				this.cacheLoaded = true;
				cb();
			});
		};

		let renderParent: () => void;

		const buildSearch = (searchArea: HTMLElement) => {
			const searchWrap = searchArea.createEl("div", { cls: "beads-deps-search-wrap" });
			const input = searchWrap.createEl("input", {
				cls: "beads-deps-input",
				attr: { type: "text", placeholder: "Search for parent…" },
			});
			const dropdown = searchWrap.createEl("div", { cls: "beads-deps-dropdown" });
			dropdown.style.display = "none";

			const renderDropdown = () => {
				dropdown.empty();
				const q = input.value.toLowerCase();
				const results = this.issueCache
					.filter((i) => i.id !== this.parentId &&
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
						this.parentId = issue.id;
						input.value = "";
						dropdown.style.display = "none";
						renderParent();
					});
				}
			};

			input.addEventListener("focus", () => loadCache(renderDropdown));
			input.addEventListener("input", () => loadCache(renderDropdown));
			input.addEventListener("blur", () => { setTimeout(() => { dropdown.style.display = "none"; }, 150); });
		};

		renderParent = () => {
			container.empty();
			if (this.parentId) {
				const chip = container.createEl("span", { cls: "beads-dep-chip beads-dep-chip--sm" });
				chip.createEl("span", { text: this.parentId, cls: "beads-dep-chip-id" });
				const rm = chip.createEl("button", { cls: "beads-dep-chip-remove", text: "×" });
				rm.addEventListener("click", () => { this.parentId = ""; renderParent(); });

				const changeLink = container.createEl("button", {
					cls: "beads-change-parent-link",
					text: "Change…",
				});
				const searchArea = container.createEl("div", { cls: "beads-parent-search-area" });
				searchArea.style.display = "none";
				buildSearch(searchArea);

				changeLink.addEventListener("click", () => {
					const visible = searchArea.style.display !== "none";
					searchArea.style.display = visible ? "none" : "";
					if (!visible) {
						(searchArea.querySelector("input") as HTMLInputElement | null)?.focus();
						loadCache(() => {});
					}
				});
			} else {
				const searchArea = container.createEl("div", { cls: "beads-parent-search-area" });
				buildSearch(searchArea);
			}
		};

		renderParent();
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
		field: "notes",
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

	private renderDepSelector(container: HTMLElement): void {
		const section = container.createEl("div", { cls: "beads-deps-section" });

		let collapsed = false;
		const header = section.createEl("div", { cls: "beads-deps-header" });
		const arrow = header.createEl("span", { cls: "beads-deps-arrow", text: "▼" });
		header.createEl("span", { cls: "beads-deps-title", text: "Dependencies" });
		const countEl = header.createEl("span", { cls: "beads-deps-count" });

		const body = section.createEl("div", { cls: "beads-deps-body" });

		const refreshCount = () => {
			const n = this.selectedDeps.length;
			countEl.textContent = n > 0 ? ` (${n})` : "";
		};

		header.addEventListener("click", () => {
			collapsed = !collapsed;
			body.style.display = collapsed ? "none" : "";
			arrow.textContent = collapsed ? "▶" : "▼";
		});

		const loadCache = (cb: () => void) => {
			if (this.cacheLoaded) { cb(); return; }
			this.plugin.runBd(["list", "--json", "--limit=0"], this.projectDir, (_err, stdout) => {
				try { this.issueCache = JSON.parse(stdout); } catch { /* ignore */ }
				this.cacheLoaded = true;
				cb();
			});
		};

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
				for (const dep of this.selectedDeps.filter((d) => d.depType === depType)) {
					const chip = pillsArea.createEl("span", { cls: "beads-dep-chip" });
					chip.createEl("span", { text: dep.id, cls: "beads-dep-chip-id" });
					const rm = chip.createEl("button", { cls: "beads-dep-chip-remove", text: "×" });
					rm.addEventListener("click", () => {
						this.selectedDeps = this.selectedDeps.filter(
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
				const usedIds = this.selectedDeps.map((d) => d.id);
				const results = this.issueCache
					.filter((i) => !usedIds.includes(i.id) &&
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
						this.selectedDeps.push({ id: issue.id, depType });
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
				loadCache(renderDropdown);
			});

			searchInput.addEventListener("input", () => loadCache(renderDropdown));
			searchInput.addEventListener("keydown", (e: KeyboardEvent) => {
				if (e.key === "Escape") closeSearch();
			});
			searchInput.addEventListener("blur", () => {
				setTimeout(closeSearch, 150);
			});

			renderPills();
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
		this.createIssue({
			...this.formData,
			title,
			description: this.getDescription().trim(),
			assignee: this.formData.assignee.trim(),
			labels: this.labelsArray.join(", "),
			notes: this.formData.notes.trim(),
		});
	}

	private createIssue(data: {
		title: string;
		type: string;
		priority: string;
		description: string;
		assignee: string;
		labels: string;
		notes: string;
		externalRef: string;
	}): void {
		const args = buildCreateArgs(data, this.parentId, this.selectedDeps);

		this.plugin.runBd(args, this.projectDir, (error, stdout, stderr) => {
			if (error) {
				console.error("Beads: bd create failed", error.message, stderr);
				new Notice("Failed to create bead: " + (stderr || error.message));
				if (this.submitBtn) this.submitBtn.disabled = false;
				return;
			}

			const issueId = stdout.trim();
			const deps = [...this.selectedDeps];

			const finish = () => {
				new Notice(`Created: ${issueId}`);
				this.plugin.refreshBeadsView();
				if (issueId) this.plugin.openIssue(issueId, this.projectDir);
			};

			if (!issueId || deps.length === 0) { finish(); return; }

			let remaining = deps.length;
			for (const dep of deps) {
				this.plugin.runBd(
					["dep", "add", issueId, dep.id, "--type", dep.depType],
					this.projectDir,
					(depErr, _out, depStderr) => {
						if (depErr) console.error(`Beads: bd dep add failed for ${dep.id}`, depErr.message, depStderr);
						if (--remaining === 0) finish();
					},
				);
			}
		});
	}
}
