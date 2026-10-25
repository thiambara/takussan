---
id: TCK-2087
title: "« Biens publiés » de la console plateforme compte `Property::public()`, et sa liste lit `filter[public]=1`"
status: done
phase: P1
family: applicatif
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: [TCK-2036]
blocks: []
spec_refs:
  models:
    - "docs/models-spec.md#86-platformmetricdaily-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-167--tuiles-et-lignes-cliquables-des-tableaux-de-bord--ce-que-le-lien-ouvre-face-à-ce-que-le-nombre-compte"
tags: [api, front, console, reporting, pistes]
---

## Objectif utilisateur

Sur la console plateforme, la tuile « Biens publiés », la liste qu'elle ouvre et l'instantané
quotidien (`properties_published`) comptent les biens en ligne au sens du catalogue
(`Property::public()`, TCK-1115), comme l'accueil et la liste de l'espace d'agence (TCK-2036). Un
bien `available` public est compté ; un bien `rented` resté public ne l'est pas.

## Contexte

Réf : **P167.07** du fichier de pistes. La tuile comptait `status = published` seul
(`PlatformMetricsSnapshotter::stocks()`), et son lien ouvrait
`/super-admin/properties?filter[status]=published`. Mesuré par l'explorateur sur la base de
développement : 2 biens `published` contre 427 `available`.

## Décision du porteur

> validé — validation du porteur (2026-10-23) : compter par `Property::public()` ; un filtre neuf `filter[public]=1` de `/api/properties` (callback sur `scopePublic`), lu par la liste de la console et par le lien de la tuile ; rupture de série notée en commentaire ; même filtre que P198.03 ; la ligne de `models-spec.md` s'écrit en session

## Hypothèses (mode sans humain)

- Le filtre `filter[public]` de `/api/properties` existe déjà (TCK-2036, P198.03) : ce ticket le
  lit, il n'en crée pas un second.
- La ligne de `models-spec.md` est déjà écrite par le porteur (« ⚠ Au 2026-10-23,
  `PlatformMetricsSnapshotter` compte encore `status = published` ») ; la spec n'est pas touchée
  ici, sa mention « encore » devient fausse et se retire en session.
- Aucun contrôle neuf dans la barre de filtres de `/super-admin/properties` : la décision ne le
  demande pas. `filter[public]` entre seulement dans la liste des paramètres de filtre, pour que
  « réinitialiser » s'active et le retire.

## Delta à produire

- [x] API : `PlatformMetricsSnapshotter::stocks()` compte `properties_published` par
  `Property::query()->public()`, la rupture de série notée en commentaire.
- [x] Front : le lien de la tuile ouvre `/super-admin/properties?filter[public]=1` ; la page lit
  `filter[public]` et `fetchAdminProperties` le relaie ; la barre de filtres le compte parmi ses
  paramètres.
- [x] Gardes : un test du snapshotter (bien `available` public compté, `rented` public, privé et
  `is_test` non comptés) ; les tests de destination de la tuile et de la lecture de la console.

## Critères d'acceptation

- [x] AC1 — `stocks()['properties_published']` vaut le compte de `Property::public()` : un bien
  `available` public est compté, un `published` privé, un `rented` public et un bien de test non.
- [x] AC2 — la tuile « Biens publiés » mène à `/super-admin/properties?filter[public]=1`, et la
  liste y envoie `filter[public]=1` à l'API.

## Hors périmètre

- L'étape `listings_published` de l'entonnoir (`PlatformReportingService.php:263`), non citée par
  la piste.
- La série passée de `platform_metrics_daily` : elle garde l'ancienne règle (décision).

## Notes d'implémentation

- Reproduit sur `09237a2e9` : `BiensPubliesConsoleTest` → `Failed asserting that 2 is identical to
  3` (deux biens `available` publics non comptés, le `published` privé compté) ; les tests front
  rendaient le lien `filter[status]=published` et une lecture sans `filter[public]`.
- Piège : une première version du test (un seul bien `available`) était verte AVANT correctif, les
  deux règles tombant par hasard sur 2. Le second bien `available` les fait diverger.
- Ablation : snapshotter remis → rouge (`2 is identical to 3`) ; les quatre fichiers front remis →
  4 rouges sur 13 ; rétablis → verts.
