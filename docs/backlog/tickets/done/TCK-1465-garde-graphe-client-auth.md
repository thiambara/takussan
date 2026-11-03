---
id: TCK-1465
title: "Une garde de graphe client lit les pages d'authentification"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1457, TCK-1461, TCK-1463]
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-137--écrans-qui-chargent-les-champs-de-formulaire-et-le-calendrier-par-le-fichier-indexts-de-componentsforms"
tags: [front, performance, auth, garde, pistes]
---

## Objectif utilisateur

Une page d'authentification qui se remettrait à charger le calendrier, ou react-hook-form sans
formulaire au chargement, fait rougir la CI.

## Contexte

Réf : **P137.05** du fichier de pistes, `retenu · autonome` (A5 : garde ajoutée, aucun seuil
resserré).

Mesuré sur `58c404ecf` : `paquetsDuGrapheClient` n'est appelé par aucun test qui parte de
`(auth)`.

## Hypothèses (mode sans humain)

- Exceptions déclarées : `auth/login/page.tsx` et `auth/register/page.tsx`, dont le formulaire
  react-hook-form (validé par zod) est la page. Elles restent gardées contre le calendrier.
- zod est refusé avec react-hook-form et son résolveur hors des exceptions.

## Delta à produire

- [x] `graphe-client-de-l-authentification.test.ts` : balayage des pages et layouts de `(auth)`,
  témoin, calendrier refusé partout, react-hook-form/`@hookform/resolvers`/zod refusés hors des
  exceptions déclarées.

## Critères d'acceptation

- [x] AC1 — Les 13 pages et layouts de `(auth)` sont trouvés, et tous passent.
- [x] AC2 — La garde rougit quand une page y réintroduit le calendrier ou react-hook-form.

## Notes d'implémentation

- Verte dès son ajout (TCK-1457, TCK-1461, TCK-1463 l'ont précédée). Éprouvée par ablation :
  `verify-email` remis sur `@/components/forms` → rouge (react-hook-form) ; `index.ts` de
  `components/forms` remis à son état de `58c404ecf` → 2 rouges (`login`, `register`
  atteignent le calendrier) ; rétablis → 30 verts.
