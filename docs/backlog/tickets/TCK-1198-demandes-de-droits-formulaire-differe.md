---
id: TCK-1198
title: "Console, demandes de droits : le formulaire de création et son calendrier se chargent à l'ouverture"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#les-demandes-de-confidentialité-chargent-le-calendrier-pour-le-formulaire-de-création-monté-seulement-quand-on-ouvre-son-dialogue"
tags: [front, performance, super-admin, pistes]
---

## Contexte

Réf : **P104.03** du fichier de pistes, `retenu · autonome` (A2). `PrivacyRequestsConsole` importe
`DatePicker` statiquement, pour le seul `CreatePrivacyRequestForm`, monté sous `creating` dans un
dialogue fermé au chargement. C'est le seul chemin de la page vers react-day-picker et date-fns
(31,9 Kio gzip, mesure de l'explorateur).

## Objectif

Le graphe client de `/super-admin/privacy-requests` n'atteint plus react-day-picker ni date-fns ;
le formulaire et son comportement sont inchangés.

## Delta à produire

- [x] `CreatePrivacyRequestForm.tsx` : le formulaire, sorti tel quel.
- [x] `PrivacyRequestChamps.tsx` : `Champ`, `decritPar`, `erreurDe` et `aujourdhui`, communs aux
      deux formulaires.
- [x] `PrivacyRequestsConsole` monte le formulaire par `next/dynamic`.
- [x] Garde : cas « demandes de droits » dans `graphe-client-de-la-console.test.ts`.

## Critères d'acceptation

- [x] AC1 — `paquetsDuGrapheClient(privacy-requests/page.tsx, ['react-day-picker', 'date-fns'])`
      est vide.
- [x] AC2 — La saisie d'une demande part toujours en POST JSON avec les mêmes champs
      (`PrivacyRequestsConsole.test.tsx` vert).

## Hors périmètre

- Un build pour re-mesurer le poids.
- `useDejaOuvert` : le formulaire était déjà démonté à la fermeture (`creating ? … : null`) ; le
  garder monté changerait son état à la réouverture. Le chargement différé ne change rien de plus.

## Notes d'implémentation

- Ablation (2026-10-22) : formulaire réimporté statiquement dans la console → la garde rougit ;
  `next/dynamic` remis → verte.
- Piège : sous vitest, le premier chargement du module différé dépassait l'attente de
  `findByRole('dialog')`. Le test l'importe en tête (patron de TCK-1041, `DocumentsLibrary.test.tsx`).
