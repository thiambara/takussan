---
id: TCK-112
title: Fix runtime error — FieldRootContext manquant dans DocumentsFilters
status: todo
phase: P0
family: bug
estimate: S
created: 2026-04-29
updated: 2026-04-29
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#110-documents--contrats
tags: [front, bug, p0, base-ui]
---

## Objectif utilisateur

L'utilisateur peut accéder à la bibliothèque de documents `/app/documents` sans erreur de rendu.

## Contrat de données

Aucun changement d'API. La correction est purement composant UI.

## Direction UX / Artistique

Aucun changement visuel — corriger uniquement l'erreur de contexte Base UI.

## Contraintes strictes (métier)

Le filtre de documents doit fonctionner pour tous les rôles ayant accès à `/app/documents`.

## Delta à produire

- [ ] Localiser dans `src/components/documents/DocumentsFilters.tsx:59` le `<Label>` (Base UI `Field.Label`) utilisé hors de `<Field.Root>`
- [ ] Envelopper chaque `<Label>` dans `<Field.Root>` approprié, ou remplacer par un `<label>` HTML natif si le contexte Field n'est pas nécessaire
- [ ] Vérifier que `src/components/ui/label.tsx:18` n'est plus en erreur
- [ ] Vérifier que la page `/app/documents` charge et que les filtres fonctionnent

## Critères d'acceptation

- [ ] `/app/documents` ne renvoie plus l'erreur "Base UI: FieldRootContext is missing"
- [ ] Les filtres de la bibliothèque de documents sont fonctionnels et affichent correctement leurs labels
- [ ] Aucune régression sur les autres composants utilisant `<Label>`

## Hors périmètre

- Refonte du système de filtres documents
- Autres bugs de la page documents

## Notes d'implémentation

_(à remplir par implementing-specs)_
