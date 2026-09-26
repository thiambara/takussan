---
category: Layout
---
# Card

The white content surface: rounded-xl, a 10% ink ring instead of a border, header/action/content/footer slots.

- `size="sm"` tightens gaps and padding for dense lists and side panels.
- Compose `CardHeader` › `CardTitle` + `CardDescription` (+ `CardAction` top-right), then `CardContent`, then an optional `CardFooter` (muted band).
- An image as first child bleeds to the top edge with the top corners rounded.
- Property cards are a separate family (`PropertyCardStandard / Listing / Cover / Compact`, one variant per discovery section) built on the same tokens; they are not part of this bundle.

Source: `takussan-web/src/components/ui/card.tsx`.
