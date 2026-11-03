---
id: TCK-1363
title: "Tableaux de bord : un test de valeur par clé servie, et les tuiles de l'accueil dans la langue active"
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
    - "docs/features.md#25-reporting--tableaux-de-bord"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-127--indicateurs-des-tableaux-de-bord-de-lagent-du-bailleur-et-de-dashboardme"
tags: [api, web, dashboard, tests, i18n, pistes]
---

## Contexte

Réf : **P127.06** du fichier de pistes, `retenu · autonome` (A5 et A4).

Plusieurs clés de `/dashboard/agent`, `/dashboard/owner` et des adaptateurs de `/dashboard/me`
n'étaient assertées qu'en structure, à 0 ou par `>= 1` ; un renommage dans un service y rendait 0 en
silence par les `?? 0` des adaptateurs. Les tuiles de l'accueil (`DashboardMeKpis`) formataient
nombres, montants et dates avec `'fr'` écrit en dur.

## Objectif

Chaque clé citée par la piste porte un test de valeur, et les tuiles suivent la locale active.

## Delta à produire

- [x] `DashboardKeyValuesTest` : agent (biens gérés, pipeline, réservation en attente, visites à
      7 jours, tâches ouvertes, en retard et du jour, interventions, commissions du mois et de
      l'année) et ses neuf indicateurs de `/dashboard/me` ; bailleur (portefeuille, baux actifs,
      réservations en attente, loyer attendu) et leur copie dans `/dashboard/me`. Valeurs non
      nulles et distinctes.
- [x] `DashboardMeKpis` : la locale active (`useLocale`, repli `DEFAULT_LOCALE`), comme `LineChart`.

## Critères d'acceptation

- [x] AC1 — Une clé renommée dans un service ou un adaptateur fait rougir `DashboardKeyValuesTest`.
- [x] AC2 — En anglais, les tuiles rendent `12,345`, `1,540,000` et une échéance « Nov … ».

## Hors périmètre

- La piste cite `overview/owner/page.tsx` (`localeDeLaRequete`) comme modèle ; `DashboardMeKpis`
  n'est pas un composant asynchrone, il suit donc le modèle de `LineChart` (`useLocale`).

## Notes d'implémentation

- Ablation API : `tasks.overdue` lu sous un autre nom dans `AgentMeMetrics` et `bookings.pending`
  dans `OwnerMeMetrics` → les deux tests rougissent (`0` au lieu de `2` et de `4`) ; remis → verts.
- Ablation front : `DashboardMeKpis.tsx` remis à `3dd2a8205` → le test en anglais rougit
  (`12,345` introuvable) ; remis → vert.
- `commission_entries` est unique par (bail, bénéficiaire) : deux lignes du grand livre demandent
  deux baux.
