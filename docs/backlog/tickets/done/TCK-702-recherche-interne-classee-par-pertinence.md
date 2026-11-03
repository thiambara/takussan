---
id: TCK-702
title: "Clients et interventions : une recherche n'impose plus sort=-created_at, la pertinence de TCK-281 s'applique"
status: done
phase: P3
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#24-recherche--filtres
    - docs/features.md#16-crm--relation-client
    - docs/features.md#18-maintenance--interventions
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-16--listes-internes-sur-un-modèle-searchable
tags: [web, search, crm, maintenance, pistes]
---

## Contexte

Réf : **P16.02** du fichier de pistes, `retenu · autonome` (classement A1).

TCK-281 (AC1) écrit que la recherche des clients et des interventions est « tolérante aux fautes et
classée par pertinence ». L'API restitue cet ordre par `defaultSortsWithRelevance()`, passé à
`defaultSorts()` (`CustomerController.php:40`, `MaintenanceRequestController.php:55,81`), qui
s'efface devant tout `sort=` explicite. Or le front envoyait toujours un tri :

- `lib/queries/customers.ts` : `sort: sort ?? '-created_at'`, et la page
  `customers/(liste)/page.tsx` ne passe jamais `sort` ;
- `lib/queries/maintenance.ts` : `sort: params?.sort ?? '-created_at'`.

Une recherche était donc tolérante aux fautes, mais classée par date.

## Objectif

Quand `filter[search]` est posé et que l'appelant ne choisit pas de tri, le front n'envoie pas de
`sort` : l'API classe par pertinence. Sans recherche, rien ne change.

## Delta à produire

- [x] `customers.ts` (`buildListParams`) : pas de `sort` par défaut quand `filters.search` est posé.
- [x] `maintenance.ts` (`toSpatieParams`, partagé par `useMaintenanceRequests` et
      `useMaintenanceHistoryForProperty`) : idem quand `search` est posé.
- [x] Test `lib/queries/__tests__/recherche-par-pertinence.tck-702.test.tsx`, un groupe par liste.

## Critères d'acceptation

- [x] AC1 — Clients : avec `filters.search` et sans `sort`, l'URL ne porte aucun `sort`.
- [x] AC2 — Interventions (liste et historique d'un bien) : avec `search` et sans `sort`, les
      paramètres ne portent aucun `sort`.
- [x] AC3 — Sans recherche, les deux listes envoient toujours `sort=-created_at`.
- [x] AC4 — Un tri passé par l'appelant part tel quel, recherche comprise (le tri explicite
      l'emporte sur la pertinence, `test_explicit_sort_wins_over_relevance` de TCK-281).

## Hypothèses (mode sans humain)

- La piste propose deux options : ne pas envoyer `sort`, ou envoyer un `sort=relevance` explicite.
  La seconde demanderait un tri autorisé neuf côté API ; la première suffit et ne touche que le
  front. C'est elle qui est prise.
- Aucun appelant ne passe aujourd'hui `search` aux interventions (`MaintenanceList` n'a pas de champ
  de recherche) : le correctif y tient le contrat du module de requêtes pour le jour où il en aura.

## Hors périmètre

- Les autres listes que citait la piste ne sont pas dans le cas mesuré :
  - `documents.ts` vise un `defaultSort('-created_at')` en dur côté API, c'est P16.03 ;
  - `super-admin.ts` (agences) et `admin-users.ts` ne passent pas par `defaultSortsWithRelevance` ;
  - `agency-members.ts` (`fetchAgencyMembers`, membres d'agence, qui a la pertinence côté API) n'a
    aucun appelant dans `src/`.
- `owners.ts` et `service-providers.ts` envoient aussi `sort ?? '-created_at'` : leurs contrôleurs
  n'ont pas été relus.

## Notes d'implémentation

- Ablation : `customers.ts` remis à sa version de `pre-dev` → 1 rouge (« expected '-created_at' to
  be null ») ; `maintenance.ts` remis → 1 rouge (« expected '-created_at' to be undefined ») ;
  correctif remis → 6 verts.
