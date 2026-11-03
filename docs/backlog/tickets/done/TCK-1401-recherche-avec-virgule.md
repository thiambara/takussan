---
id: TCK-1401
title: "Une virgule dans un texte libre de filtre reste du texte, plus un 500"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#24-recherche--filtres"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-151--valeurs-de-filter-passées-brutes-à-une-colonne-typée"
tags: [back, recherche, filtres, pistes]
---

## Objectif utilisateur

Chercher « Diop, Awa » ou une adresse avec virgule rend la liste filtrée, au lieu d'une erreur.

## Contexte

Réf : **P151.01** du fichier de pistes, `retenu · autonome` (A1 : le contrat de l'appelant est de
chercher le texte saisi, virgule comprise).

Mesuré avant correctif (garde ci-dessous, rouge sur `e72d2ad69`) : spatie découpe toute valeur de
filtre au délimiteur `,`. `filter[search]=Diop, Awa` lève un `TypeError` dans le rappel `search`
de `HasQueryBuilder` (premier modèle touché : `Document`) ; `GET /api/activity-log?filter[search]=Diop,%20Awa`
→ 500 ; `filter[city]=Dakar, Plateau` → `Array to string conversion` ; `filter[subject_type]=a,b`
des dossiers KYC → `TypeError`.

## Hypothèses (mode sans humain)

- Les quatre rappels nommés par le classement reçoivent `->delimiter('')`. Aucun code d'erreur
  neuf ; `subject_type` des dossiers KYC n'accepte pas de liste (aucun appelant n'en envoie).
- Le reste de l'angle 151 (plages, dates, identifiants) n'est pas touché ici.

## Delta à produire

- [x] `->delimiter('')` sur `search` (`HasQueryBuilder`), `search` (`AuditLogController`),
  `city` (`Property`), `subject_type` (`KycDossier`).
- [x] Test : `tests/Feature/Api/RechercheAvecVirguleTest.php` — chaque modèle à `HasQueryBuilder`
  qui déclare une recherche, la ville, le type de sujet KYC, la recherche du journal d'agence.

## Critères d'acceptation

- [x] AC1 — Toute recherche déclarée accepte une valeur à virgule sans lever.
- [x] AC2 — `GET /api/activity-log?filter[search]=Diop,%20Awa` → 200, et seule la ligne qui
  contient « Diop, Awa » sort.
- [x] AC3 — `filter[city]` et `filter[subject_type]` à virgule ne lèvent plus.

## Notes d'implémentation

- La garde parcourt `app/Models` et lance la recherche sous le moteur Scout `collection` : la
  valeur reçue par le rappel est éprouvée sans Meilisearch.
- Ablation : les quatre fichiers de `app/` rendus à leur état antérieur → 4 rouges ; remis → 4 verts.
