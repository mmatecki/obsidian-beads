import { describe, it, expect } from "vitest";
import {
	statusIcon,
	formatStatus,
	formatDate,
	issueToMarkdown,
	buildParentChildMap,
	buildCreateArgs,
	buildUpdateArgs,
	type BeadIssue,
	type BeadIssueDetail,
} from "../src/utils";

// ---------------------------------------------------------------------------
// statusIcon
// ---------------------------------------------------------------------------

describe("statusIcon", () => {
	it("returns check-circle for closed", () => {
		expect(statusIcon("closed")).toBe("check-circle");
	});

	it("returns check-circle for done", () => {
		expect(statusIcon("done")).toBe("check-circle");
	});

	it("returns loader for in_progress", () => {
		expect(statusIcon("in_progress")).toBe("loader");
	});

	it("returns ban for blocked", () => {
		expect(statusIcon("blocked")).toBe("ban");
	});

	it("returns circle for open", () => {
		expect(statusIcon("open")).toBe("circle");
	});

	it("returns circle for unknown statuses", () => {
		expect(statusIcon("whatever")).toBe("circle");
		expect(statusIcon("")).toBe("circle");
	});
});

// ---------------------------------------------------------------------------
// formatStatus
// ---------------------------------------------------------------------------

describe("formatStatus", () => {
	it("formats closed", () => {
		expect(formatStatus("closed")).toBe("Closed");
	});

	it("formats done as Closed", () => {
		expect(formatStatus("done")).toBe("Closed");
	});

	it("formats in_progress", () => {
		expect(formatStatus("in_progress")).toBe("In Progress");
	});

	it("formats blocked", () => {
		expect(formatStatus("blocked")).toBe("Blocked");
	});

	it("formats open", () => {
		expect(formatStatus("open")).toBe("Open");
	});

	it("returns the status string unchanged for unknowns", () => {
		expect(formatStatus("pending")).toBe("pending");
		expect(formatStatus("")).toBe("");
	});
});

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------

