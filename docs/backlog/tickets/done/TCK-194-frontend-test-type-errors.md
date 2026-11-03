---
id: TCK-194
title: Frontend — fiabiliser les types des tests
status: done
phase: P1
family: technique
estimate: M
wave: 21
created: 2026-05-06
updated: 2026-05-06
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#19-état-des-lieux--inventaires
    - docs/features.md#111-avis--réputation
  models:
    - docs/models-spec.md#3-property
    - docs/models-spec.md#11-review
    - docs/models-spec.md#24-inventory-
tags: [front, typescript, tests, ci, technical-debt]
---

## Objectif utilisateur

L'équipe peut faire évoluer les parcours avis, comparaison et inventaires avec une suite de tests typée qui reflète les contrats réels.

## Contrat de données

Les tests concernés manipulent les données de biens, avis et inventaires déjà décrites par les specs référencées.

## Direction UX / Artistique

Sans changement visuel ; ce ticket porte sur la fidélité des fixtures et mocks de tests.

## Contraintes strictes (métier)

- Les fixtures de test doivent rester conformes aux types applicatifs publics.
- Les mocks ne doivent pas élargir les types au point de masquer des erreurs réelles.
- Les `@ts-expect-error` inutilisés doivent être supprimés ou remplacés par un typage correct.

## Delta à produire

- [ ] Corriger les mocks `vi.Mock` de `PropertyReviewForm.test.tsx`.
- [ ] Corriger les mocks `vi.Mock` de `PropertyReviewReplyForm.test.tsx`.
- [ ] Compléter la fixture `location` de `CompareTable.test.tsx` avec les champs attendus.
- [ ] Corriger le typage des mocks canvas dans `InventorySignatures.test.tsx`.
- [ ] Corriger le typage des mocks canvas dans `SignaturePad.test.tsx`.
- [ ] Corriger le mismatch `CompareRow<string>` / `CompareRow<number>` dans `compare.test.ts`.

## Critères d'acceptation

- [ ] `npx tsc --noEmit --pretty false` ne remonte plus d'erreur dans les tests de formulaires d'avis.
- [ ] `npx tsc --noEmit --pretty false` ne remonte plus d'erreur dans les tests de comparaison.
- [ ] `npx tsc --noEmit --pretty false` ne remonte plus d'erreur dans les tests d'inventaires/signatures.
- [ ] Les tests modifiés restent exécutables avec Vitest.

## Hors périmètre

- Changement des composants métier hors nécessité stricte de typage.
- Ajout de nouvelles fonctionnalités de comparaison, avis ou inventaire.
- Correction des erreurs ESLint bloquantes, couverte par TCK-193.

## Notes d'implémentation

Les mocks Vitest des formulaires d'avis sont typés depuis les props des composants pour rester alignés avec leur contrat public.
