---
category: Forms
---
# Input

Single-line text field on the Lin surface.

- Always pair with a `Label` (`htmlFor`/`id`). Set `aria-invalid` to show the destructive ring and border.
- Height grows to 44px inside a `fieldDensityScope()` container (comfortable density for forms on touch surfaces).
- The consumer provides value/onChange (or react-hook-form `register`), `placeholder` as an example, not an instruction.

Source: `takussan-web/src/components/ui/input.tsx`.
