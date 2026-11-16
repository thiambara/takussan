---
id: TCK-2463
title: "Retirer l'intégration CDN de TCK-105 (Bunny/Cloudflare, signature, purge), hors du chemin depuis ADR-0029"
status: done
phase: P3
family: technique
estimate: M
wave: null
created: 2026-11-03
updated: 2026-11-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#27-médias--fichiers
    - docs/features.md#29-administration--configuration
  models: []
tags: [back, front, media, cdn, dette, nettoyage]
---

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

> ⚠ **Piège omis par la rédaction : `config/media-library.php:152` — `'url_generator' =>
> CdnUrlGenerator::class`.** `CdnUrlGenerator` (sous-classe de `DefaultUrlGenerator`) génère
> **toutes** les URL de médias, par `MediaUrlResolver::resolve()`. Supprimer
> `app/Services/Media/Cdn/` sans ramener d'abord `url_generator` à `DefaultUrlGenerator` casse la
> génération de toutes les URL de médias : AC3 ne peut pas être vert. Delta corrigé ci-dessous.

**Verdict : toujours vrai.** Aucun commit ne cite ce ticket ; tout est encore câblé (drivers,
observateur, job de purge, route `media.sign` sans appelant côté front, sonde et tuile `cdn`,
`config/cdn.php`, clés `CDN_*`/`BUNNY_*`).

**Reste à faire** : `url_generator` d'abord, puis les suppressions du Delta ; `MediaUrlResolver` se
supprime (ses seuls appelants sont `CdnUrlGenerator` et `AppServiceProvider`) ; tests et renvois de
docs listés ci-dessous ; retirer les clés `CDN_*`/`BUNNY_*` de l'environnement Dokploy de
préproduction. Pas de décision du porteur (ADR-0029 a tranché) ; coordonner avec TCK-547.

## Objectif utilisateur

Qu'un développeur qui lit le code des médias ne trouve qu'UN chemin de diffusion — R2, photos de
biens servies en WebP direct (amendement TCK-585), autres images par Transformations (ADR-0029) — et non une seconde intégration désactivée qui a l'air
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
- liaison du contrat dans `AppServiceProvider` (~l. 333-350, appel l. 203 — relevé 2026-11-16),
  `Media::observe(MediaCdnObserver::class)` (~l. 869), `app/Observers/MediaCdnObserver.php`, `app/Jobs/Media/PurgeCdnCacheJob.php` ;
- `app/Http/Controllers/Api/Media/SignMediaController.php`, route `GET media/{media}/sign`
  (`routes/api/media.php:16-20`) — **aucun appel depuis `takussan-web/src`** (relevé du 2026-11-03) ;
- `config/media-library.php:4,152` — `'url_generator' => CdnUrlGenerator::class`, générateur de
  **toutes** les URL de médias (omis à la rédaction, relevé 2026-11-16) ;
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

- [x] **En premier** : `config/media-library.php:152` — `url_generator` ramené à
      `Spatie\MediaLibrary\Support\UrlGenerator\DefaultUrlGenerator::class` (et `use` l.4 retiré) ;
      mettre à jour le docblock de `PrivateMediaAccess.php:28` (ajout 2026-11-16)
- [x] Supprimer `app/Services/Media/Cdn/`, `MediaCdnObserver`, `PurgeCdnCacheJob`, `SignMediaController`
      et sa route ; retirer les liaisons de `AppServiceProvider`
- [x] ~~`MediaUrlResolver` : retirer la branche CDN (le chemin `cdn.enabled = false` devient le seul)~~
      Supprimer `MediaUrlResolver` et `tests/Unit/Media/MediaUrlResolverTest.php` : la branche
      restante rend `$storageUrl` tel quel, ce que fait déjà `DefaultUrlGenerator` (relevé 2026-11-16)
- [x] `HealthcheckService` : retirer la sonde `cdn` ; front : retirer la tuile `cdn` et sa clé i18n
- [x] Supprimer `config/cdn.php` et les clés `CDN_*`/`BUNNY_*` des trois fichiers d'environnement
- [x] Tests : supprimer `tests/Feature/Api/SignMediaEndpointTest.php`,
      `tests/Feature/Media/PurgeCdnCacheJobTest.php`, `tests/Unit/Media/MediaUrlResolverTest.php`, et
      `test_admin_health_reports_a_degraded_cdn` (`tests/Feature/Api/HealthCheckTest.php:49-58`) ;
      adapter `tests/Feature/Admin/Platform/HealthcheckProbesTest.php` (l.270 `cdn.enabled`,
      l.320-323, mock de `CdnProviderContract`) — chemins relevés le 2026-11-16
