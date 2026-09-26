---
category: Forms
---
# PhoneInput

Phone field with the country code as a fixed prefix (+221 by default) and a live hint.

- `value` is the full E.164 number (`+221780143710`) or `''`; `onValueChange` returns the same shape.
- Typing `+` or `00` switches to an international number and the prefix steps aside; the hint text is translated (`ui.phoneInput`) and linked through `aria-describedby`.
- Needs the next-intl provider (in this bundle: `TakussanProvider`).

Source: `takussan-web/src/components/ui/phone-input.tsx`.
