// Pure utility functions extracted for testability

export interface BeadDependency {
	issue_id: string;
	depends_on_id: string;
	type: string;
}

export interface BeadIssue {
	id: string;
	title: string;
	status: string;
	priority: number;
	issue_type: string;
	parent_id?: string;
	dependencies?: BeadDependency[];
}

export interface BeadDepRef {
	id: string;
	title?: string;
	dependency_type: string;
}

export interface BeadIssueDetail {
	id: string;
	title: string;
	description?: string;
	notes?: string;
	design?: string;
	status: string;
	priority: number;
	issue_type: string;
	owner?: string;
	assignee?: string;
	created_at?: string;
	created_by?: string;
	updated_at?: string;
	closed_at?: string;
	close_reason?: string;
	labels?: string[];
	due_at?: string;
	parent_id?: string;
	dependencies?: BeadDepRef[];
	dependency_count?: number;
	dependent_count?: number;
	comment_count?: number;
	external_ref?: string;
}

export interface DepEntry {
	id: string;
	depType: string;
}

export interface CreateIssueData {
	title: string;
	type: string;
	priority: string;
	description: string;
	assignee: string;
	labels: string;
	notes: string;
	externalRef: string;
}

export interface EditFormData {
	title: string;
	type: string;
	priority: string;
	status: string;
	assignee: string;
	labels: string;
	description: string;
	notes: string;
	design: string;
	due: string;
	parent: string;
	externalRef: string;
}

export function statusIcon(status: string): string {
	switch (status) {
		case "closed":
		case "done":
			return "check-circle";
		case "in_progress":
			return "loader";
		case "blocked":
			return "ban";
		default:
			return "circle";
	}
}

export function formatStatus(status: string): string {
	switch (status) {
		case "closed":
		case "done":
			return "Closed";
		case "in_progress":
			return "In Progress";
		case "blocked":
			return "Blocked";
		case "deferred":
			return "Deferred";
		case "open":
			return "Open";
		default:
			return status;
	}
}

export function formatDate(iso: string): string {
	try {
		const d = new Date(iso);
		return d.toLocaleDateString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	} catch {
		return iso;
	}
}

export function issueToMarkdown(issue: BeadIssueDetail): string {
	const lines: string[] = [];

	lines.push(`# ${issue.title}`);
	lines.push("");
	lines.push(`| | |`);
	lines.push(`|---|---|`);
	lines.push(`| **ID** | \`${issue.id}\` |`);
	lines.push(`| **Status** | ${formatStatus(issue.status)} |`);
	lines.push(`| **Priority** | P${issue.priority} |`);
	lines.push(`| **Type** | ${issue.issue_type} |`);

	if (issue.owner) {
		lines.push(`| **Owner** | ${issue.owner} |`);
	}
	if (issue.assignee) {
		lines.push(`| **Assignee** | ${issue.assignee} |`);
	}
	if (issue.labels && issue.labels.length > 0) {
		lines.push(`| **Labels** | ${issue.labels.join(", ")} |`);
	}
	if (issue.parent_id) {
		lines.push(`| **Parent** | \`${issue.parent_id}\` |`);
	}
	if (issue.due_at) {
		lines.push(`| **Due** | ${formatDate(issue.due_at)} |`);
	}
	if (issue.created_at) {
		lines.push(`| **Created** | ${formatDate(issue.created_at)} |`);
	}
	if (issue.created_by) {
		lines.push(`| **Created by** | ${issue.created_by} |`);
	}
	if (issue.updated_at) {
		lines.push(`| **Updated** | ${formatDate(issue.updated_at)} |`);
	}
	if (issue.closed_at) {
		lines.push(`| **Closed** | ${formatDate(issue.closed_at)} |`);
	}
	if (issue.close_reason) {
		lines.push(`| **Close reason** | ${issue.close_reason} |`);
	}
	const deps = (issue.dependencies || []).filter((d) => d.dependency_type !== "parent-child");
	if (deps.length > 0) {
		const DEP_LABELS: Record<string, string> = {
			blocks: "Blocked by",
			related: "Related",
			"discovered-from": "Discovered from",
			tracks: "Tracks",
		};
		const byType = new Map<string, string[]>();
		for (const d of deps) {
			const list = byType.get(d.dependency_type) || [];
			list.push(`\`${d.id}\``);
			byType.set(d.dependency_type, list);
		}
		for (const [type, ids] of byType) {
			lines.push(`| **${DEP_LABELS[type] ?? type}** | ${ids.join(", ")} |`);
		}
	} else if (issue.dependency_count) {
		lines.push(`| **Dependencies** | ${issue.dependency_count} |`);
	}
	if (issue.dependent_count) {
		lines.push(`| **Dependents** | ${issue.dependent_count} |`);
	}
	if (issue.comment_count) {
		lines.push(`| **Comments** | ${issue.comment_count} |`);
	}

	if (issue.description) {
		lines.push("");
		lines.push("## Description");
		lines.push("");
		lines.push(issue.description);
	}

	if (issue.notes) {
		lines.push("");
		lines.push("## Notes");
		lines.push("");
		lines.push(issue.notes);
	}

	if (issue.design) {
		lines.push("");
		lines.push("## Design");
		lines.push("");
		lines.push(issue.design);
	}

	return lines.join("\n");
}

