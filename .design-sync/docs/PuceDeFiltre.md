---
category: Navigation
---
# PuceDeFiltre

Filter chip of the logged-in area and its scrolling row (`RangeeDePuces`). A toggle: `active` sets `aria-pressed`.

- 36px rendered (`h-9`, 32.4 on desktop), `rounded-full border px-3.5 text-sm` 500; `taille="sm"` gives `h-8 px-3` and 13px text (desktop filters).
- Rest: `border-border bg-card`. Active: `bg-foreground text-background`; the optional `compte` switches to the opaque inverse soft ink (never a translucent ink).
- `variante="ajouter"`: dashed border, a `+` and "Ajouter un filtre" by default. It is an action, so it has no `aria-pressed`.
- The touch target is 44px: a centred `before:` pseudo-element as tall as a control of the `/app` scope. Leave the row's vertical padding for it.
- `RangeeDePuces` is a named group (`aria-label`, "Filtres" by default), `flex gap-2 overflow-x-auto px-4 py-2.5`, no scrollbar, edge to edge of its container. It scrolls inside its own box, never the page.

Source: `takussan-web/src/components/ui/puce-de-filtre.tsx`.
