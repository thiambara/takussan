---
id: TCK-2463
title: "Retirer l'intégration CDN de TCK-105 (Bunny/Cloudflare, signature, purge), hors du chemin depuis ADR-0029"
status: todo
phase: P3
family: technique
estimate: M
wave: null
created: 2026-11-03
updated: 2026-11-03
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#27-médias--fichiers
    - docs/features.md#29-administration--configuration
  models: []
tags: [back, front, media, cdn, dette, nettoyage]
---

## Objectif utilisateur

Qu'un développeur qui lit le code des médias ne trouve qu'UN chemin de diffusion — R2 servi par
Cloudflare Transformations (ADR-0029) — et non une seconde intégration désactivée qui a l'air
vivante : drivers, observateur, job de purge, route de signature, tuile de santé.

## Contrat de données

Aucune donnée nouvelle. [ADR-0029](../../../adr/0029-medias-sur-r2-servis-par-cloudflare-transformations.md),
§ Conséquences : *« L'intégration CDN de TCK-105 (Bunny, signature, purge) n'est plus sur le chemin.
Elle reste désactivée ; son retrait est un ticket à part. »* — ce ticket est celui-là. Aucun ticket
ouvert ne le couvrait (relevé du 2026-11-03 : aucun `todo`/`doing`/`review` ne cite Bunny ni
`CdnProviderContract`).

Ce qui est encore câblé, relevé le 2026-11-03 sur `dev` (`CDN_ENABLED=false` partout :
`takussan-api/.env.example`, `deploy/takussan/env.api.production.example`) :

- `takussan-api/app/Services/Media/Cdn/` : `BunnyCdnDriver`, `CloudflareCdnDriver`,
  `CdnProviderContract`, `CdnUrlGenerator`, `CdnHealthGuard` ;
- liaison du contrat dans `AppServiceProvider` (~l. 321-331), `Media::observe(MediaCdnObserver::class)`
  (~l. 787), `app/Observers/MediaCdnObserver.php`, `app/Jobs/Media/PurgeCdnCacheJob.php` ;
- `app/Http/Controllers/Api/Media/SignMediaController.php`, route `GET media/{media}/sign`
  (`routes/api/media.php:17`) — **aucun appel depuis `takussan-web/src`** (relevé du 2026-11-03) ;
- `MediaUrlResolver` (branche `cdn.enabled`), `HealthcheckService::cdn()` (clé `cdn` de la sonde) et
  la tuile `cdn` de `takussan-web/src/components/admin/super/system-health.tsx` ;
- `config/cdn.php`, 8 clés `CDN_*`/`BUNNY_*` dans `.env.example` et `.env.docker`, 11 dans le
  gabarit de production ;
- docs : `docs/infra/cdn.md` (bandeau « en sursis » du 2026-11-03), `docs/configuration.md` §3.10.

## Direction UX / Artistique

Super-admin, santé du système : la tuile `cdn` disparaît ; aucune autre ne bouge.

## Contraintes strictes (métier)

- **Aucun média ne change d'URL.** Le chemin vivant (`PublicPhotoUrl`, disques `r2-media`/`r2-private`,
  `PrivateMediaAccess`) ne doit pas être touché ; le retrait se prouve par la suite de médias verte
  sans modification de ses assertions.
- **§ Health de `docs/infra/cdn.md`** (TCK-600, sondes actives) ne concerne pas le CDN : il est
  déplacé vers `docs/infra/hebergement.md` avant la suppression du fichier, pas perdu.
- Une clé d'environnement retirée l'est des TROIS fichiers à la fois (`.env.example`, `.env.docker`,
  gabarit de production) : `check-env-parity` et `check-env-production` le gardent.

## Delta à produire

- [ ] Supprimer `app/Services/Media/Cdn/`, `MediaCdnObserver`, `PurgeCdnCacheJob`, `SignMediaController`
      et sa route ; retirer les liaisons de `AppServiceProvider`
- [ ] `MediaUrlResolver` : retirer la branche CDN (le chemin `cdn.enabled = false` devient le seul)
- [ ] `HealthcheckService` : retirer la sonde `cdn` ; front : retirer la tuile `cdn` et sa clé i18n
- [ ] Supprimer `config/cdn.php` et les clés `CDN_*`/`BUNNY_*` des trois fichiers d'environnement
- [ ] Tests : supprimer `SignMediaEndpointTest`, `PurgeCdnCacheJobTest` ; adapter `MediaUrlResolverTest`,
      `HealthCheckTest`, `HealthcheckProbesTest`
- [ ] Docs : déplacer § Health de `docs/infra/cdn.md` vers `hebergement.md`, supprimer `cdn.md`,
      corriger `docs/configuration.md` §3.10 et les renvois (`docs/adr/README.md`, `config/cdn.php:43`)
- [ ] Ajouter à ADR-0029 une ligne datée « retrait fait : TCK-2463 »

## Critères d'acceptation

- [ ] AC1 — `grep -rn -E 'Bunny|CdnProviderContract|cdn\.enabled|PurgeCdnCache|SignMedia' takussan-api/app takussan-api/config takussan-api/routes takussan-web/src` ne rend rien
- [ ] AC2 — `GET /api/media/{id}/sign` rend 404 (route absente), épinglé par un test
- [ ] AC3 — la suite de médias (`tests/Feature/Media/`, `tests/Unit/Media/`) est verte **sans qu'une
      assertion sur une URL de média ait changé** — vérifiable au diff de ces dossiers
- [ ] AC4 — la sonde de santé ne rend plus de clé `cdn`, et la console super-admin n'affiche plus la tuile
- [ ] AC5 — `check-env-parity`, `check-env-production`, `check-doc-links` verts

## Hors périmètre

- Le cache public de la fiche et l'IP du visiteur derrière Cloudflare (ADR-0052) : ce n'est pas l'intégration de TCK-105.
- Les Transformations Cloudflare et `PublicPhotoUrl` : le chemin vivant, inchangé.
- La ligne P2 « Optimisation CDN et formats modernes » de `docs/features.md` §2.7 : la spec reste telle quelle (Transformations la servent).

## Notes d'implémentation

_(à remplir par implementing-specs)_
