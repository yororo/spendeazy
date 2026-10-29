# Implementation 01, Task 02 report

- The source logo node is oV7Mn (30 × 34). Pencil exported it at 4× to mobile-app/assets/design/oV7Mn.png; ScreenHeader uses that transparent raster export. Re-export this node if a higher resolution asset is needed.
- CategoryIconMark now lives in src/components/category-mark.tsx; Budget and Dashboard imports were migrated. The catalog remains owned by features/categories/category-catalog.ts. Marks use saved colors with a translucent tinted well.
- ChoiceSheet and CenteredDialog share the same keyboard-aware, scrollable shell. Existing consumers retain bottom sheets and their callbacks; later tasks can opt into CenteredDialog. dismissOnBackdrop defaults to true and does not control Android Back, which calls the supplied onDismiss.
- Manual native control, keyboard, accessibility and visual acceptance remains pending.
