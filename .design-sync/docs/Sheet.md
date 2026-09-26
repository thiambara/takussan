---
category: Overlays
---
# Sheet

Side panel (a Dialog on an edge) on a `scrim/30` veil: mobile menu, filters, details.

- `SheetContent side="left" (default) | "right" | "top" | "bottom"`. Side panels are `w-72` and carry **no padding**: the caller sets it, as the app does — `<SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-md">`, then `<SheetHeader className="border-b border-border p-4">` and a `p-4` body.
- `overlayClassName` passes classes to the veil. Header with `SheetTitle` + `SheetDescription`.

Source: `takussan-web/src/components/ui/sheet.tsx`.
