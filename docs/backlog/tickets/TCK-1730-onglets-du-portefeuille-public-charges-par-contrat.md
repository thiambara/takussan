---
id: TCK-1730
title: "Les onglets « À louer » et « À vendre » d'un profil public se chargent par l'API, avec leur propre « Voir plus »"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-168--onglets-filtres-et-pagination-des-listes-tenus-en-état-local-plutôt-que-dans-lurl"
tags: [back, front, public, portfolio, pistes]
---

## Objectif utilisateur

Le visiteur d'une page d'agent ou d'agence qui ouvre « À louer » ou « À vendre » voit les biens de
ce contrat, et peut en charger la suite, même quand aucun n'est parmi les 24 biens les plus récents.

## Contexte

Réf : **P168.02** du fichier de pistes, `validé` (critère V7 cité par le classement, accordé).

Mesuré avant correctif (tests de garde ci-dessous, rouges sur `acec51c14`) : 24 biens `sale`
chargés, `totals = { all: 29, rent: 5, sale: 24 }`, clic sur « À louer » → 0 carte, aucun bouton
« Charger plus de biens » ; `GET /api/public/agents/{slug}/properties?filter[contract_type]=rent`
rendait les deux contrats (`meta.total` 2 pour 1 location et 1 vente), le filtre étant ignoré.

## Décision du porteur

> validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

Recommandation du délégué, appliquée : le filtre serveur, `filter[contract_type]` (`rent`|`sale`,
exact) sur les deux routes paginées du portefeuille, et dans `PortfolioTabs` une liste et une page
par onglet, chargées à la première ouverture de l'onglet par ces routes, le « Voir plus » de chaque
onglet comptant sur son propre total. Cette décision tranche, pour cet écran, entre l'AC5 de
TCK-276 (filtrage côté client) et la règle « filtrer côté serveur » de `CLAUDE.md`.

## Contrat de données

- `GET /api/public/agents/{slug}/properties` et `GET /api/public/agencies/{slug}/properties` :
  `filter[contract_type]` facultatif, `rent` ou `sale` ; toute autre valeur rend 422.

## Delta à produire

- [x] `PublicAgentController::properties` et `PublicAgencyController::properties` : filtre de contrat, validé par `App\Http\Requests\Public\PublicPortfolioRequest`.
- [x] Front : `fetchAgentPortfolio` / `fetchAgencyPortfolio` acceptent le contrat ; `PortfolioTabs`
      tient une liste et une page par onglet.
- [x] Tests : `tests/Feature/Public/PortefeuilleFiltreParContratTest.php`,
      `src/components/public/profile/__tests__/PortfolioTabs.tck-1730.test.tsx`.

## Critères d'acceptation

- [x] AC1 — `filter[contract_type]=rent` (et `sale`) borne la page et son `meta.total`, sur les deux routes ; sans filtre, rien ne change ; une valeur inconnue rend 422.
- [x] AC2 — Un onglet dont les biens ne sont pas tous parmi ceux rendus par la page charge sa première page par l'API à sa première ouverture.
- [x] AC3 — « Voir plus » d'un onglet compte sur le total de l'onglet et charge la page suivante du même contrat.
- [x] AC4 — Un onglet dont tous les biens sont déjà rendus ne déclenche aucun appel.

## Hors périmètre

- `?tab=` du portefeuille dans l'URL (reste de P168.05).

## Notes d'implémentation

- Un onglet ne part des biens de la page que s'il les a **tous** : partir d'une partie, puis
  demander la page 2 du contrat, sauterait des biens.
- Un échec de chargement rend l'onglet à son état vide ; « Voir plus » reste offert pour réessayer.
- La règle vit dans un FormRequest (`check-inline-validation.mjs` refuse `$request->validate` dans un contrôleur) : un `filter[contract_type]` invalide rend donc 422 même pour un profil inconnu ; sans le filtre, le 404 reste.
- Ablation : contrôleurs remis → 4 rouges sur 6 (filtre et 422) ; `PortfolioTabs` remis → 2 rouges
  sur 3 (AC2, AC3) ; correctifs remis → 6/6 et 3/3 verts.
