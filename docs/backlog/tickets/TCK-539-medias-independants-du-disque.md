---
id: TCK-539
title: "Aucun code ne suppose plus qu'un média est un fichier local : KYC, versions de documents, liens de partage, relevés bancaires, filigrane"
status: todo
phase: P1
family: back
estimate: L
wave: 67
created: 2026-09-21
updated: 2026-09-21
depends_on: [TCK-538]
blocks: [TCK-541]
spec_refs:
  features:
    - docs/features.md#27-médias--fichiers
  models:
    - docs/models-spec.md#spatielaravel-medialibrary
tags: [back, media, stockage, r2, watermark]
---

## Objectif utilisateur

Que chaque fonctionnalité qui lit ou réécrit un fichier marche quand ce fichier vit dans R2.
Décision : [ADR-0029](../../adr/0029-medias-sur-r2-servis-par-cloudflare-transformations.md).

## Contrat de données

Chemins relevés le 2026-09-21 qui supposent un disque local (`$media->getPath()`) :

| Où | Ce qui casse sur R2 |
|---|---|
| `KycDocumentController.php:19` | `response()->file($media->getPath())` |
| `DocumentVersionController.php:73-78` | `getTemporaryUrl()` avec repli `getFullUrl()` puis `download(getPath())` |
| `DocumentShareLinkController.php:95-96` | `file_get_contents($media->getPath())` |
| `ParseBankStatementJob.php:52` → `CsvDriver.php:31`, `OfxDriver.php:21` | lecteurs qui ouvrent un chemin local |
| `ApplyWatermarkJob.php:63-68`, `WatermarkService.php:40,53,92`, `AgencyWatermarkContext.php:35` | le filigrane réécrit la conversion **sur place** et lit le logo par chemin |

URL de fichiers privés exposées en clair, à remplacer par une route signée ou une URL présignée
émise **après** autorisation : `DocumentResource:36` (`file_url => getFullUrl()`),
`AgencyUpgradeRequestController:111`, `DepositRefundService:210`,
`LeaseDepositRefundNotification:122`, `DocumentVersionResource:31-33`.

## Critères d'acceptation

- [ ] Chaque chemin du tableau lit par `Storage::disk($media->disk)` (flux, ou copie temporaire
      nettoyée quand une bibliothèque exige un chemin), jamais par `getPath()`.
- [ ] Le filigrane lit la conversion depuis son disque, l'écrit dans un fichier temporaire, la
      réécrit sur le **même** disque et le même chemin ; le logo de l'agence est lu par son disque.
- [ ] Chaque chemin est éprouvé par un test sur un disque **distant simulé** (`Storage::fake` d'un
      disque nommé comme en production, `r2-private` / `r2-media`) — un test sur `local` ne prouve
      pas l'indépendance au disque.
- [ ] Aucune ressource API n'expose l'URL directe d'un fichier privé ; l'accès passe par une route
      autorisée qui redirige vers une URL présignée (5 min) ou sert le flux.
- [ ] Une garde (test ou `scripts/check-*.mjs`) refuse tout nouvel appel à `->getPath(` sur un
      média dans `app/` hors d'une liste d'exceptions justifiées.
- [ ] `./vendor/bin/pint` propre ; tests des classes touchées verts.
