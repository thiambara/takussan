---
id: TCK-1811
title: "`settings` n'est plus une entrée des indicateurs ni des alertes de seuil"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#64-kpiconfig-"
    - "docs/models-spec.md#65-thresholdalert-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-181--tableaux-sans-borne-rangés-en-jsonb-et-relus-en-entier"
tags: [back, kpi, alerts, validation, pistes]
---

## Contexte

Réf : **P181.06** du fichier de pistes, `retenu · autonome` (A3).

`StoreKpiConfigRequest`, `UpdateKpiConfigRequest`, `StoreThresholdAlertRequest` et
`UpdateThresholdAlertRequest` acceptaient `settings` en `sometimes|array`, sans sous-règle ni
borne, et les contrôleurs écrivaient `validated()` tel quel : un `settings` de 1 Mo était écrit,
puis rendu par chaque réponse et chaque liste. Aucun lecteur côté API (`KpiResolver`,
`CheckThresholdAlertsCommand`, `ThresholdAlertTriggered`, les deux contrôleurs), aucun émetteur
côté front (`app/actions/kpis.ts`, `app/actions/alerts.ts`, `KpiConfigList.tsx`).

## Contraintes strictes

- La colonne `settings` reste (V4) : seules les quatre règles de requête sont retirées.
- `validated()` n'ayant plus la clé, un `settings` envoyé est ignoré sans erreur (201 / 200),
  comme toute clé inconnue.

## Delta à produire

- [x] Retirer `'settings' => ['sometimes', 'array']` des quatre requêtes.
- [x] `IndicateursSettingsNonEcritTest` : création et modification d'un indicateur et d'une
      alerte avec `settings` → la colonne reste `null`, les autres champs sont écrits.

## Critères d'acceptation

- [x] AC1 — `POST /api/kpi-configs` et `POST /api/threshold-alerts` avec `settings` → 201,
      `settings` non écrit.
- [x] AC2 — `PUT` des deux ressources avec `settings` → 200, `settings` inchangé, le reste écrit.

## Hors périmètre

- La colonne et les déclarations `fillable`/`cast` des modèles (schéma, V4).
- Le type front `KpiConfig.settings` / `KpiConfigInput.settings` (`lib/queries/kpis.ts:16,25`) :
  déclaration sans usage, laissée en place.
- Les autres `jsonb` de l'angle 181 (P181.01, P181.03, P181.04, P181.05, P181.07), à valider.

## Notes d'implémentation

- Ablation : les quatre règles remises → 4/4 rouges (`settings` écrit) ; retirées → 4/4 verts.
  `ThresholdAlertTest`, `KpiConfigDuplicateTest`, `AgencyIndicatorCapabilityTest` restent verts.
