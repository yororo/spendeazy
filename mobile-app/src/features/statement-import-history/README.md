# Statement Import history and detail

History uses confirmation dates in Asia/Manila. Dashboard passes the exact filter returned with its displayed import count; View all starts with all dates. Pushing detail retains the history selection, loaded pages and scroll position.

Committed detail requires both the import ID and its source Space. A Space or session change invalidates pending reads. Focus refreshes financial projections, Category labels and Space membership. Failed catalog/member loads display unavailable labels; absent members after a successful load display Deleted user.

The authorized [detail GET](../../../../api/docs/openapi.yaml) supplies three distinct concepts: original statement evidence (including excluded rows), immutable original confirmation results, and current nondeleted Expense aggregates. Statement controls never substitute for confirmed spending. Legacy imports explicitly identify unavailable original snapshots. Expanded evidence uses a virtualized list and retains every row, independent edited/deleted indicators and links to retained Expense Activity.

Current and deleted actions push the existing Expense browser with a fixed import ID and an independently owned local selection/scroll position. They start with blank dates, Category and description. The Expense tab selection remains untouched. Mode/import/Space/session identify the query; mutation revisions and focus refresh the list. Expense detail receives the source Space and deletion returns through the retained stack. Archived Spaces keep inspection actions and the existing server-enforced write restrictions.

Presentation adapts shared glass surfaces, section typography and the `UPHFB` recent-row / `Qd5CZ` Expense recipes. There is no dedicated committed-detail board. Component/workflow checks establish behavior; Android and physical iPhone acceptance must separately cover light/dark, narrow displays, long filenames, large text, accessibility and the full edit/delete/Back journey. See the [consolidated tasks 04–06 handoff](../../../../docs/agents/implementation/IP-08_TASK-04-06_Report.md) for observed verification and pending native checks.
