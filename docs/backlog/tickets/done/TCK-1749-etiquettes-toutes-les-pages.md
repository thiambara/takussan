---
id: TCK-1749
title: "Les étiquettes CRM, les équipements d'un bien et la console des étiquettes lisent toutes les pages"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: [TCK-1367]
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
    - "docs/features.md#11-gestion-des-biens"
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-171--sélecteurs-et-listes-sans-pagination-nourris-par-la-taille-de-page-par-défaut"
tags: [front, tags, crm, console, pagination, pistes]
---

## Contexte

Réf : **P171.06** du fichier de pistes, `validé (délégué)` (V7 accordé).

`fetchCrmTags` lisait 50 étiquettes CRM (filtre de la liste client, suggestions de la fiche) ; les
deux pages de bien demandaient 200 équipements, que l'API ramène à 100 ; la console des étiquettes
lisait une page de 100 et filtrait ensuite côté client.

## Décision du porteur (déléguée)

> `fetchCrmTags`, la lecture des équipements des deux pages de bien et la page de la console des étiquettes lisent toutes les pages par 100 (`lireToutesLesPages`, TCK-1367) ; le filtre par onglet et la recherche de `TagsManager` restent côté client ; test : 101 étiquettes d'un type, la 101ᵉ est proposée ; reste : `filter[type]` et `filter[search]` envoyés à l'API par la console

## Reste à faire

> `filter[type]` et `filter[search]` envoyés à l'API par la console

## Objectif utilisateur

L'agent voit toutes les étiquettes CRM, le saisisseur d'un bien tous les équipements, et
l'opérateur toutes les étiquettes de la plateforme.

## Contrat de données

Aucun changement d'API : `GET /api/tags` pagine (100 au plus) et rend `meta.last_page`.

## Delta à produire

- [x] `fetchAllTags` (`tags.ts`) lit toutes les pages par 100 ; `fetchTagsAction` et
  `fetchConsoleTagsAction` passent par lui, et ne prennent plus `page` ni `perPage`.
- [x] Les trois pages appelantes ne demandent plus de taille (`perPage: 200`, `perPage: 100` retirés).
- [x] `fetchCrmTags` lit toutes les pages par 100, filtre et tri inchangés.
- [x] Test : 101 étiquettes, la 101ᵉ est rendue par chacun des trois lecteurs.

## Critères d'acceptation

- [x] AC1 — les suggestions CRM proposent la 101ᵉ étiquette.
- [x] AC2 — le choix des équipements d'un bien propose le 101ᵉ.
- [x] AC3 — la console des étiquettes reçoit la 101ᵉ ; `TagsManager` filtre et cherche toujours côté client.

## Hors périmètre

- Le reste ci-dessus.

## Notes d'implémentation

- Les deux actions n'ont que ces trois appelants, qui veulent tous la liste entière : elles lisent
  donc toutes les pages, plutôt qu'une action de plus par module.
- `console.jeton-operateur.test.ts` (TCK-650) bouchonnait la lecture de la liste par
  `data: { id: 1 }`, un objet, que la lecture paginée itère : son cas `fetchConsoleTagsAction`
  reçoit désormais une liste vide, le fait gardé (le jeton de l'opérateur) inchangé.
- Ablation : `tags.ts`, `customers.ts`, `admin-tags.ts` et `console.ts` rendus à `HEAD` → 3 rouges
  sur 3 (50, 100 et 100 lignes) ; correctif remis → 3/3 verts.
