---
category: Overlays
---
# FeuilleDuBas

The bottom sheet of the logged-in area (`/app`): a phone-first dialog that rises from the bottom, drawn as in the retained mockup.

- Props: `titre` (17px, one line, truncated — it names the dialog), `declencheur` (an element, usually a `Button`, rendered as the trigger), `pied` (optional sticky action, e.g. a full-width `size="xl"` button), `children` (the scrolling body). `open` / `defaultOpen` / `onOpenChange` as in `Dialog`.
- Phone: `foreground/35` veil, `rounded-t-2xl bg-card` panel up to 90% of the screen, 32×4 grab handle, 44px close button, body `px-4 pb-4`, footer `border-t px-4 py-3`; the bottom safe area goes to the footer, or to the body without one.
- From `md` it opens as the right-hand side panel (as `PanneauDroit`: 480px fixed, full height, `border-l`, `panneau` shadow, header `h-14`, body `p-5`, right-aligned footer), still modal with its veil — no desktop mockup draws a bottom sheet (decision of 2026-11-11).
- Focus is trapped, Escape and the veil close it, focus returns to the trigger, and the page does not scroll behind it: a fixed-body lock on phones and touch tablets (iOS included), base-ui's lock on desktop pointers.
- `SheetContent side="bottom"` is unchanged: existing public bottom sheets keep their own look.

Source: `takussan-web/src/components/ui/feuille-du-bas.tsx`.