export function buildParentChildMap(issues: BeadIssue[]): {
	roots: BeadIssue[];
	childrenMap: Map<string, BeadIssue[]>;
} {
	const childrenMap = new Map<string, BeadIssue[]>();
	const roots: BeadIssue[] = [];
	const issueIds = new Set(issues.map((i) => i.id));

	for (const issue of issues) {
		let parentId = issue.parent_id;
		if (!parentId && issue.dependencies) {
			const dep = issue.dependencies.find((d) => d.type === "parent-child");
			if (dep) parentId = dep.depends_on_id;
		}
		if (!parentId) {
			const dotIdx = issue.id.lastIndexOf(".");
			if (dotIdx !== -1) {
				parentId = issue.id.substring(0, dotIdx);
			}
		}
		if (parentId && issueIds.has(parentId)) {
			const siblings = childrenMap.get(parentId) || [];
			siblings.push(issue);
			childrenMap.set(parentId, siblings);
		} else {
			roots.push(issue);
		}
	}

	return { roots, childrenMap };
}

export function buildCreateArgs(
	data: CreateIssueData,
	parentId: string,
	deps: DepEntry[],
): string[] {
	const args: string[] = ["create", "--silent"];

	args.push("--title", data.title);
	args.push("--type", data.type);
	args.push("--priority", data.priority);

	if (data.description) {
		args.push("--description", data.description);
	}
	if (data.assignee) {
		args.push("--assignee", data.assignee);
	}
	if (data.labels) {
		args.push("--labels", data.labels);
	}
	if (data.notes) {
		args.push("--notes", data.notes);
	}
	if (data.externalRef) {
		args.push("--external-ref", data.externalRef);
	}
	if (parentId) {
		args.push("--parent", parentId);
	}

	return args;
}

export function buildUpdateArgs(
	issueId: string,
	formData: EditFormData,
	originalParent: string,
): string[] {
	const args: string[] = ["update", issueId];

	args.push("--title", formData.title.trim());
	args.push("--type", formData.type);
	args.push("--priority", formData.priority);
	args.push("--status", formData.status);

	const description = formData.description.trim();
	if (description) {
		args.push("--description", description);
	}

	const assignee = formData.assignee.trim();
	if (assignee) {
		args.push("--assignee", assignee);
	}

	const labels = formData.labels.trim();
	if (labels) {
		args.push("--set-labels", labels);
	}

	const notes = formData.notes.trim();
	if (notes) {
		args.push("--notes", notes);
	}

	const design = formData.design.trim();
	if (design) {
		args.push("--design", design);
	}

	const due = formData.due.trim();
	if (due) {
		args.push("--due", due);
	}

	if (formData.parent !== originalParent) {
		args.push("--parent", formData.parent);
	}

	const externalRef = formData.externalRef.trim();
	if (externalRef) {
		args.push("--external-ref", externalRef);
	}

	return args;
}
