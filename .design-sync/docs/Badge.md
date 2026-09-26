---
category: Status
---
# Badge

A small pill label for transaction type, state or count.

- Variants: `default` (primary fill, e.g. « À louer »), `secondary`, `outline`, `destructive` (tinted), `ghost`, `link`.
- Status tones follow the console's `StatusBadge` recipe: `<Badge variant="outline" className="h-auto gap-1 border-transparent py-0.5 bg-success/10 text-success">`. Tone classes: success `bg-success/10 text-success`, attention `bg-warning/12 text-warning`, danger `bg-destructive/10 text-destructive`, info `bg-info/10 text-info` (consoles only), neutral `bg-muted text-muted-foreground`. Do not thicken the tint: on a tint of the ink's own colour, less opacity means more contrast (`/15` fails 4.5:1 on a selected row).
- The consumer provides short text (one or two words) and optionally `render` for a link.
- On a property photo, at most one badge under `md` (transaction, or « Neuf / Sur plan »).

Source: `takussan-web/src/components/ui/badge.tsx`.
