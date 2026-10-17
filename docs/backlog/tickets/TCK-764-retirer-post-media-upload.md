---
id: TCK-764
title: "Retirer POST /api/media/upload, sans appelant"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#27-médias--fichiers"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-10--médias--tailles-conversions-disques-nettoyage"
tags: [back, media, code-mort, pistes]
---

## Contexte

Réf : **P10.08** du fichier de pistes, `retenu · autonome` (A3). `POST /api/media/upload`
(`media.upload`, TCK-016) attachait le fichier au compte appelant, dans `User.photos` ou
`User.documents`, à 30 fichiers par minute. Ni le front ni l'API ne l'appellent, `docs/features.md`
ne la cite pas, et rien ne lit ces deux collections.

## Objectif

La route, son action et son FormRequest disparaissent ; `POST /api/media` reste.

## Contrat de données

`POST /api/media/upload` ne crée plus rien (405, le chemin étant couvert par `DELETE media/{media}`).

## Delta à produire

- [x] Route `media.upload`, `MediaController::upload()` et `GenericMediaUploadRequest` retirés.
- [x] `MediaGenericUploadTest` retiré : ses cas de validation existent dans `MediaUploadTest`.
- [x] Les deux cas de `MediaDiskPrivatePhotosTest` qui éprouvaient `MediaResource` par cette
      route passent par `POST /api/media`.
- [x] `GenericMediaUploadRequest.php` sort de la liste figée de `FormRequestEtendBaseFormRequestTest`.
- [x] Un cas dans `MediaUploadTest` : la route n'existe plus et rien n'est créé.

## Critères d'acceptation

- [x] AC1 — `Route::has('media.upload')` est faux, et un envoi au chemin ne crée aucun média.

## Hors périmètre

- La seconde moitié de la `Piste` (« limiter les conversions aux collections affichées ») : le
  mesureur la laissait à P10.05, qui sert désormais la miniature de l'avatar (TCK-762) ; les
  conversions des autres collections de `User` restent produites.

## Notes d'implémentation

- Ablation : route, action et FormRequest d'avant remis → le cas rougit (201 au lieu d'aucun
  média) ; retirés → 13/13 verts.
- 405 et non 404 : `DELETE media/{media}` couvre le chemin `media/upload`.
