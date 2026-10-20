---
id: TCK-1079
title: "La fiche publique d'agence sert `is_verified` et montre le badge vérifié à côté du nom"
status: done
phase: P1
family: evolution
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
tags: [api, web, public, agence, pistes]
---

## Contexte

Réf : **P85.06** du fichier de pistes, `validé (délégué)` (V7). `PublicAgencyController::show()`
ne servait pas `is_verified`, que l'`index()` sert déjà : l'annuaire (`ProfileCard`) et la carte
de la fiche bien montraient le badge vérifié, la fiche d'agence jamais. La page portait aussi
`agency.license_number ? null : null` dans `eyebrowParts`, une expression toujours nulle.

## Décision du porteur (déléguée)

> servir `is_verified` dans `show()` comme l'`index()`, et afficher sur la fiche d'agence, à côté du nom, le badge vérifié de `ProfileCard` avec son libellé existant ; retirer l'expression morte `agency.license_number ? null : null` de `page.tsx:146` ; reste : la licence d'une agence `individual` (l'interdire dans `AgencyUpdateRequest` comme les mentions légales, ou la masquer sur la fiche), au porteur

## Reste à faire

> la licence d'une agence `individual` (l'interdire dans `AgencyUpdateRequest` comme les mentions légales, ou la masquer sur la fiche), au porteur

## Objectif

La fiche d'agence montre le même état vérifié que l'annuaire.

## Delta à produire

- [x] API : `show()` sert `'is_verified' => (bool) $agency->is_verified`.
- [x] Front : `AgencyDto.is_verified` ; badge `BadgeCheck` (libellé
      `publicProfileIndex.card.verified`, celui de `ProfileCard`) à côté du `h1`.
- [x] Front : retrait de l'expression morte de `eyebrowParts`.
- [x] Tests : `tests/Feature/Public/PublicAgencyIsVerifiedTest.php`, deux cas dans
      `agencies/[slug]/__tests__/page.server.test.tsx`.

## Critères d'acceptation

- [x] AC1 : la fiche rend `is_verified: true` pour une agence vérifiée, `false` sinon.
- [x] AC2 : la page montre le badge, nommé « Profil vérifié », pour une agence vérifiée, et pas
      pour une autre.
- [x] AC3 : le nom accessible du `h1` reste le nom de l'agence.

## Hypothèses (mode sans humain)

- Le badge est posé à côté du titre et non dedans, avec `role="img"` : dans le `h1`, son libellé
  entrerait dans le nom du titre. `ProfileCard` le met dans son `h3` ; l'écart ne touche que la
  structure, ni le libellé ni l'icône.

## Hors périmètre

- Le reste ci-dessus, au porteur.

## Notes d'implémentation

- API : avant correctif, `is_verified` absent (`null`) ; ablation → le même rouge.
- Front : page d'origine remise → 1 rouge sur 9 (le badge absent).
