---
id: implementation-report-task-clean-kit-installation
title: Clean Kit Installation Implementation Report
type: report
domain: installation
module: installer
tags: [implementation, installation, clean-overlay]
priority: 2
---
# Clean Kit Installation Implementation Report

## Record Metadata

- **Report ID**: `TASK-clean-kit-installation`
- **Title**: `Clean Kit Installation`
- **Owner**: `coding-agent`
- **Executor**: `codex`
- **Status**: `complete`
- **Task ID**: `TASK-clean-kit-installation`
- **Epic ID**: `none`
- **Report Date**: `2026-06-23`

## Files Changed

| File or Artifact | Change Summary | Task ID |
|---|---|---|
| `scripts/install-kit.ps1` | Replaced whole `.agent/` copy with `.agent/templates/` copy plus clean runtime initialization and explicit `-Force` or `-ResetRuntime` overwrite control. | `TASK-clean-kit-installation` |
| `scripts/install-kit.sh` | Replaced whole `.agent/` copy with `.agent/templates/` copy plus clean runtime initialization and explicit `--force` or `--reset-runtime` overwrite control. | `TASK-clean-kit-installation` |
| `scripts/validate-framework.py` | Added installer contract validation for forbidden whole `.agent/` copy and forbidden reports/governance Markdown copy. | `TASK-clean-kit-installation` |
| `docs/00-project/installation.md` | Documented clean overlay behavior, initialized runtime files, excluded runtime records, and reset flags. | `TASK-clean-kit-installation` |
| `.agent/reports/implementation/TASK-clean-kit-installation.md` | Added implementation evidence and review handoff report. | `TASK-clean-kit-installation` |

## Installer Behavior Before

- Installer copied the entire `.agent/` directory from the kit repository.
- Runtime state and evidence under `.agent/execution/`, `.agent/planning/`, `.agent/intelligence/`, `.agent/reports/`, and `.agent/governance/` could be carried into a target project.
- Existing target `.agent/` content was backed up and then overlaid by the kit copy.

## Installer Behavior After

- Installer copies only reusable framework assets from `.agent/templates/`.
- Installer initializes clean runtime Markdown files directly in the target project.
- Installer creates only `.keep` files in report and governance runtime directories.
- Existing target runtime files are preserved by default.
- Runtime files are overwritten only when the user passes `-Force` or `-ResetRuntime` for PowerShell, or `--force` or `--reset-runtime` for Bash.

## Runtime Files Initialized

- `.agent/execution/current-context.md`
- `.agent/execution/sessions-history.md`
- `.agent/execution/task-board.md`
- `.agent/planning/roadmap.md`
- `.agent/planning/milestones.md`
- `.agent/planning/epics.md`
- `.agent/planning/dependency-graph.md`
- `.agent/intelligence/code-graph/modules.md`
- `.agent/intelligence/code-graph/dependencies.md`
- `.agent/intelligence/code-graph/api-routes.md`
- `.agent/intelligence/code-graph/database-usage.md`
- `.agent/intelligence/code-graph/function-map.md`
- `.agent/intelligence/git-nexus/commit-map.md`
- `.agent/intelligence/git-nexus/task-commit-map.md`
- `.agent/intelligence/git-nexus/decision-commit-map.md`
- `.agent/intelligence/git-nexus/regression-log.md`

## Runtime Files Explicitly Excluded

- `.agent/reports/**/*.md`
- `.agent/governance/**/*.md`
- `.agent/execution/current-context.md` from the kit repository
- `.agent/execution/task-board.md` from the kit repository
- `.agent/planning/*.md` from the kit repository
- Any existing target runtime file unless reset is explicitly requested

## Validation Commands Run

| Command | Result | Evidence |
|---|---|---|
| `C:\Users\trung\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe scripts\validate-framework.py` | `passed` | `FRAMEWORK_VALIDATION_PASS` |
| PowerShell parser for `scripts/install-kit.ps1` | `passed` | `PS_PARSE_OK` |
| `C:\Program Files\Git\bin\bash.exe -lc 'cd /d/agentic-sdlc-kit && bash -n scripts/install-kit.sh && echo BASH_PARSE_OK'` | `passed` | `BASH_PARSE_OK` |
| PowerShell installer smoke test into `.tmp-install-test-clean` | `passed` | Target validation returned `FRAMEWORK_VALIDATION_PASS`; reports/governance contained only `.keep` files. |
| Bash installer smoke test into `.tmp-install-test-bash2` | `passed` | Target validation returned `FRAMEWORK_VALIDATION_PASS`; reports/governance contained only `.keep` files. |
| Existing runtime preservation smoke test | `passed` | Existing target `current-context.md` marker remained unchanged without reset flags. |

## Remaining Risks

- The clean runtime file bodies are embedded in both installer scripts. Future schema changes must update both scripts and the validator expectations together.
- PowerShell uses idiomatic `-Force` and `-ResetRuntime`; Bash uses the requested `--force` and `--reset-runtime`.
- The task board in this source repo was not moved to `DONE`; this implementation is ready for independent review.

## Reviewer Handoff Note

Please review the installer changes for separation between reusable framework assets and runtime target state. Key checks:

- Whole `.agent/` copy was removed from both installers.
- Runtime reports and governance Markdown records are never copied from the kit repository.
- Existing target runtime files are preserved unless an explicit reset flag is used.
- Fresh install targets validate successfully after clean runtime initialization.
