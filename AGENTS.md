# AGENTS.md

# Agent Instructions

This repository uses **bd (Beads)** with a **Dolt server backend** for issue tracking and work planning.

All development work **must originate from a bead**.  
Do not implement features, fixes, or refactors without an associated bead.

Beads are the **single source of truth** for tasks, dependencies, and work status.

Initialize your environment if needed:

```bash
bd onboard
```

---

# Core Principles

1. **Beads define the work** — never start work without a bead.
2. **One bead = one branch = one pull request.**
3. **Always claim work before starting.**
4. **Keep the repository buildable at all times.**
5. **Push changes before ending a session.**

---

# Quick Reference

```bash
bd ready              # Find work ready to start
bd show <id>          # View bead details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
bd sync               # Sync bead state
```

For programmatic use:

```bash
bd ready --json
```

---

# Branch Naming (REQUIRED)

Branches **must include the bead ID**.

Format:

```
<type>/<bead-id>-<short-description>
```

Examples:

```
feature/bd-42-command-palette
fix/bd-77-settings-crash
chore/bd-91-update-build
docs/bd-101-readme-improvements
```

Branch types:

| Type | Usage |
|-----|------|
| feature | new functionality |
| fix | bug fix |
| refactor | internal restructuring |
| chore | tooling / dependencies |
| docs | documentation |

Create a branch:

```bash
git checkout -b feature/bd-42-command-palette
```

---

# Commit Message Format

Commits must reference the bead.

Format:

```
type(bead-id): short description
```

Examples:

```
feat(bd-42): implement command palette
fix(bd-77): prevent crash during settings load
refactor(bd-91): simplify settings storage
```

---

# Pull Request Rules

PR title format:

```
[bd-42] Add command palette
```

PR description should include:

- bead ID
- summary of changes
- testing performed
- screenshots for UI changes (if applicable)

---

# Development Workflow for Agents

Follow this process **for every task**.

---

## 1. Find Work

Check available tasks:

```bash
bd ready
```

Select a bead that is:

- unclaimed
- not blocked

---

## 2. Claim the Bead

```bash
bd update <id> --claim
```

Example:

```bash
bd update bd-42 --claim
```

---

## 3. Create a Branch

Branch must reference the bead.

```bash
git checkout -b feature/bd-42-command-palette
```

---

## 4. Implement the Work

During development:

- keep commits small
- run builds and tests frequently
- update documentation if needed

Do **not implement unrelated functionality**.

If additional work is discovered:

```bash
bd create "Handle edge case in parser" \
  --description="Found during bd-42 implementation" \
  -p 1 \
  --deps discovered-from:bd-42
```

---

## 5. Run Quality Checks

If code changed:

```bash
npm install
npm run build
npm test
```

Fix all failures before committing.

---

## 6. Complete the Bead

After finishing work:

```bash
bd close <id> --reason "Completed"
```

Example:

```bash
bd close bd-42 --reason "Implemented command palette"
```

---

# Git Workflow

Before pushing:

```bash
git pull --rebase
bd sync
git push
```

Verify repository state:

```bash
git status
```

Expected output:

```
Your branch is up to date with 'origin/...'
```

---

# Landing the Plane (Session Completion)

Before ending a work session, **all steps below must be completed**.

---

## 1. Capture Remaining Work

Create beads for unfinished tasks or improvements:

```bash
bd create "Improve keyboard navigation" \
  --description="Follow-up from bd-42"
```

---

## 2. Run Quality Gates

If code changed:

```bash
npm run build
npm test
```

---

## 3. Update Bead Status

Close completed work:

```bash
bd close <id>
```

Or update priorities if needed:

```bash
bd update <id> --priority 1
```

---

## 4. Sync Beads

```bash
bd sync
```

---

## 5. Push Changes (MANDATORY)

```bash
git pull --rebase
git push
```

Never end a session with unpushed commits.

---

## 6. Verify Clean State

```bash
git status
```

Expected:

```
nothing to commit
branch up to date
```

---

# Non-Interactive Shell Commands

Always use **non-interactive flags** to prevent commands from waiting for user input.

Correct usage:

```bash
cp -f source dest
mv -f source dest
rm -f file
rm -rf directory
cp -rf source dest
```

Avoid commands that prompt for confirmation.

---

### SSH / SCP

```bash
ssh -o BatchMode=yes
scp -o BatchMode=yes
```

---

### Package Managers

```bash
apt-get -y
HOMEBREW_NO_AUTO_UPDATE=1 brew install
```

---

# Issue Tracking Rules

This project uses **bd (Beads)** exclusively.

Do **not** use:

- Markdown TODO lists
- GitHub issues
- External task trackers

All work must be tracked in Beads.

---

# Issue Types

| Type | Description |
|-----|-------------|
| bug | Something broken |
| feature | New functionality |
| task | Development work item |
| epic | Large feature containing subtasks |
| chore | Maintenance work |

---

# Priorities

| Priority | Meaning |
|--------|--------|
| 0 | Critical (security, data loss, broken builds) |
| 1 | High |
| 2 | Medium |
| 3 | Low |
| 4 | Backlog |

---

# Release Workflow

Releases are created from the **main branch**.

Versioning follows **Semantic Versioning**:

```
MAJOR.MINOR.PATCH
```

Examples:

```
v1.0.0
v1.1.0
v1.1.1
```

Release steps:

1. Merge completed PRs into `main`
2. Update version files
3. Create release tag

```bash
git tag v1.2.0
git push origin v1.2.0
```

---

# Safety Rules for Agents

Agents MUST:

- always work from a bead
- claim beads before starting work
- keep commits small and focused
- run builds/tests after code changes
- push changes before ending a session

Agents MUST NOT:

- implement work without a bead
- create TODO lists
- use other task tracking systems
- introduce breaking changes without a bead
- leave unpushed commits

---

# If Unsure What to Work On

Run:

```bash
bd ready
```

Start the **highest-priority unblocked bead**.

