---
id: TCK-919
title: "Garde générale : six listes pro coûtent autant de requêtes pour 12 lignes que pour 2"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: [TCK-705, TCK-806, TCK-900, TCK-901]
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-20--nombre-réel-de-requêtes-sql-par-écran"
tags: [back, performance, n+1, test, pistes]
---

## Contexte

Réf : **P20.06** du fichier de pistes, `validé`.

Les listes pro appelées par le front n'avaient de garde de requêtes que liste par liste, chacune
sur la seule table de son défaut (P20.01, P20.02, P20.04, P20.05). Rien ne gardait le nombre total
de requêtes d'une liste contre une lecture par ligne ajoutée demain ailleurs.

## Décision du porteur

la garde générale, après P20.02 à P20.05

## Objectif utilisateur

Aucun changement visible. Une requête par ligne réintroduite sur l'une des six listes fait rougir
la CI.

## Contraintes strictes

- Les URL sont celles du front (`fields[]`, `include=`, `sort`, `per_page` recopiés de
  `takussan-web/src/lib/queries/{leases,bookings,customers,maintenance,documents,conversations}.ts`).
- Les lignes sont garnies (bien avec photo et adresse, client avec note et étiquette, document
  avec fichier et deux versions, conversation avec message) : une ligne nue ne crée pas la forme
  fautive (mesure du mesureur du 2026-10-16).
- Aucun code de `app/` ne change.

## Delta à produire

- [x] `takussan-api/tests/Feature/Api/ProListQueryBudgetTest.php` : un test paramétré
      « 2 lignes = 12 lignes » sur le total des requêtes, en admin d'agence, pour les baux, les
      réservations, les clients, les demandes d'intervention, les documents et les conversations.

## Critères d'acceptation

- [x] AC1 — Pour chacune des six listes, le nombre de requêtes de l'appel est le même pour 2 et
      pour 12 lignes.
- [x] AC2 — En cas d'écart, le message nomme l'URL et les formes de requête que 12 lignes
      répètent plus que 2.

## Hors périmètre

- `Model::preventLazyLoading()` dans `Tests\TestCase` : la `Piste` le mettait « à mesurer
  d'abord », et la mesure du 2026-10-16 n'y a trouvé aucune valeur (aucune exception sur les tests
  existants, P20.01, P20.04 et P20.05 ouvertes). Non repris.
- Les listes du super-admin et les listes publiques.

## Notes d'implémentation

- **Hypothèse** : « la garde générale » est le test paramétré de la `Piste`, sans
  `preventLazyLoading()` (voir Hors périmètre).
- **Piège** : le premier appel remplit des caches de processus et coûte une requête de plus ;
  compter dès lui rendait 12 lignes MOINS chères que 2 (25 contre 24 pour les baux). Le test fait
  un appel d'amorce non compté.
- **Ablation** :
  - `property.media` retiré des `with()` des baux, des réservations et des conversations, et
    `with('media')` de la liste des documents → 4 rouges : 25 → 35, 24 → 34, 23 → 33, 10 → 20 ;
  - commit `2cace3598` (TCK-900) annulé → interventions rouges, 29 → 69 ;
  - garde de colonne de `notes` de `CustomerResource` (TCK-705) retirée → clients rouges, 23 → 33 ;
  - remis → 6 verts.
- Ce test tient aussi le reste de P20.01 (« le test de budget 2 lignes = 12 lignes sur
  `GET /api/customers` »).
