---
id: TCK-1373
title: "Les relevés bancaires, les tâches d'un client et « Mes avis » lisent toutes les pages"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1367]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#16-crm--relation-client"
    - "docs/features.md#111-avis--réputation"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-135--listes-écrites-à-la-main-et-lecteurs-qui-ne-lisent-que-la-première-page"
tags: [front, rapprochement, crm, avis, pagination, pistes]
---

## Contexte

Réf : **P135.05** du fichier de pistes, `validé (délégué)` (V7 accordé).

Trois lecteurs demandent une page de 50 et rendent la liste sans pagination : `useBankStatements`
(relevés de l'agence), `fetchCustomerTasks` (tâches d'un client, `sort=due_at`, terminées
comprises, dont le panneau du pipeline compte les ouvertes) et `useAuthoredReviews` (« Mes avis »).
Au-delà de 50, le reste disparaît sans le dire.

## Décision du porteur (déléguée)

> les trois lecteurs lisent toutes les pages, comme `fetchAllLeasePayments` de TCK-1178 : `useBankStatements` (relevés, `-created_at`), `fetchCustomerTasks` (tâches du client, `sort=due_at`), dont le compte des tâches ouvertes de `CustomerDetailSheet` se fait alors sur toutes les tâches lues, et `useAuthoredReviews` (« Mes avis ») ; aucun changement de l'API ; test par liste : un élément de plus que la page est rendu, et le compte des tâches ouvertes tient au-delà de 50 tâches ; reste : la pagination de ces écrans, et le compte des tâches ouvertes par l'API

## Reste à faire

> la pagination de ces écrans, et le compte des tâches ouvertes par l'API

## Objectif utilisateur

Le comptable voit tous les relevés importés, l'agent toutes les tâches d'un client et leur vrai
compte d'ouvertes, et l'auteur tous ses avis.

## Contrat de données

Aucun changement d'API : `GET /api/agencies/{id}/bank-statements`, `GET /api/tasks`
(`filter[taskable_type]`, `filter[taskable_id]`) et `GET /api/reviews` (`filter[author_id]=me`)
paginent et rendent `meta.last_page`.

## Delta à produire

- [x] Les trois lecteurs lisent toutes les pages par 100 (`lireToutesLesPages`, TCK-1367), sans
  changer leur tri ni leur clé de cache.
- [x] Tests : 51 relevés, 51 avis rendus ; 60 tâches dont les 5 ouvertes viennent après 55
  terminées, les 60 lues et le panneau compte 5 tâches ouvertes.

## Critères d'acceptation

- [x] AC1 — `StatementsList` rend le 51ᵉ relevé.
- [x] AC2 — `fetchCustomerTasks` rend toutes les tâches, et le compte des ouvertes du panneau du
  pipeline porte sur elles toutes.
- [x] AC3 — `useAuthoredReviews` rend le 51ᵉ avis.

## Hors périmètre

- Le reste ci-dessus.

## Notes d'implémentation

- Le compte des tâches ouvertes est éprouvé sur le panneau `CustomerDetailSheet` monté avec ses
  vrais hooks : 55 tâches terminées puis 5 ouvertes, « Tâches actives » rendait 0 avant, 5 après.
- `useBankStatements` et `useAuthoredReviews` passent de `useApiQuery` à `useQuery` + `apiRequest`,
  sous leurs clés de cache d'avant. `reconciliation.test.ts` (TCK-593) ne voit donc plus
  `useBankStatements` parmi les appels de `useApiQuery` : son chemin est gardé par le test neuf.
- L'API des avis plafonne à 100 par page (`ReviewController::MAX_PER_PAGE`), celle des relevés et
  des tâches à `AbstractModel::PER_PAGE_MAX` : `per_page=100` partout.
- Ablation : `reconciliation.ts`, `pipeline.ts` et `reviews.ts` rendus à `HEAD` → 4 rouges sur 4 ;
  correctif remis → 4/4 verts.
