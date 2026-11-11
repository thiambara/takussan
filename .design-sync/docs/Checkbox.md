---
category: Forms
---
# Checkbox

Checkbox (base-ui) of the logged-in area: 18px box, 5px radius, at every width.

- Empty: `border-controle-vide` border (`--input` in light, 3.59:1 on cards; `--muted-foreground` in dark) on `bg-card`. Checked and mixed (`indeterminate`): `bg-primary`, a 14px check (stroke 2.5) or the 10×2 bar.
- The row is the target, not the box: wrap it in a `<label>` with its text (44 to 56px rows); clicking the label toggles it.
- `disabled`, `aria-invalid` (destructive border), focus ring as every control.

Source: `takussan-web/src/components/ui/checkbox.tsx`.
