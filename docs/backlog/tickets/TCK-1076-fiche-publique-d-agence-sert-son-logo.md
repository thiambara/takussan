---
id: TCK-1076
title: "La fiche publique d'agence sert le logo que l'annuaire sert déjà"
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
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-85--ce-que-le-site-public-montre-dune-agence-individual"
tags: [api, public, agence, media, pistes]
---

## Contexte

Réf : **P85.01** du fichier de pistes, `retenu · autonome` (A1). `PublicAgencyController::show()`
servait `'logo_url' => $agency->logo_url ?? null`. Le modèle `Agency` n'a ni colonne ni accesseur
`logo_url` : la fiche rendait toujours `null`. L'`index()` du même contrôleur et la carte d'agence
de `PropertyResource` lisent la collection `logo` par `getFirstMediaUrl('logo')`. La fiche du
front affichait donc les initiales à la place du logo, et `openGraph.images` restait vide.

## Objectif

`GET /api/public/agencies/{slug}` rend le même `logo_url` que l'annuaire.

## Delta à produire

- [x] `PublicAgencyController::show()` : `logo_url` lu par `getFirstMediaUrl('logo') ?: null`.
- [x] Test : `tests/Feature/Public/PublicAgencyLogoTest.php`.

## Critères d'acceptation

- [x] AC1 : une agence dont la collection `logo` porte un fichier rend une URL non nulle sur sa
      fiche, égale à celle de l'annuaire.
- [x] AC2 : sans logo, la fiche rend `null`, pas une chaîne vide.

## Hypothèses (mode sans humain)

- Aucune : le comportement attendu est celui de l'`index()` du même contrôleur.

## Hors périmètre

- Le front, qui lit déjà `logo_url` (`agencies/[slug]/page.tsx`).

## Notes d'implémentation

- Avant correctif : AC1 rouge (`null`), AC2 vert. Ablation (correctif retiré) : même rouge.
- `show()` ne charge pas `media` d'avance : une requête de plus, sur une seule agence.
