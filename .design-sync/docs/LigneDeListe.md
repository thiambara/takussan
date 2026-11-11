---
category: Data display
---
# LigneDeListe

Phone list row of the logged-in area. The whole row is the target: `href` makes it a link, `onClick` a button, neither an information row.

- `min-h-14` (56px), `gap-3 px-4 py-2.5`, bottom border, edge to edge of its container.
- Start: a 40px `Avatar` or an icon in a `size-9` disc (`IconeDeLigne`, opaque soft ink).
- Title 15px 500 and detail 13px muted, each truncated on one line.
- End: a status badge (`StatusBadge` of the console), an amount (`MontantDeLigne`, tabular figures, formatted by the caller) and/or the `chevron`.

Source: `takussan-web/src/components/ui/ligne-de-liste.tsx`.
