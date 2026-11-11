---
category: Feedback
---
# WarningBanner

Inline warning banner.

- Outside the logged-in area (public site, `/super-admin`): `warning` ink on its /10 tint (5.4:1), `ring-1 ring-warning/20 px-4 py-3`.
- In the logged-in area (`/app`): the retained mockup — `rounded-xl border border-warning/30 bg-warning/10 p-4`, main ink (`foreground`, > 13:1), the icon alone stays ochre (20px); optional `titre` in semibold above the text.
- No live-region role by default (static notices); pass `role="alert"` when the warning appears in reaction to an action.

Source: `takussan-web/src/components/ui/warning-banner.tsx`.
