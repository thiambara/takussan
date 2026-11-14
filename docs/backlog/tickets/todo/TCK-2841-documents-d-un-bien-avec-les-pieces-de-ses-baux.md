---
id: TCK-2841
title: "Documents d'un bien : une lecture par cible qui range aussi les pièces déposées sur ses baux, passés compris"
status: todo
phase: P2
family: back
estimate: M
wave: null
created: 2026-11-14
updated: 2026-11-14
depends_on: [TCK-2639]
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
    - "docs/features.md#11-gestion-des-biens"
  models:
    - "docs/models-spec.md#3-property"
  tickets:
    - docs/backlog/tickets/todo/TCK-2639-fiche-bien-location-d-abord.md
    - docs/backlog/tickets/done/TCK-2655-documents-coffre-api.md
tags: [api, documents, properties, leases, audit-ux, app]
---

## Objectif utilisateur

L'admin, l'agent ou le bailleur qui ouvre l'onglet Documents d'un bien y voit **toutes** les pièces du bien et de ses
baux, y compris celles déposées sur un bail clos (ancien locataire, ancien contrat scanné). Aujourd'hui, l'onglet lit
le bien et le bail en cours ; pour un bail clos, il renvoie à la fiche de chaque bail (ligne « Pièces des baux
précédents : sur chaque bail », TCK-2639).

## Constat (mesuré le 2026-11-14)

- `GET /api/documents?filter[documentable_type]=…&filter[documentable_id]=…` (TCK-2655) ne prend **qu'une** cible.
  La fiche du bien l'appelle pour `property:{id}` et pour le bail EN COURS (`useDocumentsDuBien`,
  `takussan-web/src/components/property-dashboard/fiche/OngletDocuments.tsx`).
- Les documents GÉNÉRÉS de tous les baux sont déjà servis (`GET /api/documents/generated?target=property:{id}`).
- Le coffre du bailleur range déjà les baux hors brouillon sous le dossier `property:{id}`
  (`App\Services\Documents\DocumentVault`) : la règle de rangement existe, la liste par cible ne l'applique pas.

## Delta à produire

- API : une lecture par cible du bien qui rend aussi les documents déposés sur ses baux (hors brouillon), chacun avec
  sa cible (`documentable_type`, `documentable_id`, référence du bail), paginée. Forme à trancher à l'implémentation
  (par exemple `filter[documentable_type]=property&filter[with_leases]=1`), décrite en ADR si elle étend le contrat
  de TCK-2655.
- **Garde de lecture** : un document d'un bail n'est rendu que si l'appelant peut le `view`
  (`DocumentPolicy::listableOn` / `readsTarget`, appliqué au BAIL, pas seulement au bien). Le locataire d'un bail ne
  lit pas les documents du bien (règle de TCK-2655) et ne lit pas les pièces d'un autre bail du même bien.
- Front : `useDocumentsDuBien` passe à cette lecture ; la ligne « Pièces des baux précédents » de TCK-2639 disparaît ;
  le compteur « Documents (n) » compte ce que l'onglet rend.

## Critères d'acceptation

- [ ] AC1 — Un bien à deux baux (un clos, un en cours), chacun avec une pièce déposée : appelé par un agent de
  l'agence, l'onglet Documents rend les pièces du bien et des deux baux, chacune nommée avec son bail.
- [ ] AC2 — Appelé par un agent d'une AUTRE agence : rien. Par le locataire du bail en cours : ni les pièces du bien,
  ni celles du bail clos.
- [ ] AC3 — Un bail en brouillon n'y range rien.
- [ ] AC4 — Tests de la garde, avec ablations rouges une à une : sans le filtre d'agence ; sans le `view` appliqué au
  bail ; sans l'exclusion des brouillons.
- [ ] AC5 — Nombre de requêtes constant de 1 à 9 baux (même relevé que TCK-2655).
- [ ] AC6 — Front : la ligne « Pièces des baux précédents » de TCK-2639 est retirée, `Documents (n)` égale les lignes
  rendues (test), et TCK-2639 AC3 peut être coché.

## Hors périmètre

- Le contenu de l'onglet Documents d'un bail (TCK-2645).
- Les documents générés (déjà servis par `documents/generated`).
