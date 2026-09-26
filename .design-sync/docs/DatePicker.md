---
category: Forms
---
# DatePicker

Date field that opens a Calendar in a Popover; reads and writes `yyyy-MM-dd` strings.

- `value` / `onValueChange` are ISO date strings; `min`/`max` bound the choice. Displayed as « 15 octobre 2026 » in the active locale.
- `className` lands on the button (the clickable target); `containerClassName` on the wrapper.
- Placeholder comes from `ui.datePicker`; needs the next-intl provider.

Source: `takussan-web/src/components/ui/date-picker.tsx`.
