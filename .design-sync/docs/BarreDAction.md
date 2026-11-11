---
category: Layout
---
# BarreDAction

Sticky action bar at the bottom of a phone screen in the logged-in area: one primary action full width, or two at 50/50.

- 73px: top border, `py-3`, and a `size="xl"` button (48px). `bg-card px-4`, `shadow-barre-collante`. Shown below `md` only: the desktop mock-ups have no sticky bar. It is hidden, not unmounted, from `md`: put the desktop action elsewhere on the page.
- In `/app` it renders through a portal into the shell's slot, between the content and the tab bar. It stays in the flow, so nothing scrolls under it. It adds the safe area when it is the bottom of the screen (no tab bar, or `zoneSure` outside the shell), and raises the toast by its height.
- A submit button inside it is outside the page's `<form>` in the DOM, so name the form: `<Button type="submit" form="lease-form">`.

Source: `takussan-web/src/components/ui/barre-d-action.tsx`.
