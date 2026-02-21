import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import cytoscape from "cytoscape";
import type BeadsPlugin from "./main";

export const VIEW_TYPE_BEADS_GRAPH = "beads-graph-view";

export class BeadsGraphView extends ItemView {
	private projectDir = "";
	private cy: cytoscape.Core | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: BeadsPlugin) {
		super(leaf);
	}

	getViewType(): string { return VIEW_TYPE_BEADS_GRAPH; }
	getDisplayText(): string { return "Dependency Graph"; }
	getIcon(): string { return "git-fork"; }

	async setState(state: { projectDir: string }, result: { history: boolean }): Promise<void> {
		this.projectDir = state.projectDir;
		await this.renderGraph();
		await super.setState(state, result);
	}

	getState(): Record<string, unknown> {
		return { projectDir: this.projectDir };
	}

	async onOpen(): Promise<void> {
		if (this.projectDir) await this.renderGraph();
	}

	async onClose(): Promise<void> {
		this.destroyCy();
	}

	private destroyCy(): void {
		if (this.cy) {
			this.cy.destroy();
			this.cy = null;
		}
	}

	private async renderGraph(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		Object.assign(container.style, {
			display: "flex",
			flexDirection: "column",
			height: "100%",
			padding: "0",
			overflow: "hidden",
		});

		// Toolbar
		const toolbar = container.createEl("div", { cls: "beads-graph-toolbar" });
		const refreshBtn = toolbar.createEl("button", { cls: "beads-graph-refresh-btn", attr: { title: "Refresh graph" } });
		setIcon(refreshBtn, "refresh-cw");
		refreshBtn.addEventListener("click", () => this.renderGraph());

		// Graph container
		const graphEl = container.createEl("div", { cls: "beads-graph-container" });

		// Loading state
		graphEl.createEl("div", {
			cls: "beads-loading",
			text: "Loading dependency graph…",
		});

		this.destroyCy();

		this.plugin.runBd(["list", "--json", "--limit=0", "--all"], this.projectDir, (error, stdout, stderr) => {
			graphEl.empty();

			if (error) {
				graphEl.createEl("div", {
					cls: "beads-error",
					text: "Failed to load issues: " + (stderr || error.message),
				});
				return;
			}

			let issues: any[];
			try {
				issues = JSON.parse(stdout);
			} catch {
				graphEl.createEl("div", { cls: "beads-error", text: "Failed to parse issue data." });
				return;
			}

			if (!issues || issues.length === 0) {
				graphEl.createEl("div", { cls: "beads-empty-state", text: "No issues found." });
				return;
			}

			this.initCy(graphEl, issues);
		});
	}

	private initCy(container: HTMLElement, issues: any[]): void {
		const issueIds = new Set<string>(issues.map((i: any) => i.id as string));
		const elements: cytoscape.ElementDefinition[] = [];
		const seenEdges = new Set<string>();

		// Nodes
		for (const issue of issues) {
			elements.push({
				group: "nodes",
				data: {
					id: issue.id,
					label: issue.id + "\n" + (issue.title ?? "").slice(0, 30),
					status: issue.status ?? "open",
					issue_type: issue.issue_type ?? "task",
				},
			});
		}

		// Edges — track incoming edges per node to find roots
		const hasIncoming = new Set<string>();

		for (const issue of issues) {
			const deps: any[] = issue.dependencies ?? [];
			for (const dep of deps) {
				const dependsOn: string = dep.depends_on_id;
				if (!issueIds.has(dependsOn)) continue;

				if (dep.type === "blocks" || dep.type === undefined) {
					// blocker → blocked: arrow from depends_on_id to issue.id
					const edgeId = `${dependsOn}->${issue.id}:blocks`;
					if (!seenEdges.has(edgeId)) {
						seenEdges.add(edgeId);
						elements.push({
							group: "edges",
							data: {
								id: edgeId,
								source: dependsOn,
								target: issue.id,
								edgeType: "blocks",
							},
						});
						hasIncoming.add(issue.id);
					}
				} else if (dep.type === "parent-child") {
					const edgeId = `${dependsOn}->${issue.id}:parent-child`;
					if (!seenEdges.has(edgeId)) {
						seenEdges.add(edgeId);
						elements.push({
							group: "edges",
							data: {
								id: edgeId,
								source: dependsOn,
								target: issue.id,
								edgeType: "parent-child",
							},
						});
						hasIncoming.add(issue.id);
					}
				}
			}
		}

		const roots = issues.map((i: any) => i.id as string).filter((id) => !hasIncoming.has(id));

		const cy = cytoscape({
			container,
			elements,
			style: this.buildStylesheet(),
			layout: {
				name: "breadthfirst",
				directed: true,
				roots: roots.length > 0 ? roots : undefined,
				padding: 30,
				spacingFactor: 1.4,
				animate: false,
			} as any,
			wheelSensitivity: 0.3,
			minZoom: 0.2,
			maxZoom: 4,
		});
		this.cy = cy;

		cy.on("tap", "node", (evt) => {
			const nodeId: string = evt.target.id();
			this.plugin.openIssue(nodeId, this.projectDir);
		});

		cy.on("mouseover", "node", () => {
			container.style.cursor = "pointer";
		});

		cy.on("mouseout", "node", () => {
			container.style.cursor = "";
		});
	}

	private buildStylesheet(): cytoscape.StylesheetStyle[] {
		return [
			{
				selector: "node",
				style: {
					shape: "round-rectangle",
					width: 140,
					height: 55,
					"background-color": "#4a90d9",
					color: "#ffffff",
					"font-size": 11,
					"text-wrap": "wrap",
					"text-max-width": "130px",
					label: "data(label)",
					"text-valign": "center",
					"text-halign": "center",
					"text-overflow-wrap": "whitespace",
				},
			},
			{
				selector: "node[status='open']",
				style: { "background-color": "#4a90d9" },
			},
			{
				selector: "node[status='in_progress']",
				style: { "background-color": "#e6a817" },
			},
			{
				selector: "node[status='closed']",
				style: { "background-color": "#5ba85b", opacity: 0.75 },
			},
			{
				selector: "edge[edgeType='blocks']",
				style: {
					"curve-style": "bezier",
					"line-color": "#888888",
					"target-arrow-color": "#888888",
					"target-arrow-shape": "triangle",
					width: 2,
				},
			},
			{
				selector: "edge[edgeType='parent-child']",
				style: {
					"curve-style": "bezier",
					"line-style": "dashed",
					"line-color": "#aaaaaa",
					"target-arrow-color": "#aaaaaa",
					"target-arrow-shape": "vee",
					width: 1.5,
				},
			},
		];
	}
}
