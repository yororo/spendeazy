# Pen references and normalized decisions

Part of the [Spendeazy design system](../../DESIGN_SYSTEM.md). Code paths are relative to `web/`; Markdown links are relative to this file.

## Source inconsistencies and decisions

The integrated spending journey uses these detailed Pen references:
[statement-categorization.pen](../../design/statement-categorization.pen) for assignment/Remember, [statement-transactions.pen](../../design/statement-transactions.pen)
for committed-statement scope, [monthly-insights.pen](../../design/monthly-insights.pen) for monitoring and return
actions, and [chart-inspection.pen](../../design/chart-inspection.pen) for accessible details. These refine the
original overview frames in [ui-design.pen](../../design/ui-design.pen); its Review frames retain read-only
grouping and expense language. Follow [foundations](foundations.md) for phone navigation, semantic tokens, and viewport rules, and [workflow presentation](workflows.md) for exact Budget states across all references.

| Source inconsistency                                                   | Implemented decision                                                                                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Two overlapping Dashboard frames                                       | Use the version headed “Your spending at a glance,” including Budget Used                                                       |
| Active neon-green palette and unused orange semantic palette           | Map the active black/white/neon system into semantic tokens; discard orange residue                                             |
| Earlier unused dark variables versus the verified dark Dashboard frame | Use the dark Dashboard palette with Light, System, and Dark appearance selection                                                |
| Many 1–2px spacing differences                                         | Normalize to the spacing scale                                                                                                  |
| 8–11px interface text                                                  | Raise sizes for accessibility                                                                                                   |
| Geist Mono and IBM Plex Mono overlap                                   | Consolidate data and labels onto Geist Mono                                                                                     |
| Neon green used as text on white                                       | Reserve neon for surfaces/indicators; use dark success text                                                                     |
| Desktop frames and a 390px mobile Dashboard reference                  | Apply the [responsive foundation rules](foundations.md#layout-and-breakpoints); the design system takes precedence over illustrative mockup styling |
| Floating-point artifacts in category amounts                           | Treat them as source-data defects; format currency values at the data boundary                                                  |
| “Map” and “Confirm” workflow naming                                    | Use Statement Import: Upload → Categorize → Review, as defined in root `GLOSSARY.md`                                                  |
