---
id: TCK-2045
title: "Étiquettes d'un bien, référent d'un client, agent suspendu, listes de KPI et d'alertes : rendus par une ressource"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  adr:
    - "docs/adr/0018-format-des-dates-sur-le-fil.md"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-61--modèles-rendus-bruts-par-un-contrôleur-au-delà-de-user"
tags: [api, resources, pistes]
---

## Contexte

Réf : **P61.04** du fichier de pistes, `validé` par le porteur. Re-mesuré le 2026-10-24 par
`ReponsesSansModeleBrutTest`, rouge sur les cinq réponses avant correctif :

- `POST /api/properties/{property}/tags` rendait les `Tag` bruts, `pivot` compris
  (`taggable_type` = nom de classe PHP) ;
- `POST /api/customers/{customer}/primary-contact` rendait la relation brute (`created_at` en
  `…000000Z`, `metadata`) ;
- `PATCH /api/profiles/{agent_profile}/suspend` rendait `$profile->toArray()`, `metadata` entier
  (KYC compris) ;
- `GET /api/kpi-configs` et `GET /api/threshold-alerts` rendaient `$paginator->items()` : instants
  en `…000000Z`, `threshold` et `last_value` en chaîne (`'10.5000'`).

## Décision du porteur

validation du porteur (2026-10-23) : seulement les ressources des réponses restantes (`PropertyTagController:62`, `setPrimaryContact`, `suspend` sans `toArray()`, `index` de KpiConfig et ThresholdAlert), routes gardées ; le premier constat est caduc (TCK-1049) ; la garde générale de `json()` n'est pas dans ce lot

## Delta à produire

- [x] `PropertyTagResource` (projection des `tags` de `PropertyResource`) pour `PropertyTagController::sync`.
- [x] `UserCustomerRelationshipResource` pour `setPrimaryContact` (sans `metadata`, comme `relationships()`).
- [x] `AgentProfileResource` pour `suspend` (sans `metadata`).
- [x] `KpiConfigResource` et `ThresholdAlertResource` pour les deux `index` : colonnes présentes
      seulement (les sparse fieldsets décident), instants par `iso()`, décimaux d'alerte en nombre.
- [x] Garde : `tests/Feature/Http/ReponsesSansModeleBrutTest.php`.

## Critères d'acceptation

- [x] AC1 — Les étiquettes d'un bien sortent sans `pivot`.
- [x] AC2 — Le profil suspendu ne rend pas `metadata`.
- [x] AC3 — Les instants de ces réponses suivent ADR-0018 (`+00:00`).
- [x] AC4 — `fields[kpi_configs]=id,metric` ne rend que ces deux clés.
- [x] AC5 — `threshold` et `last_value` sortent en nombre.

## Hors périmètre

- La garde générale de `Base\Controller::json()` (refus d'un `Model` brut) : écartée par la décision.
- `store` et `update` de `KpiConfigController` et `ThresholdAlertController` rendent encore le
  modèle brut : la décision ne vise que leurs `index`.
- Les routes sans appelant du front (`suspend`, `/me/service-provider/collaborations`) : gardées.

## Notes d'implémentation

- Ablation : les cinq retours des contrôleurs remis à leur forme d'avant → 5 rouges ; remis → 5 verts.
- Le front lit `threshold` comme `number | string` (`lib/queries/alerts.ts`) et l'affiche tel quel
  (`AlertList.tsx:226,232`) : « ≥ 10.0000 » devient « ≥ 10 ».
