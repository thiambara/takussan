---
category: Forms
---
# Select

The only dropdown select of the product (base-ui). Never a native `<select>` in the UI.

- Pass `items` (value/label pairs) to the root so `SelectValue` shows the label; compose `SelectTrigger` › `SelectValue`, then `SelectContent` › `SelectItem`s (optionally `SelectGroup` + `SelectLabel`, `SelectSeparator`).
- `SelectTrigger size="sm"` for toolbars. The popup aligns the chosen item over the trigger by default (`alignItemWithTrigger`).

Source: `takussan-web/src/components/ui/select.tsx`.
