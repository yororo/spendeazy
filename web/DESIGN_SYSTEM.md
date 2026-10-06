# Spendeazy Design System

This guide and its linked references own Spendeazy UI rules. Read this guide for every UI change, then load only the references that cover the affected behavior. Normalized rules take precedence over accidental Pen inconsistencies.

Paths are relative to `web/`. [Architecture](docs/ARCHITECTURE.md) owns code placement; [GLOSSARY.md](../GLOSSARY.md) owns domain language. Semantic tokens live in `src/index.css`.

## Choose the reference

| Change | Read |
| --- | --- |
| Colors, Category Colors, Theme/Appearance, typography, spacing, edges, or responsive shell | [Foundations](docs/design-system/foundations.md) |
| Primitive variants, forms, menus, dialogs, shared presentation, Space labels, or public/session surfaces | [Components](docs/design-system/components.md) |
| Dashboard/Category layouts, Insights/Budget evidence, Statement Import, or chart inspection | [Workflow presentation](docs/design-system/workflows.md) |
| Pen interpretation or a conflict between mockups and implementation | [Source decisions](docs/design-system/source-decisions.md) |

Read the relevant headings within each reference. Combine references when a change crosses their boundaries, such as a workflow Dialog that changes Theme tokens.

## Development rules

1. Search `src/components/ui` before creating a generic primitive.
2. Search the owning feature and existing shared domain UI before creating a Spendeazy-specific module.
3. Use semantic color tokens instead of literals in JSX.
4. Use the established spacing and Theme edge roles instead of arbitrary measurements.
5. Keep page-specific data and business behavior out of generic primitives.
6. Add a meaningful variant when an existing module needs a reusable visual choice.
7. Keep a module's interface smaller than its implementation; hide rendering detail from callers.
8. Use the established typography roles instead of styling each text node independently.
9. Preserve semantic HTML, keyboard behavior, focus visibility, and responsive reading order.
10. Update the owning design-system reference when a genuinely reusable token, variant, primitive, or application pattern is introduced.

## Adding a new pattern

Before adding UI, classify it in this order:

1. Existing token
2. Existing primitive or variant
3. Existing application module
4. Existing layout
5. New reusable pattern

If a Pen screen appears to need a new value, determine whether it represents a real reusable decision or an accidental one-screen difference. Prefer a new intentional variant over changing a shared primitive for one caller.
