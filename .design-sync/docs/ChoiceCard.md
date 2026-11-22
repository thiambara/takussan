---
category: Forms
---
# ChoiceCard

Exclusive choice shown as a card — the « one question, two or three answers » of onboarding.

- Wrap in `ChoiceCardGroup legend="…"` (a fieldset: the group needs a name). Each card: `name`, `value`, `checked`, `onSelect`, `title`, optional `description`, `icon` (a lucide icon in `size-5`) and `children` revealed when selected.
- It is a real radio (sr-only) so arrows and single tab stop work; only the painting is custom, so the brand never shows the browser's blue.
- In the logged-in area (`/app`): `min-h-16 px-3.5 py-3`, centred, a 20px radio with a 1px border; selected = `border-primary`, a 3px `primary/12` ring on a white card; title 15px semibold, description 13px. Elsewhere (onboarding) unchanged.
- For optional, multiple choices use chips with `aria-pressed` instead.

Source: `takussan-web/src/components/ui/choice-card.tsx`.
