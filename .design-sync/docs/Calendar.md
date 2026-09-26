---
category: Forms
---
# Calendar

Month grid (react-day-picker) mapped to the design system: terracotta selection, Bricolage caption, 36px day buttons.

- Accepts every DayPicker prop (`mode`, `selected`, `onSelect`, `disabled`, `locale`…). Prefer DatePicker for form fields; use Calendar inline for availability views.
- react-day-picker's stylesheet is loaded by the global stylesheet in its own cascade layer (`rdp`), below the utilities: the design-system classes on each day (`bg-primary` for the selection, `ring-primary/40` for today) always win. Override with utilities, never with `.rdp-*` rules.

Source: `takussan-web/src/components/ui/calendar.tsx`.
