---
id: TCK-1812
title: "Les commentaires de `PixelsAuPlus` disent où cède la GD de l'image : sur `memory_limit`"
status: done
phase: P3
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#27-médias--fichiers"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-180--images-téléversées-sans-borne-de-pixels-face-aux-décodages-gd-qui-les-suivent"
tags: [api, media, gd, documentation, pistes]
---

## Objectif utilisateur

Réf : **P180.04** du fichier de pistes (classement A6).

Qui lit la borne de 20 Mpx sait quelle panne elle évite dans l'image déployée : une erreur PHP
`Allowed memory size exhausted`, et non la mémoire du conteneur.

## Contrat de données

Aucun. Commentaires seuls.

## Contraintes strictes (métier)

- La borne de 20 Mpx ne bouge pas (décision du porteur).
- Le commentaire dit ce qui est mesuré (le binaire de l'image) et ce qui est déduit (la panne,
  non exécutée dans un conteneur).

## Delta à produire

- [x] `app/Rules/PixelsAuPlus.php` : le docblock distingue la GD embarquée de l'image (allocation
  par `emalloc`, cède sur `memory_limit = 256M`) de la GD externe d'un poste (hors de
  `memory_limit`).
- [x] `UploadRoomPhotosInventoryRequest.php` et `MediaUploadRequest.php` : « hors de
  `memory_limit` » remplacé, avec renvoi à `PixelsAuPlus`.

## Critères d'acceptation

- [x] AC1 — `grep -rn 'hors de .memory_limit.\|hors du gestionnaire' takussan-api/app` ne rend plus
  rien ; la GD externe d'un poste n'est plus citée que dans le docblock de `PixelsAuPlus`, comme telle.

## Hors périmètre

- Exécuter un décodage sous borne dans le conteneur : `docker run` est fermé à l'implémenteur.

## Hypothèses (mode sans humain)

- La mesure du binaire est celle du mesureur (`docker save` de `takussan-api:local`, `strings
  gd.so` → `GD_BUNDLED`, imports `_emalloc_*`), relue et non refaite : l'image ne se lance pas
  depuis ce rôle. Re-mesuré ici : `Dockerfile:24` (`install-php-extensions … gd …`),
  `docker/php.ini:3` (`memory_limit = 256M`), et `gd_info()` du poste → `2.3.3` (GD externe).

## Notes d'implémentation

- Commentaires seuls : aucun test ne peut rougir, donc pas d'ablation. `PixelsAuPlusTest` rejoué
  vert (voir la `Mesure` de P180.04).
