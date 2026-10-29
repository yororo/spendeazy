# Implementation 01, Task 05 report

- Budget search, active/inactive selection, recurrence filters, and sorting now share a disclosure sheet. The Unset chip toggles only the recurrence filter. The sheet also toggles equivalent amounts beneath list rows; each row's accessibility label retains both equivalents regardless of that toggle.
- The Category mark opens the full existing icon/color catalog in a sheet. Rule mode uses a separate sheet; grouped Exact/Contains entries retain their original draft indices for removal. Neither sheet saves independently of the aggregate Save action.
- `TextField` adds a `budget` variant (34-unit amount and optional suffix). Its PHP suffix is supplied by the editor. The shared segmented variant now fills its column and uses a transparent unselected state over the themed track; later consumers should supply the track themselves.
- Task 05 branches from Task 04's HEAD (`9ed1c2a`) because local `main` lacks Tasks 02–04. Existing staged Task 01 report and unstaged local-testing edits were preserved. No commit or push was requested.
