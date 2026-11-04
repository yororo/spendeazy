# Mobile UX principles

Read before adding or changing any screen, component, or copy. These rules decide *what* to show; [design-token.md](design-token.md) decides *how it looks*. If they conflict, ask the user.

## Theme: minimalist and simple

Show the least UI that lets the user finish the task. Prefer icons and short, intuitive labels over text. Be creative!

## Rules

1. **Graphics over text.** Prefer graphical visualizations to text. Present information with icons, charts, graphs, progress bars and similar visuals where they fit. Use a Lucide icon for any action or commonly recognized concept (add, edit, delete, filter, search, close, settings). Add a text label only when the graphic or icon is ambiguous.
2. **Short labels.** One or two words, a verb or noun. No sentences on buttons, rows or headers.
3. **Explanations on demand.** Don't add subtitles, helper text, or descriptions for things the layout already shows. Put useful secondary explanations, such as calculation methods, chart interpretation, and exceptions, behind an accessible info button near the relevant heading. Keep errors, warnings, empty states with a next step, and destructive confirmations visible where needed.
4. **Fewer elements.** Don't add a visible control, heading, or card when one tap or an existing element covers it. Put secondary options behind a popover or sheet.
5. **Accessibility is not optional.** Icon-only controls still need an accessible label, a 48-unit minimum target, and no meaning conveyed by color alone (design-token.md "Controls and sizes", "Accessibility checklist").
6. **Reuse before inventing.** Use existing shared components and the matching node in the design source. Don't add new patterns, colors or sizes without need.
7. **Subtle, purposeful motion.** Animate to make the app feel alive and to explain what changed, never as decoration. See "Motion" below.
8. **Minimal popovers.** Omit titles and close buttons when the trigger provides context; dismiss by selection or tapping outside.

## Motion

- **Show cause and effect.** Motion should start where the user's action happened: a popover grows from its trigger's corner, and a selection indicator slides from the old option to the new one instead of jumping.
- **Containers move; content barely does.** The surface that appears (panel, sheet, indicator) can scale or travel. Items inside it only fade, with at most a few units of travel and no bounce. Staggers stay short (about 40 ms per item).
- **Signal state on the trigger.** Give pressable primary controls a light press scale (about 0.92–0.95). When a control's meaning flips, morph its icon instead of swapping it (the add "+" rotates into an "×" while its menu is open).
- **Quick and soft.** Use springs that settle in about 300 ms with only a slight overshoot; use short timings (under about 200 ms) for fades. Never block input while animating.
- **No animation on first render.** Place indicators at their starting state on launch; animate only in response to user actions.
- **Respect Reduce Motion** and keep animations on the UI thread with Reanimated.

## Before finishing a UI change

- Can any text be replaced by a chart, graph, icon or other graphic, or removed?
- Can any element be removed or moved behind a tap?
- Is each remaining label 1-2 words?
- Do icon-only controls have accessible labels?
- Does any animation draw more attention than the content it reveals?
