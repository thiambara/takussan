---
category: Actions
---
# Button

The one button of the product: filled terracotta for the single primary action, quieter variants for everything else.

- **Use** `variant="default"` for one CTA per screen (verb + object: « Publier un bien »). `secondary`, `outline` or `ghost` for the rest, never as loud as the primary. `destructive` only for actions that remove or suspend, always behind a confirmation Dialog. `link` for inline navigation.
- **Sizes**: `xs`, `sm`, `default`, `lg`, plus `icon-xs`, `icon-sm`, `icon`, `icon-lg`. Under 640px, `default`/`lg`/`icon` keep a 40px touch floor and `sm`/`icon-sm` 36px (`.plancher-tactile-*`); a caller's own `min-h-*` always wins.
- **Hover** of the filled button is `primary-deep`; press scales to 0.96 (off under reduced motion). Focus is `ring-2 ring-ring`.
- **The consumer provides** the label (already translated), an optional lucide icon as a child (sized automatically), and `render` to turn it into a link: `render={<Link href=…/>}`. Never a native `<button>` for a main action.
- Don't write « OK », « Valider » or « Submit ».

Source: `takussan-web/src/components/ui/button.tsx`.