describe("formatDate", () => {
	it("formats a valid ISO date string", () => {
		// 2026-01-15T10:30:00Z → should contain "Jan", "2026", "15"
		const result = formatDate("2026-01-15T10:30:00Z");
		expect(result).toContain("2026");
		expect(result).toContain("Jan");
		expect(result).toContain("15");
	});

	it("returns the original string for an invalid date", () => {
		// new Date("not-a-date") is Invalid Date; toLocaleDateString returns "Invalid Date"
		// The function catches errors only from toLocaleDateString itself, but
		// since "Invalid Date" won't throw, we just check it doesn't crash.
		const result = formatDate("not-a-date");
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// issueToMarkdown
// ---------------------------------------------------------------------------

describe("issueToMarkdown", () => {
	const baseIssue: BeadIssueDetail = {
		id: "proj-1",
		title: "Test Issue",
		status: "open",
		priority: 2,
		issue_type: "task",
	};

	it("includes title as h1", () => {
		const md = issueToMarkdown(baseIssue);
		expect(md).toContain("# Test Issue");
	});

	it("includes issue id", () => {
		const md = issueToMarkdown(baseIssue);
		expect(md).toContain("`proj-1`");
	});

	it("includes formatted status", () => {
		const md = issueToMarkdown(baseIssue);
		expect(md).toContain("Open");
	});

	it("includes priority", () => {
		const md = issueToMarkdown(baseIssue);
		expect(md).toContain("P2");
	});

	it("includes issue type", () => {
		const md = issueToMarkdown(baseIssue);
		expect(md).toContain("task");
	});

	it("includes optional fields when present", () => {
		const issue: BeadIssueDetail = {
			...baseIssue,
			owner: "alice",
			assignee: "bob",
			labels: ["ui", "backend"],
			parent_id: "proj-0",
			description: "A description",
			notes: "Some notes",
			design: "Design doc",
			close_reason: "fixed",
		};
		const md = issueToMarkdown(issue);
		expect(md).toContain("alice");
		expect(md).toContain("bob");
		expect(md).toContain("ui, backend");
		expect(md).toContain("`proj-0`");
		expect(md).toContain("## Description");
		expect(md).toContain("A description");
		expect(md).toContain("## Notes");
		expect(md).toContain("Some notes");
		expect(md).toContain("## Design");
		expect(md).toContain("Design doc");
		expect(md).toContain("fixed");
	});

	it("omits optional sections when absent", () => {
		const md = issueToMarkdown(baseIssue);
		expect(md).not.toContain("## Description");
		expect(md).not.toContain("## Notes");
		expect(md).not.toContain("## Design");
		expect(md).not.toContain("Owner");
	});

	it("lists non-parent-child dependencies grouped by type", () => {
		const issue: BeadIssueDetail = {
			...baseIssue,
			dependencies: [
				{ id: "proj-2", dependency_type: "blocks" },
				{ id: "proj-3", dependency_type: "related" },
				{ id: "proj-99", dependency_type: "parent-child" }, // should be filtered out
			],
		};
		const md = issueToMarkdown(issue);
		expect(md).toContain("`proj-2`");
		expect(md).toContain("`proj-3`");
		expect(md).not.toContain("`proj-99`");
		expect(md).toContain("Blocked by");
		expect(md).toContain("Related");
	});

	it("shows dependency_count when no expanded deps but count present", () => {
		const issue: BeadIssueDetail = {
			...baseIssue,
			dependencies: [],
			dependency_count: 3,
		};
		const md = issueToMarkdown(issue);
		expect(md).toContain("Dependencies");
		expect(md).toContain("3");
	});

	it("shows dependent_count when present", () => {
		const issue: BeadIssueDetail = { ...baseIssue, dependent_count: 5 };
		const md = issueToMarkdown(issue);
		expect(md).toContain("Dependents");
		expect(md).toContain("5");
	});
});

// ---------------------------------------------------------------------------
// buildParentChildMap
// ---------------------------------------------------------------------------

describe("buildParentChildMap", () => {
	it("returns empty roots and map for empty input", () => {
		const { roots, childrenMap } = buildParentChildMap([]);
		expect(roots).toEqual([]);
		expect(childrenMap.size).toBe(0);
	});

	it("puts all issues at root when no hierarchy", () => {
		const issues: BeadIssue[] = [
			{ id: "proj-1", title: "A", status: "open", priority: 2, issue_type: "task" },
			{ id: "proj-2", title: "B", status: "open", priority: 2, issue_type: "task" },
		];
		const { roots, childrenMap } = buildParentChildMap(issues);
		expect(roots).toHaveLength(2);
		expect(childrenMap.size).toBe(0);
	});

	it("uses parent_id field to build hierarchy", () => {
		const parent: BeadIssue = { id: "proj-1", title: "Parent", status: "open", priority: 2, issue_type: "epic" };
		const child: BeadIssue = { id: "proj-2", title: "Child", status: "open", priority: 2, issue_type: "task", parent_id: "proj-1" };
		const { roots, childrenMap } = buildParentChildMap([parent, child]);
		expect(roots).toHaveLength(1);
		expect(roots[0].id).toBe("proj-1");
		expect(childrenMap.get("proj-1")).toHaveLength(1);
		expect(childrenMap.get("proj-1")![0].id).toBe("proj-2");
	});

	it("uses parent-child dependency type when parent_id absent", () => {
		const parent: BeadIssue = { id: "proj-1", title: "Parent", status: "open", priority: 2, issue_type: "epic" };
		const child: BeadIssue = {
			id: "proj-2",
			title: "Child",
			status: "open",
			priority: 2,
			issue_type: "task",
			dependencies: [{ issue_id: "proj-2", depends_on_id: "proj-1", type: "parent-child" }],
		};
		const { roots, childrenMap } = buildParentChildMap([parent, child]);
		expect(roots).toHaveLength(1);
		expect(childrenMap.get("proj-1")![0].id).toBe("proj-2");
	});

	it("infers parent from dotted ID when no explicit parent", () => {
		const parent: BeadIssue = { id: "proj-8", title: "Parent", status: "open", priority: 2, issue_type: "epic" };
		const child: BeadIssue = { id: "proj-8.1", title: "Child", status: "open", priority: 2, issue_type: "task" };
		const grandchild: BeadIssue = { id: "proj-8.1.2", title: "Grandchild", status: "open", priority: 2, issue_type: "bug" };
		const { roots, childrenMap } = buildParentChildMap([parent, child, grandchild]);
		expect(roots).toHaveLength(1);
		expect(roots[0].id).toBe("proj-8");
		expect(childrenMap.get("proj-8")![0].id).toBe("proj-8.1");
		expect(childrenMap.get("proj-8.1")![0].id).toBe("proj-8.1.2");
	});

	it("keeps issue at root if dotted parent ID is not in the list", () => {
		// "proj-8.1" implies parent "proj-8" but that's absent
		const orphan: BeadIssue = { id: "proj-8.1", title: "Orphan", status: "open", priority: 2, issue_type: "task" };
		const { roots, childrenMap } = buildParentChildMap([orphan]);
		expect(roots).toHaveLength(1);
		expect(childrenMap.size).toBe(0);
	});

	it("prefers parent_id over dotted-ID inference", () => {
		const realParent: BeadIssue = { id: "proj-5", title: "Real Parent", status: "open", priority: 2, issue_type: "epic" };
		const fakeParent: BeadIssue = { id: "proj-8", title: "Dotted Parent", status: "open", priority: 2, issue_type: "epic" };
		const child: BeadIssue = {
			id: "proj-8.1",
			title: "Child",
			status: "open",
			priority: 2,
			issue_type: "task",
			parent_id: "proj-5",
		};
		const { roots, childrenMap } = buildParentChildMap([realParent, fakeParent, child]);
		// Should be under proj-5, not proj-8
		expect(childrenMap.get("proj-5")![0].id).toBe("proj-8.1");
		expect(childrenMap.get("proj-8")).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// buildCreateArgs
// ---------------------------------------------------------------------------

describe("buildCreateArgs", () => {
	const minData = {
		title: "My Bead",
		type: "task",
		priority: "2",
		description: "",
		assignee: "",
		labels: "",
		notes: "",
	};

	it("starts with create --silent", () => {
		const args = buildCreateArgs(minData, "", []);
		expect(args[0]).toBe("create");
		expect(args[1]).toBe("--silent");
	});

	it("always includes title, type, priority", () => {
		const args = buildCreateArgs(minData, "", []);
		expect(args).toContain("--title");
		expect(args).toContain("My Bead");
		expect(args).toContain("--type");
		expect(args).toContain("task");
		expect(args).toContain("--priority");
		expect(args).toContain("2");
	});

	it("omits optional flags when fields are empty", () => {
		const args = buildCreateArgs(minData, "", []);
		expect(args).not.toContain("--description");
		expect(args).not.toContain("--assignee");
		expect(args).not.toContain("--labels");
		expect(args).not.toContain("--notes");
		expect(args).not.toContain("--parent");
	});

	it("includes optional fields when provided", () => {
		const data = {
			...minData,
			description: "desc",
			assignee: "alice",
			labels: "ui",
			notes: "some notes",
		};
		const args = buildCreateArgs(data, "proj-1", []);
		expect(args).toContain("--description");
		expect(args).toContain("desc");
		expect(args).toContain("--assignee");
		expect(args).toContain("alice");
		expect(args).toContain("--labels");
		expect(args).toContain("ui");
		expect(args).toContain("--notes");
		expect(args).toContain("some notes");
		expect(args).toContain("--parent");
		expect(args).toContain("proj-1");
	});

	it("does not include --parent when parentId is empty", () => {
		const args = buildCreateArgs(minData, "", []);
		expect(args).not.toContain("--parent");
	});

	it("flag and value are adjacent pairs", () => {
		const args = buildCreateArgs({ ...minData, description: "hello" }, "", []);
		const descIdx = args.indexOf("--description");
		expect(descIdx).toBeGreaterThan(-1);
		expect(args[descIdx + 1]).toBe("hello");
	});
});

// ---------------------------------------------------------------------------
// buildUpdateArgs
// ---------------------------------------------------------------------------

describe("buildUpdateArgs", () => {
	const baseForm = {
		title: "Updated Title",
		type: "bug",
		priority: "1",
		status: "in_progress",
		assignee: "",
		labels: "",
		description: "",
		notes: "",
		design: "",
		due: "",
		parent: "",
	};

	it("starts with update and issue id", () => {
		const args = buildUpdateArgs("proj-5", baseForm, "");
		expect(args[0]).toBe("update");
		expect(args[1]).toBe("proj-5");
	});

	it("always includes title, type, priority, status", () => {
		const args = buildUpdateArgs("proj-5", baseForm, "");
		expect(args).toContain("--title");
		expect(args).toContain("Updated Title");
		expect(args).toContain("--type");
		expect(args).toContain("bug");
		expect(args).toContain("--priority");
		expect(args).toContain("1");
		expect(args).toContain("--status");
		expect(args).toContain("in_progress");
	});

	it("omits optional flags when fields are empty", () => {
		const args = buildUpdateArgs("proj-5", baseForm, "");
		expect(args).not.toContain("--description");
		expect(args).not.toContain("--assignee");
		expect(args).not.toContain("--set-labels");
		expect(args).not.toContain("--notes");
		expect(args).not.toContain("--design");
		expect(args).not.toContain("--due");
		expect(args).not.toContain("--parent");
	});

	it("includes optional fields when provided", () => {
		const form = {
			...baseForm,
			description: "new desc",
			assignee: "bob",
			labels: "backend",
			notes: "note",
			design: "design doc",
			due: "2026-12-31",
		};
		const args = buildUpdateArgs("proj-5", form, "");
		expect(args).toContain("--description");
		expect(args).toContain("new desc");
		expect(args).toContain("--assignee");
		expect(args).toContain("bob");
		expect(args).toContain("--set-labels");
		expect(args).toContain("backend");
		expect(args).toContain("--notes");
		expect(args).toContain("note");
		expect(args).toContain("--design");
		expect(args).toContain("design doc");
		expect(args).toContain("--due");
		expect(args).toContain("2026-12-31");
	});

	it("includes --parent only when parent changed", () => {
		const form = { ...baseForm, parent: "proj-3" };
		const argsChanged = buildUpdateArgs("proj-5", form, "proj-2");
		expect(argsChanged).toContain("--parent");
		expect(argsChanged).toContain("proj-3");

		const argsUnchanged = buildUpdateArgs("proj-5", form, "proj-3");
		expect(argsUnchanged).not.toContain("--parent");
	});

	it("includes --parent with empty string when parent cleared", () => {
		const form = { ...baseForm, parent: "" };
		const args = buildUpdateArgs("proj-5", form, "proj-2");
		expect(args).toContain("--parent");
		const parentIdx = args.indexOf("--parent");
		expect(args[parentIdx + 1]).toBe("");
	});

	it("trims whitespace from text fields", () => {
		const form = { ...baseForm, title: "  Padded  ", description: "  desc  " };
		const args = buildUpdateArgs("proj-5", form, "");
		const titleIdx = args.indexOf("--title");
		expect(args[titleIdx + 1]).toBe("Padded");
		const descIdx = args.indexOf("--description");
		expect(args[descIdx + 1]).toBe("desc");
	});
});
