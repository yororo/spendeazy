---
name: implement-task
description: Implement a specified task from an implementation plan, consult prior session reports, record useful handoff notes, and stage the changes.
---

# Implement Task

Inputs: implementation plan path and task number or title. Derive the plan identifier from its filename or contents (e.g. `01-sample-plan.md` -> `IP-01`). Ask only if the plan, task, or identifier is ambiguous.

1. Read the plan, applicable repository guidance, and prior reports under `docs/agents/implementation/` matching the plan identifier. Inspect existing working-tree and staged changes before editing.
2. Implement the specified task within the plan's scope and constraints. Account for prerequisite work and prior reports; do not expand into other tasks. Preserve unrelated changes.
3. Perform the plan's permitted verification. Distinguish completed checks from pending manual acceptance; report blockers or material deviations honestly.
4. Create `docs/agents/implementation/IP-<plan-number>_TASK-<task-number>_Report.md` only when the session reveals useful information for the next agent or reviewer. Match existing number padding (e.g. `IP-01_TASK-05_Report.md`). Include non-obvious deviations, caveats, or development nuances that could affect later tasks. Omit facts already in the plan, obvious implementation summaries, and routine check logs. If no useful notes exist, create no report.
5. Review the diff and stage only this task's changes and any new report. Preserve pre-existing staged content. Do not commit or push, even if the plan includes those delivery steps, unless the user explicitly overrides this instruction.

Finish with a brief summary of the implementation, verification and pending checks, report path if created, and staging status.
