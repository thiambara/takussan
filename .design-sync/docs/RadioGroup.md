---
category: Forms
---
# RadioGroup

Radio group (base-ui) of the logged-in area: `RadioGroup` handles arrows, wrapping and the single tab stop; `Radio` is a painted 20px circle (on the ×0.9 scale on desktop), never the browser's blue.

- Empty: 1px `border-controle-vide` border (`--input` in light, 3.59:1 on cards; `--muted-foreground` in dark) on `bg-card`. Checked: `border-primary` and a 10px `bg-primary` dot.
- The row is the target: wrap each `Radio` in a `<label>` with its text. Name the group (`aria-label` or `aria-labelledby`).
- For a choice shown as a card (title and description), use `ChoiceCard`.

Source: `takussan-web/src/components/ui/radio-group.tsx`.
