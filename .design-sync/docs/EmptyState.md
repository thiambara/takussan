---
category: Feedback
---
# EmptyState

The one empty state of the product: icon in a round muted chip, title, one encouraging sentence, one CTA.

- Props `{ icon, title, description, action }`; all strings already translated (it is presentational, importable from server components). Extra props (`className="col-span-full"`, `data-testid`) spread onto the container.
- Never write a local empty state: a CI guard refuses any `*EmptyState` outside `components/feedback/`. Never just « Aucun résultat. »

Source: `takussan-web/src/components/feedback/EmptyState.tsx`.
