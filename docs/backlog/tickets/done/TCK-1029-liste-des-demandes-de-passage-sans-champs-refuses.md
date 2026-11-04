---
id: TCK-1029
title: "La liste des demandes de passage en agence ne demande plus `ninea` ni `rib_pro`"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#49-agencyupgraderequest-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-68--passage-axe-au-navigateur-des-écrans-connectés-app-console-super-admin"
tags: [web, agency-upgrade, sparse-fieldsets, pistes]
---

## Contexte

Réf : **P68.01** du fichier de pistes, `retenu · autonome` (A1). Depuis TCK-601,
`AgencyUpgradeRequest::$queryFields` ne porte plus `ninea` ni `rib_pro` : un `fields[]` qui les
demande est refusé en 400. `AGENCY_UPGRADE_REQUEST_FIELDS` du front les demande toujours. Chaque
appel de `fetchAgencyUpgradeRequests` rend donc 400 : la page `/app/settings/agency/upgrade`
rend la page d'erreur, et le layout de `/app`, qui attrape l'erreur en `null`, ne voit jamais la
demande en cours.

## Objectif

`fetchAgencyUpgradeRequests` ne demande que des colonnes que l'API accepte.

## Delta à produire

- [x] `takussan-web/src/lib/queries/agency-upgrade.ts` : retirer `ninea` et `rib_pro` de
      `AGENCY_UPGRADE_REQUEST_FIELDS` (la liste ne les lit pas ; le formulaire les envoie
      toujours, par `submitAgencyUpgradeRequest`).
- [x] Test : chaque colonne de `AGENCY_UPGRADE_REQUEST_FIELDS` figure dans le `$queryFields` du
      modèle PHP, lu à l'exécution.

## Critères d'acceptation

- [x] AC1 — `AGENCY_UPGRADE_REQUEST_FIELDS` est inclus dans `AgencyUpgradeRequest::$queryFields`.
- [x] AC2 — Ablation : `ninea` remis dans la constante rend le test rouge.

## Hypothèses (mode sans humain)

- Le type `AgencyUpgradeRequest` du front garde `ninea` et `rib_pro` (nullables) : le détail de
  la console les lit par une autre requête, et la ressource les rend masqués.
- Le garde ne compare que l'index (`QueryBuilder` valide `fields[]`) ; aucune autre constante
  `*_FIELDS` n'est confrontée à son modèle ici (angle proposé 100 du fichier de pistes).

## Hors périmètre

- Rendre la page `/app/settings/agency/upgrade` robuste à une erreur de l'API (`Promise.all` sans
  `catch`).
- Déclencher `web-ci.yml` sur `AgencyUpgradeRequest.php` (chemin fermé à l'implémenteur).

## Notes d'implémentation

- Avant correctif, le test rend `["ninea", "rib_pro"]` hors de `$queryFields`.
- Ablation : constante d'origine remise → 1 rouge ; correctif remis → 1 vert. Les tests du layout
  et du formulaire qui importent le module restent verts (23 tests sur 4 fichiers).
- Le garde lit `AgencyUpgradeRequest.php`, que les `paths:` de `web-ci.yml` ne nomment pas : un
  changement du seul modèle ne le rejoue pas.
