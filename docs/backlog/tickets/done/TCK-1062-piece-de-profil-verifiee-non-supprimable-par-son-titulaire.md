---
id: TCK-1062
title: "Une pièce de profil vérifiée ne se supprime plus par son titulaire"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-64--pièces-kyc-des-profils-à-leffacement-à-la-fin-du-profil-et-au-re-téléversement"
tags: [api, rgpd, kyc, autorisation, pistes]
---

## Contexte

Réf : **P64.03** du fichier de pistes, `validé` (V3, V7). `DocumentPolicy::delete()` vaut
`update()` : le téléverseur supprime sa pièce, vérifiée ou non (mesuré : RIB vérifié du bailleur,
`DELETE /api/documents/{id}` → 204). Supprimée en douceur, la pièce perd son fichier au bout de
90 jours par `media:cleanup`, contre les 5 ans de `privacy.ts`.

## Décision du porteur

> (a) refuser au titulaire la suppression d'une pièce de profil vérifiée ; test : `DELETE` d'une pièce vérifiée par son titulaire refusé (porteur, 2026-10-20)

## Objectif

Une pièce de profil vérifiée reste en place tant qu'un super-admin ne la retire pas.

## Delta à produire

- [x] `DocumentPolicy::delete()` : refuse quand le document est une pièce de profil
      (`isProfilePiece()`) vérifiée et que l'appelant n'est pas super-admin.
- [x] Test : `DocumentTest::test_holder_cannot_delete_verified_profile_piece`.

## Critères d'acceptation

- [x] AC1 — `DELETE /api/documents/{id}` d'une pièce de profil vérifiée par son titulaire → 403,
      la ligne n'est pas supprimée.
- [x] AC2 — La même pièce non vérifiée se supprime toujours (204).

## Hypothèses (mode sans humain)

- **Le super-admin garde le geste** : la décision vise le titulaire, et `Gate::before` accorde
  déjà tout au super-admin.
- **« Pièce de profil » = `Document::isProfilePiece()`** (identité, RIB, NINEA rattachés à un
  profil), la définition que TCK-697 a posée.

## Hors périmètre

- Le bouton de suppression du front sur une pièce vérifiée : il rend désormais une erreur 403 ;
  le masquer est un changement d'écran que la décision ne porte pas.
- Les pièces vérifiées déjà supprimées : `media:cleanup` les traite comme avant.

## Notes d'implémentation

- Avant correctif : 204 au lieu de 403. Ablation (garde neutralisée) → rouge ; remise → 19 verts
  sur `DocumentTest` et `DestroyAuthorizationTest`.
