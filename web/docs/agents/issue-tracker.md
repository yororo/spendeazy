# Issue tracker: GitHub

Issues and specifications for this repository live as GitHub issues in `yororo/spendeazy-web`. Use the `gh` CLI for all operations.

## Conventions

- Create: `gh issue create --title "..." --body-file <file>`
- Read: `gh issue view <number> --comments`
- List: `gh issue list --state open --json number,title,body,labels,comments`
- Comment: `gh issue comment <number> --body "..."`
- Apply or remove labels with `gh issue edit`
- Close with `gh issue close`

Infer the repository from the configured GitHub remote.

## Pull requests as a triage surface

PRs as a request surface: no.

## Publishing

When a skill says to publish to the issue tracker, create a GitHub issue. When a skill requests a relevant ticket, read the corresponding GitHub issue and its comments.

## Wayfinding

Wayfinding maps and child tickets use GitHub issues, sub-issues where available, native issue dependencies where available, and `wayfinder:*` labels.
