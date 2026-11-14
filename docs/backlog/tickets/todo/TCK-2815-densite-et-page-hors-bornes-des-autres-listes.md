---
id: TCK-2815
title: "Bailleurs, clients et bibliothèque de documents : la densité choisie part à l'API, une page au-delà de la dernière le dit"
status: todo
phase: P3
family: front
estimate: S
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#110-documents--contrats"
tags: [front, pagination, densite, bailleurs, clients, documents, suite-de-tck-2805, audit-ux, app]
---

## Objectif utilisateur

Le personnel qui choisit 50 lignes dans le carnet des bailleurs ou la bibliothèque de documents en voit 50. Celui qui
rouvre un lien vers une page qui n'existe plus apprend qu'il est au-delà de la dernière page, pas que la liste est
vide.

## Contrat de données

**Origine.** Inventaire de TCK-2805 (« Hors périmètre » et notes) : les autres appelants de `PropertyPagination`.

**Constat, relu sur HEAD (`765093279`) le 2026-11-14.** `PropertyPagination` ÉCRIT `?per_page=` (10, 20, 50) et
`?page=` ; chaque écran doit les LIRE.

| Écran | `?per_page=` | Page au-delà de la dernière |
|---|---|---|
| Carnet des bailleurs (`OwnersList`, `/app/owners`) | **ignoré** : `parametresDuCarnet` envoie `perPage = 20`, jamais lu de l'adresse | **dit vide** : l'état vide s'affiche sur `owners.length === 0` |
| Bibliothèque de documents du personnel (`DocumentsLibrary`, `/app/documents` sous un profil de personnel, `EspaceDesDocuments`) | **ignoré** : `per_page: 30` en dur, hors des densités du sélecteur | **dit vide** : l'état vide sur `grouped.length === 0`, et la pagination n'est rendue que si `last_page > 1` |
| Liste des clients (`ListeDesClients`, `/app/customers`) | **lu et transmis** (`parPageDeLUrl`, TCK-2590) : hors périmètre | **dit vide** : `vide = clients.length === 0` rend « Pas encore de clients » ou « Aucun client ici » |
| Biens (`/app/properties`) | ramené dans les bornes par TCK-2638 : hors périmètre | idem |

Le patron existe : `components/payments/pagination-de-l-adresse.ts` (`densiteDeLAdresse`, `pageDeLAdresse`,
`estAuDelaDeLaDernierePage`, jugé sur `meta.total`) et `PageAuDelaDeLaDerniere` (TCK-2805).

## Direction UX / Artistique

Les mêmes états que `/app/payments` depuis TCK-2805 : le sélecteur affiche la densité réellement servie ; au-delà
de la dernière page, un état qui le dit et ramène à la première, distinct de l'état vide.

## Contraintes strictes (métier)

- La lecture de la densité et de la page est celle de `pagination-de-l-adresse.ts`, partagée, pas recopiée.
- Une densité hors de 10/20/50 retombe sur 20, et le sélecteur affiche ce qui est servi.
- « Au-delà de la dernière page » se juge sur `meta.total`, jamais sur le seul nombre de lignes.
- La bibliothèque de documents passe sur les densités du sélecteur : 30 disparaît.
- Les filtres, vues et recherches de chaque écran ne changent pas.

## Delta à produire

- Carnet des bailleurs : densité de l'adresse transmise ; page au-delà de la dernière distinguée.
- Bibliothèque de documents : densité de l'adresse transmise ; page au-delà de la dernière distinguée ; pagination
  rendue dès qu'elle a quelque chose à dire.
- Liste des clients : page au-delà de la dernière distinguée.
- Tests vitest, par le vrai `PropertyPagination` (le patron d'AC3 de TCK-2805).

## Critères d'acceptation

- [x] AC1 — Bailleurs et bibliothèque : avec `?per_page=50`, la requête porte `per_page=50` et le sélecteur affiche
  50. Avec `?per_page=37`, la requête porte `per_page=20`.
  *Preuve : `components/owners/__tests__/densite-et-page-hors-bornes.tck-2815.test.tsx` (le chemin de la page
  serveur `lireLeCarnet` → `parametresDuCarnet` → `fetchOwners` contre un `fetch` doublé, puis `OwnersList` et le vrai
  `PropertyPagination`) et `components/documents/__tests__/densite-et-page-hors-bornes.tck-2815.test.tsx` (le vrai
  `useDocuments`) ; 37, 30, `abc` et 5000 rendent 20.*
- [x] AC2 — Pour chacun des trois écrans, `?page=9` sous une réponse `data: []`, `meta.total = 12` : l'état « au-delà
  de la dernière page » est présent, et le texte de l'état vide de l'écran est ABSENT (vérifié par son texte).
  *Preuve : les deux fichiers ci-dessus et `customer-dashboard/liste/__tests__/page-hors-bornes.tck-2815.test.tsx` ;
  bailleurs et clients sans et avec filtre (les deux textes d'état vide absents), « Revenir à la première page »
  retire `?page=` et garde le filtre.*
- [x] AC3 — Pour chacun des trois écrans, `data: []`, `meta.total = 0` : l'état vide d'aujourd'hui, inchangé.
  *Preuve : mêmes fichiers ; les tests existants des trois écrans restent verts.*
- [x] AC4 — Ablation : `perPage` remis à 20 dans les paramètres du carnet rend AC1 rouge ; le jugement sur
  `lignes === 0` seul rend AC2 rouge sur les trois écrans.
  *Preuve, le 2026-11-14, une à une, md5 restauré : `perPage = 20` dans `parametresDuCarnet` → 2 rouges ; `auDela`
  forcé à `false` → 2 rouges (bailleurs), 1 (documents), 2 (clients). En plus : la densité retirée de la clé
  react-query du carnet → 1 rouge ; `per_page: 30` remis → 6 rouges ; la condition `last_page > 1` remise sur la
  pagination des documents → 2 rouges.*

## Hors périmètre

- `/app/properties` et `/app/payments` (TCK-2638, TCK-2805).
- Le coffre de documents des bailleurs, locataires et prestataires (sans pagination de ce type).

## Notes d'implémentation

- **Prémisse re-mesurée le 2026-11-14** : `perPage = 20` (carnet), `per_page: 30` (bibliothèque), `vide` sur le seul
  nombre de lignes (clients) — inchangés depuis le relevé ; `ListeDesClients` transmet bien `per_page`.
- **Les libellés de `PageAuDelaDeLaDerniere` passent de `payments.pageAuDela` à `console.pagination.pageAuDela`**
  (fr, en, wo). Gardés sous `payments`, ils faisaient servir l'espace `payments` entier (3,1 points du dictionnaire)
  aux frontières `/app/customers` et `/app/documents` pour quatre libellés ; `console` y est déjà servi partout où
  `PropertyPagination` se rend. `namespaces.json` inchangé.
- **Carnet** : `EtatDuCarnet` gagne `parPage`, lu par `densiteDeLAdresse` (la page par `pageDeLAdresse`) au moyen
  d'un adaptateur `{ get }` sur le dictionnaire de `searchParams` ; il entre dans la clé react-query, sans quoi le
  cache de 20 lignes répondait au choix de 50.
- **Bibliothèque** : la pagination se rend dès que `meta` existe hors de l'état « au-delà » ;
  `PropertyPagination` se tait seul sur une page unique de 10 lignes au plus. L'ancienne condition
  `last_page > 1` cachait le sélecteur à qui avait choisi 50 sur 30 documents, sans retour possible.
- **Clients** : la densité reste lue par `parPageDeLUrl` (TCK-2590), hors périmètre.
