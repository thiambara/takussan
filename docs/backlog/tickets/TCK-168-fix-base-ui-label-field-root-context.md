---
id: TCK-168
title: Fix Base UI Label hors `<Field.Root>` — crash sur /app/payments et SaveSearchButton
status: todo
phase: P0
family: bug
estimate: S
created: 2026-05-05
updated: 2026-05-05
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#15-transactions--paiements
    - docs/features.md#12-recherche--découverte-publique
tags: [front, base-ui, runtime-error]
---

## Objectif utilisateur

Le locataire doit pouvoir consulter son historique de paiements et sauvegarder une recherche sans rencontrer un Runtime Error plein écran.

## Contrat de données

Bug isolé côté frontend. Le composant partagé `src/components/ui/label.tsx` rend `FieldPrimitive.Label` (Base UI) qui exige un `<Field.Root>` parent. Tout call-site qui rend `<Label>` hors `<Field>` plante.

Call-sites identifiés (smoke test 2026-05-05) :

- `src/components/payments/PaymentsHistoryFilters.tsx` (ligne 54) → casse `/app/payments` entier (P0).
- `src/components/favorites/SaveSearchButton.tsx` (ligne 158) → casse l'action « Sauvegarder la recherche » sur `/properties` (P0, TC-LOC-04 inopérant).

Note : ces deux pages ont la même call-stack `Base UI: FieldRootContext is missing. Field parts must be placed within <Field.Root>.`. Un audit grep est attendu avant de fermer le ticket — d'autres call-sites peuvent exister.

## Contraintes strictes (métier)

- L'API publique du composant `<Label>` ne doit pas changer pour ne pas régresser les call-sites qui sont déjà dans un `<Field.Root>` (formulaires fonctionnels).
- Ne pas activer la prop expérimentale Base UI sans audit de l'a11y (les labels doivent rester associés à leur input via `for`/`id`).

## Delta à produire

- [ ] Découpler `src/components/ui/label.tsx` du `FieldPrimitive` Base UI : exposer un `<Label>` natif (`<label>` HTML + classes existantes) qui fonctionne avec ou sans `<Field.Root>`, et un `<FieldLabel>` dédié pour l'usage Field si nécessaire.
- [ ] Audit grep `<Label` dans `src/` pour lister tous les call-sites et confirmer qu'aucun ne casse après le changement.
- [ ] Tests : story / vitest snapshot qui rend `<Label>` hors d'un `<Field.Root>` sans warning ni exception.
- [ ] Vérifier visuellement `/app/payments` et la modale « Sauvegarder la recherche » fonctionnent à nouveau end-to-end (création + relance d'une recherche sauvegardée).

## Critères d'acceptation

- [ ] `/app/payments` se charge sans Runtime Error et liste les paiements (au minimum un état vide propre quand le customer n'en a pas).
- [ ] Cliquer « Sauvegarder la recherche » sur `/properties?...` ouvre la modale puis crée la recherche (200) sans crash.
- [ ] Aucun avertissement console `FieldRootContext is missing` sur les pages `/app/*`, `/properties`, `/properties/[slug]`.
- [ ] `npm run build` passe sans warning lié à `Field.Root`.

## Hors périmètre

- Implémentation effective de l'historique de paiements (TC-LOC-17 lecture, déjà couvert par d'autres tickets).
- Logique des alertes email pour saved-searches (couvert par les modèles `SavedSearch`).

## Notes d'implémentation

_(à remplir par implementing-specs)_
