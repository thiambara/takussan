---
category: Forms
---
# Calendar

Month grid (react-day-picker) mapped to the design system: terracotta selection, Bricolage caption, 36px day buttons.

- Accepts every DayPicker prop (`mode`, `selected`, `onSelect`, `disabled`, `locale`…). Prefer DatePicker for form fields; use Calendar inline for availability views.
- react-day-picker's own stylesheet ships with the component; the design-system classes on each day (`bg-primary` for the selection) carry the brand.

Source: `takussan-web/src/components/ui/calendar.tsx`.