- [x] Docs : déplacer § Health de `docs/infra/cdn.md` vers `hebergement.md`, supprimer `cdn.md`,
      corriger `docs/configuration.md` §3.10 et les renvois (`docs/adr/README.md`, `config/cdn.php:43`) ;
      pour `check-doc-links`, vérifier un par un les fichiers qui citent `docs/infra/cdn.md` (lien
      ou simple mention) : TCK-547, `docs/plans/2026-04-26-tck-105-cdn.md`, ADR-0029, et les
      tickets done TCK-105, TCK-541, TCK-600, TCK-680, TCK-520 (relevé 2026-11-16)
- [x] Ajouter à ADR-0029 une ligne datée « retrait fait : TCK-2463 »

## Critères d'acceptation

- [x] AC1 — `grep -rn -E 'Bunny|CdnProviderContract|cdn\.enabled|PurgeCdnCache|SignMedia' takussan-api/app takussan-api/config takussan-api/routes takussan-web/src` ne rend rien
- [x] AC2 — `GET /api/media/{id}/sign` rend 404 (route absente), épinglé par un test
- [x] AC3 — la suite de médias (`tests/Feature/Media/`, `tests/Unit/Media/`) est verte **sans qu'une
      assertion sur une URL de média ait changé** — vérifiable au diff de ces dossiers
- [x] AC4 — la sonde de santé ne rend plus de clé `cdn`, et la console super-admin n'affiche plus la tuile
- [x] AC5 — `check-env-parity`, `check-env-production`, `check-doc-links` verts

## Hors périmètre

- Le cache public de la fiche et l'IP du visiteur derrière Cloudflare (ADR-0052) : ce n'est pas l'intégration de TCK-105.
- Les Transformations Cloudflare et `PublicPhotoUrl` : le chemin vivant, inchangé.
- La ligne P2 « Optimisation CDN et formats modernes » de `docs/features.md` §2.7 : la spec reste telle quelle (Transformations la servent).

## Notes d'implémentation

_(à remplir par implementing-specs)_

## Livré (2026-11-16)

- **Le générateur d'URL d'abord** : `media-library.url_generator` revenu à `DefaultUrlGenerator`.
  `MediaUrlGenerationTest` (neuf) fige `getUrl`/`getFullUrl`/`getTemporaryUrl`, original et
  conversions, sur une photo de bien (original privé, conversions publiques), une photo privée et un
  logo public, avec un `Accept` d'image : **joué vert sous `CdnUrlGenerator` puis sous
  `DefaultUrlGenerator`** ; seule l'assertion sur la classe configurée rougissait avant.
- **Prémisse fausse sur un point : la route `media.sign` avait un appelant.** TCK-2863 (2026-11-15)
  en avait fait la lecture du RIB (`bank_statement_media_id` « à signer par `GET /api/media/{id}/sign` »).
  Mesuré : elle rendait `/1/rib-1.pdf?token=…&expires=…&format=jpeg`, un chemin relatif que rien ne
  sert (CDN jamais provisionné). Remplacée par `bank_statement_url` dans `PayoutMethodResource` :
  l'URL d'API signée de `PrivateMediaAccess::signedUrl()`, gardée par `MediaPolicy::sign` (règle de
  TCK-2863 inchangée), `null` sous impersonation. Aucune route neuve.
- `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN` **restent**, déplacées sous « 17. PDF » des trois
  fichiers : `spatie/laravel-pdf` (pilote `cloudflare`) les lit. Onze clés `CDN_*`/`BUNNY_*` retirées ;
  action de déploiement `docs/deploiement/actions/2026-11-16-retirer-les-cles-du-cdn-de-tck-105.md`.
- Supprimés aussi, hors liste : `tests/Unit/Media/Cdn/` (trois tests des pilotes) et l'exemption
  `api/media/{media}/sign` de `ValeursEnListeParcoursDesRoutesTest`. Fixture
  `tests/fixtures/healthcheck-sondes.json` sans `cdn` (concordance API/front).
- `HealthcheckProbesTest` : le test « la route publique n'appelle pas le CDN » est ré-ancré sur sa
  propriété réelle — elle ne sonde rien (`snapshot`/`refresh` jamais appelés).
- Preuves : AC1 grep vide ; AC2 `PayoutMethodBankStatementTest::test_la_route_de_signature_cdn_est_retiree`
  (rouge 200 avant le retrait de la route, vert 404 après) ; AC3 `tests/Feature/Media` + `tests/Unit/Media`
  verts, aucune assertion d'URL modifiée (au diff : un fichier ajouté, cinq supprimés — CDN seul) ;
  AC4 `HealthCheckTest::test_admin_health_no_longer_reports_a_cdn_probe` + tests front `system-health.*` ;
  AC5 gardes vertes. Ablations : garde `can('sign')` et garde d'impersonation de `bank_statement_url`
  retirées tour à tour → rouge, restaurées (md5).
