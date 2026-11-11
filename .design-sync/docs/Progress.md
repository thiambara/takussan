---
category: Feedback
---
# Progress

Progress bar (base-ui, `role="progressbar"`) of the logged-in area. An accessible name is required (`aria-label` or `aria-labelledby`).

- `Progress`: `h-1.5 rounded-full bg-muted` track (`taille="grand"`: `h-2`), rounded fill in `ton="primary" | "success" | "warning" | "neutral"` — each at least 3:1 against the track, in both themes. `value`, `min`, `max`; the value text is formatted in the page language.
- `ProgressSegments`: steps of a flow — `total` bars `h-1` with `gap-1.5`, the first `value` filled. Pass your own `aria-valuetext` ("Étape 2 sur 4"): the default is a percentage.

Source: `takussan-web/src/components/ui/progress.tsx`.
