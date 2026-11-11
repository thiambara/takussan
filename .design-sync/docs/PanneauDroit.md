---
category: Overlays
---
# PanneauDroit

The right-hand side panel of the logged-in area (`/app`): a row's record or a short form, opened next to the list, as drawn in the retained mockup.

- Props: `titre` (17px, one line, truncated — it names the dialog), `declencheur` (an element rendered as the trigger), `pied` (optional actions, right-aligned), `children` (the scrolling body). `open` / `defaultOpen` / `onOpenChange` as in `Dialog`.
- From `xl` (1280px): 480px fixed (it does not shrink with the desktop density), full height on the right, `border-l`, the `panneau` shadow, NO veil and NOT modal — the page stays readable and clickable beside it; focus moves into the panel on open without being trapped, Escape closes it and focus returns to the trigger; a click in the page does not close it.
- Below `xl`: full screen and modal (focus trapped, `aria-modal`, page scroll locked, iOS included).
- Header `h-14 border-b pl-5 pr-2` with a 36px close button, body `p-5`, footer `flex justify-end gap-2 border-t px-5 py-3`.
- `SheetContent side="right"` is unchanged: existing right sheets keep their look until their page adopts this panel.

Source: `takussan-web/src/components/ui/panneau-droit.tsx`.
