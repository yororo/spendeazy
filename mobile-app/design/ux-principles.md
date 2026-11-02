# Mobile UX principles

Read before adding or changing any screen, component, or copy. These rules decide *what* to show; [design-token.md](design-token.md) decides *how it looks*. If they conflict, ask the user.

## Theme: minimalist and simple

Show the least UI that lets the user finish the task. Prefer icons and short, intuitive labels over text. Be creative!

## Rules

1. **Icon first.** Use a Lucide icon for any action or concept that is commonly recognized (add, edit, delete, filter, search, close, settings). Add a text label only when the icon is ambiguous.
2. **Short labels.** One or two words, a verb or noun. No sentences on buttons, rows or headers.
3. **Explanations on demand.** Don't add subtitles, helper text, or descriptions for things the layout already shows. Put useful secondary explanations, such as calculation methods, chart interpretation, and exceptions, behind an accessible info button near the relevant heading. Keep errors, warnings, empty states with a next step, and destructive confirmations visible where needed.
4. **Fewer elements.** Don't add a visible control, heading, or card when one tap or an existing element covers it. Put secondary options behind a popover or sheet.
5. **Accessibility is not optional.** Icon-only controls still need an accessible label, a 48-unit minimum target, and no meaning conveyed by color alone (design-token.md "Component and state rules").
6. **Reuse before inventing.** Use existing shared components and the matching node in the design source. Don't add new patterns, colors or sizes without need.

## Before finishing a UI change

- Can any text be replaced by an icon, or removed?
- Can any element be removed or moved behind a tap?
- Is each remaining label 1-2 words?
- Do icon-only controls have accessible labels?
