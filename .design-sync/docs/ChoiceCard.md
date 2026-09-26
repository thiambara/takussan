---
category: Forms
---
# ChoiceCard

Exclusive choice shown as a card — the « one question, two or three answers » of onboarding.

- Wrap in `ChoiceCardGroup legend="…"` (a fieldset: the group needs a name). Each card: `name`, `value`, `checked`, `onSelect`, `title`, optional `description`, `icon` (a lucide icon in `size-5`) and `children` revealed when selected.
- It is a real radio (sr-only) so arrows and single tab stop work; only the painting is custom, so the brand never shows the browser's blue.
- For optional, multiple choices use chips with `aria-pressed` instead.

Source: `takussan-web/src/components/ui/choice-card.tsx`.
