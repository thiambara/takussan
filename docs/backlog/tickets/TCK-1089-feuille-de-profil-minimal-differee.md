---
id: TCK-1089
title: "Coque de /app : la feuille de profil minimal du client se charge à sa première ouverture"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-70--poids-js-initial-des-écrans-de-app"
tags: [front, performance, bundle, pistes]
---

## Contexte

Réf : **P70.05** du fichier de pistes, `validé` par le porteur. Le dernier classement citait V2
(différer `TotpEnrollment` place un chargement réseau dans le dialogue qui bloque l'accès) ; la
décision écarte ce volet.

`MinimalProfileTriggerProvider`, monté dans la coque de `/app`, importe statiquement
`CustomerMinimalProfileSheet`, seul importateur de `@base-ui/react/select` dans la coque. Le
mesureur a mesuré 5 à 18 Kio de JS initial gzip par écran pour les deux composants de la piste.

## Décision du porteur

validé — différer `CustomerMinimalProfileSheet` par `next/dynamic` derrière sa condition ; `TotpEnrollment` reste importé statiquement, le dialogue qui bloque l'accès ne dépend pas du réseau (porteur, 2026-10-20)

## Objectif

La coque de `/app` ne charge plus la feuille de profil minimal ni `ui/select` avant que la feuille
s'ouvre.

## Contrat de données

Aucun. La feuille ne change pas.

## Contraintes strictes

- La feuille est rendue sous `enabled && useDejaOuvert(open)` (patron de TCK-1041) : téléchargée à
  la première ouverture, gardée montée ensuite pour l'animation de fermeture.
- **Hypothèse** : « derrière sa condition » couvre les deux conditions d'affichage, le compte
  `customer` seul (`enabled`) et l'ouverture déclenchée (`open`). Différer derrière `enabled` seul
  laisserait le module dans le JS de chaque écran d'un client, qui n'ouvre la feuille qu'une fois.
- `TotpEnrollment` reste importé statiquement (décision).

## Delta à produire

- [x] `MinimalProfileTriggerProvider` : `CustomerMinimalProfileSheet` par `next/dynamic`, rendu
      sous `useDejaOuvert(open)`.
- [x] Garde `src/app/(dashboard)/__tests__/coque-sans-feuille-de-profil-minimal.test.ts`.

## Critères d'acceptation

- [x] AC1 — Le graphe client statique des deux layouts de la coque n'atteint ni
      `CustomerMinimalProfileSheet` ni `components/ui/select.tsx`.
- [x] AC2 — `TotpEnrollment` reste dans le graphe client de la coque.
- [x] AC3 — La feuille s'ouvre toujours au premier déclenchement
      (`MinimalProfileTriggerProvider.test.tsx`).

## Hors périmètre

- `TotpEnrollment` (décision du porteur).
- Le reste de la coque (cadre, menus et popovers de la barre haute) et les assistants de bienvenue,
  au gain mesuré faible.

## Notes d'implémentation

- Avant correctif, 1 rouge : `app/layout.tsx` atteint `CustomerMinimalProfileSheet` et
  `ui/select.tsx` (`(dashboard)/layout.tsx` ne monte pas `AppShell`, il était déjà vert).
- Ablation : `MinimalProfileTriggerProvider.tsx` rendu à `HEAD` → le même rouge ; correctif remis →
  3/3 verts, 7/7 sur `MinimalProfileTriggerProvider.test.tsx`, 254/254 sur `components/customer`,
  `components/layout` et la garde.
- Le test du provider importe le module de la feuille en tête, contre la transformation à froid du
  premier `import()` sous vitest (piège de TCK-1041).
