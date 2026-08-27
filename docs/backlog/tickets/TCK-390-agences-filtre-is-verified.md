---
id: TCK-390
title: "Agences — ouvrir le filtre `is_verified`, sans quoi la tuile « Vérifiées » de l'accueil ne mène nulle part"
status: todo
phase: P2
family: full
estimate: S
wave: null
created: 2026-08-27
updated: 2026-08-27
depends_on: [TCK-360]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [front, back, super-admin, agencies, filtres]
---

## Objectif utilisateur

Le super-admin qui clique sur la tuile « Vérifiées » de l'accueil arrive sur **les agences
vérifiées**, et non sur toutes les agences.

## Le défaut, mesuré

Relevé par la revue adverse de TCK-360 (défaut n°5).

La tuile « Vérifiées » de `SystemMetricsGrid` affiche un **sous-ensemble** (60 sur 120 dans le jeu
de test) et porte `href: '/super-admin/agencies'` — **le même href, au caractère près, que la tuile
« Agences (total) » juste au-dessus**. Le Delta de TCK-360 demandait « un lien vers la vue
filtrée » ; il n'était pas constructible, faute de filtre.

Les trois autres tuiles d'agences, elles, mènent à `?status=active` / `?status=suspended`, amorcés
par `seedStatus()` (page agences) et couverts depuis la correction de la revue par
`agencies/__tests__/status-seed.test.tsx`.

**Pourquoi ce n'est pas un simple `?is_verified=1` côté front** — mesuré le 2026-08-27, par
exécution, pas par lecture :

```
GET /api/admin/agencies?per_page=1                          → meta.total = 8
GET /api/admin/agencies?per_page=1&filter[is_verified]=1     → meta.total = 8   (3 vérifiées sur 8)
```

Le paramètre est **ignoré en silence**. `AgencyModerationController::index()` ne passe pas par
`spatie/laravel-query-builder` : il lit ses filtres **à la main**, un par un
(`filter.status`, `filter.search`, `filter.created_from`, `filter.created_to`) et rien d'autre.

⚠ **Le piège de ce ticket est là** : `Agency::$requestFilterable` contient bien `is_verified`
(`app/Models/Agency.php:56`). Un lecteur qui s'arrête à cette ligne conclut que le filtre existe —
il n'existe que pour les contrôleurs qui empruntent `HasQueryBuilder`, et celui-ci n'en est pas.
*Une liste de filtrables déclarée sur le modèle ne dit rien de ce qu'un contrôleur donné honore.*

## Delta à produire

- [ ] `AgencyModerationController::index()` — honorer `filter[is_verified]` (`1`/`0`/`true`/`false`),
      sur le patron des quatre filtres déjà lus à la main juste au-dessus
- [ ] Test Feature : `filter[is_verified]=1` ne rend que les vérifiées, `=0` que les autres,
      l'absence du paramètre ne filtre rien
- [ ] `fetchAdminAgencies` — paramètre `isVerified?: boolean` sérialisé en `filter[is_verified]`
- [ ] Page agences — un `Select` « vérification » (toutes / vérifiées / non vérifiées), amorcé par
      l'URL comme `status` l'est déjà (`seedStatus`)
- [ ] `SystemMetricsGrid` — la tuile « Vérifiées » pointe sur la vue filtrée
- [ ] Le test d'amorce de la page agences est étendu au nouveau paramètre
- [ ] Les trois dictionnaires (`fr`/`en`/`wo`) reçoivent les libellés du nouveau filtre

## Critères d'acceptation

- [ ] AC1 — depuis l'accueil, la tuile « Vérifiées » ouvre une liste **dont le compte est celui de
      la tuile** ; l'ablation du filtre côté API fait rougir un test Feature
- [ ] AC2 — l'amorce par l'URL est couverte par un test qui rougit si l'initialiseur repasse en
      constante (patron de `status-seed.test.tsx`)
- [ ] AC3 — un `?is_verified=` inconnu retombe sur « toutes », comme `seedStatus` le fait déjà
- [ ] AC4 — `npm run lint`, `npx tsc --noEmit`, `npm run test`, `./vendor/bin/pint`, et les tests
      Feature d'`AgencyModerationController` passent

## Hors périmètre

- Le tri par état de vérification.
- Toute reprise de `AgencyModerationController` vers `HasQueryBuilder` : ce serait un autre ticket,
  et il toucherait un contrôleur que quatre écrans consomment.
