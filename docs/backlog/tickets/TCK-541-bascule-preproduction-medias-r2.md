---
id: TCK-541
title: "Bascule de la préproduction sur R2 : copie des médias, clés Dokploy, fin de la sauvegarde du volume, sauvegarde du seau privé"
status: todo
phase: P1
family: technique
estimate: M
wave: 67
created: 2026-09-21
updated: 2026-09-21
depends_on: [TCK-538, TCK-539, TCK-540]
blocks: []
spec_refs:
  features:
    - docs/features.md#27-médias--fichiers
tags: [infra, media, r2, dokploy, sauvegarde]
---

## Objectif utilisateur

Que la préproduction serve ses médias depuis R2, avec le même chemin que la production suivra en
phase F. Décision : [ADR-0029](../../adr/0029-medias-sur-r2-servis-par-cloudflare-transformations.md).

## Contrat de données

Déjà posé le 2026-09-21 (API Cloudflare) :

- seaux `takussan-preview-media` et `takussan-preview-private`, région `WEUR` ;
- domaine `media-preview.takussan.com` attaché au seau public, TLS ≥ 1.2 ;
- `transformations` et `image_resizing` à `on` sur la zone `takussan.com` ;
- sauvegarde Dokploy du volume `takussan-api-preview-4iza80_storage` ramenée de 7 à **1**
  exemplaire, et les 6 archives antérieures au 2026-09-21 supprimées de `vps-sauvegardes`
  (5,7 Go).

Reste à poser : un jeton R2 limité aux deux seaux de préproduction (le jeton de l'API Cloudflare
n'a pas le droit d'en créer : `9109`), les clés de TCK-538 dans Dokploy, la copie des médias.

## Critères d'acceptation

- [ ] Jeton R2 « Object Read & Write » limité aux deux seaux ; clés dans Dokploy, relevé des
      **clés** (jamais des valeurs) dans `docs/infra/hebergement.md`.
- [ ] `media:move-disk public r2-media` puis collections privées vers `r2-private` ; comptes
      d'objets avant/après notés ; une fiche de bien, un avatar et un logo servis depuis
      `media-preview.takussan.com`.
- [ ] Sauvegarde Dokploy du volume désactivée ; copie nocturne incrémentale du seau privé vers
      `vps-sauvegardes`, restauration à blanc d'un objet notée.
- [ ] Sonde `_sonde/test.jpg` retirée du seau public.
- [ ] `docs/infra/hebergement.md` et `docs/infra/cdn.md` à jour.
