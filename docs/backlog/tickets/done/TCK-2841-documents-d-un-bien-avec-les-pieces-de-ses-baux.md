---
id: TCK-2841
title: "Documents d'un bien : une lecture par cible qui range aussi les pièces déposées sur ses baux, passés compris"
status: done
phase: P2
family: back
estimate: M
wave: null
created: 2026-11-14
updated: 2026-11-14
depends_on: []
blocks: [TCK-2639]
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
    - "docs/features.md#11-gestion-des-biens"
  models:
    - "docs/models-spec.md#3-property"
  tickets:
    - docs/backlog/tickets/done/TCK-2639-fiche-bien-location-d-abord.md
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

- [x] AC1 — Un bien à deux baux (un clos, un en cours), chacun avec une pièce déposée : appelé par un agent de
  l'agence, l'onglet Documents rend les pièces du bien et des deux baux, chacune nommée avec son bail.
- [x] AC2 — Appelé par un agent d'une AUTRE agence : rien. Par le locataire du bail en cours : ni les pièces du bien,
  ni celles du bail clos.
- [x] AC3 — Un bail en brouillon n'y range rien.
- [x] AC4 — Tests de la garde, avec ablations rouges une à une : sans le filtre d'agence ; sans le `view` appliqué au
  bail ; sans l'exclusion des brouillons.
- [x] AC5 — Nombre de requêtes constant de 1 à 9 baux (même relevé que TCK-2655).
- [x] AC6 — Front : la ligne « Pièces des baux précédents » de TCK-2639 est retirée, `Documents (n)` égale les lignes
  rendues (test), et TCK-2639 AC3 peut être coché.

## Notes d'implémentation (2026-11-14)

- **Forme** (posée à team-lead en a/b, validée le 2026-11-14) : `GET /api/documents?filter[property_with_leases]={id}`
  — une clé dédiée plutôt que `filter[with_leases]=1` à côté de la cible, dont les filtres `documentable_type` /
  `documentable_id` retireraient les lignes de bail. ADR-0099, amendement du 2026-11-14.
- **Garde** : `DocumentPolicy::listableOnPropertyAndLeases()` juge CHAQUE cible de l'arbre (le bien, puis chaque bail
  hors brouillon) comme `listableOn` en juge une : lisible, tous ses documents ; illisible, la règle d'auteur. Un
  identifiant inconnu ou mal formé ne rend rien (pas de repli sur ses téléversements hors de l'arbre). Le super-admin reste
  sur ses téléversements (TCK-820). Chaque ligne de bail porte `lease` (`id`, `reference_number`, `status`).
- **Preuves** — `takussan-api/tests/Feature/Documents/DocumentsDuBienEtDeSesBauxTest.php` (14 tests) :
  - AC1 : « l'agent lit le bien et ses deux baux, chaque pièce avec son bail » (`lease` exact, `meta.total` = 3) ;
  - AC2 : « l'agent d'une autre agence ne lit rien », « le locataire en cours ne lit que son bail » (ni le bien ni le
    bail clos ; l'ancien locataire, le seul bail clos) ; « le view se juge sur chaque bail » (le bailleur du bien ne
    lit pas le bail de son prédécesseur, qui ne lit que le sien) ; parité liste/`show` sur 8 personas ;
  - cœur de l'amendement (team-lead, 2026-11-14 : forme a validée) : « les locataires successifs ne se lisent pas même
    avec un accès au bien » — ni pièce de l'agence ni pièce déposée par l'autre locataire, quand le locataire en cours
    est bailleur d'un autre bien de l'agence puis bailleur du bien lui-même ; l'agent d'une autre agence et le bailleur
    d'un autre bien ne lisent rien. Ablations sur ce test, toutes rouges : agence, `view` du bail, borne du bien, règle
    d'auteur (cible illisible ouverte en entier), branche du locataire de `reaches` ;
  - AC3 : « un brouillon n'y range rien » (l'agent et l'admin l'ouvrent par `show`, il n'est pas listé) ;
  - AC4 : ablations, une à une, toutes rouges puis restaurées (md5 vérifié) — sans le filtre d'agence (toute cible
    tenue pour lisible) : 5 rouges ; sans le `view` appliqué au bail (bail jugé par le bien) : 4 rouges ; sans
    l'exclusion des brouillons : 7 rouges ; sans la borne du bien (baux de l'agence) : 7 rouges ;
  - AC5 : « nombre de requêtes constant de 1 à 9 baux » (2 puis 9 baux non brouillon, même compte) pour l'agent, le
    bailleur et le locataire ; sans le chargement des profils de l'appelant, le locataire paie 4 requêtes par bail
    (48 → 76, ablation rouge) ;
  - couture front/API : « la requête du front rend les pièces et leur bail » (`fields[documents]` de la liste) et
    `lib/queries/__tests__/documents-bien-et-baux.tck-2841` (le filtre part ; ablation rouge) ;
  - AC6 : `FicheDuBien.tck-2639` « AC3 / TCK-2841 AC6 » — une lecture `property_with_leases`, quatre groupes, la ligne
    retirée, `Documents4` = 4 lignes ; ablations rouges (lecture du bien seul ; pièces de bail non rangées).
- `DateInventoryByValueTest` : `DocumentResource::lease` inscrite dans `CLES_JAMAIS_ATTEINTES` (jamais une date).

## Hors périmètre

- Le contenu de l'onglet Documents d'un bail (TCK-2645).
- Les documents générés (déjà servis par `documents/generated`).
