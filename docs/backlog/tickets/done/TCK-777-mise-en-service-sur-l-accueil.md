---
id: TCK-777
title: "La carte « Mise en service » en tête de l'accueil pour tout admin d'agence, étapes filtrées par kind"
status: done
phase: P1
family: applicatif
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-15--parcours-dune-agence-neuve"
tags: [front, onboarding, dashboard, pistes]
---

## Contexte

Réf : **P15.08** du fichier de pistes, `validé` (critère accordé : V7). La carte
`MiseEnService` (TCK-589) n'était montée que sur `/app/overview/agency`, que son layout réserve
aux agences `standard`. L'hôte solo (`individual`) ne la voyait jamais, et le gérant neuf n'avait
sur `/app` qu'une bannière de logo et un état vide générique.

## Décision du porteur

carte montée en tête de l'accueil pour tout admin d'agence, étapes filtrées par kind ; elle reste aussi sur /app/overview/agency

## Delta à produire

- [x] `(accueil)/page.tsx` : `MiseEnService` montée juste sous l'en-tête pour tout
      `agency_admin` rattaché à une agence, avec le `kind` lu par `fetchAgencyAction` (déjà
      appelée pour la bannière de logo).
- [x] `MiseEnService` : prop `kind` (`standard` par défaut, pour `/app/overview/agency`) ; une
      étape dont l'écran exige `agence: 'standard'` dans `PAGES_ADMIN` n'est ni montrée ni
      comptée, et la disparition de la carte se juge sur les étapes retenues.
- [x] `/app/overview/agency` ne change pas.

## Critères d'acceptation

- [x] AC1 — Admin d'une agence `individual` ou `standard` : la carte est le premier bloc sous
      l'en-tête de l'accueil, avec son agence et son `kind`.
- [x] AC2 — Un compte qui n'administre aucune agence : pas de carte.
- [x] AC3 — `individual` : « premier membre » n'est ni listé ni compté (6 étapes) ; toutes les
      autres faites, la carte disparaît.
- [x] AC4 — `standard` : les sept étapes restent.

## Hypothèses (mode sans humain)

- « Filtrées par kind » se lit dans la table des pages : une étape s'applique quand l'écran qui la
  fait est ouvert à l'agence. Aujourd'hui seul `first_member` (`/app/agency/team`, `standard`)
  tombe pour une agence `individual`. Le taux de commission et l'intégration de paiement restent :
  leurs écrans sont ouverts à tout admin, et l'API les compte.
- Le filtre est côté front : l'API (`AgencySetupStatus`) rend toujours les sept étapes et un
  `complete` calculé sur les sept. Un `kind` illisible (`null`) retient les seules étapes ouvertes
  à tout admin, comme `pageAccessible` refuse un `kind` inconnu.

## Notes d'implémentation

- Ablation : `MiseEnService.tsx` et `(accueil)/page.tsx` remis à `pre-dev` → 4 rouges sur 6
  (AC1, AC3) ; remis → 6 verts, et 34 tests des dossiers voisins verts.
- Le cas « la carte disparaît » restait vert avant le correctif, faute d'attendre la réponse :
  l'absence était vraie avant la requête. Le test attend l'état `success` de la requête.
