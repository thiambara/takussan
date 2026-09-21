---
id: TCK-538
title: "Médias sur R2 : pilote S3, disques public et privé, et la règle « privé par défaut » — les pièces KYC ne sont plus sur le disque public"
status: todo
phase: P1
family: back
estimate: L
wave: 67
created: 2026-09-21
updated: 2026-09-21
depends_on: []
blocks: [TCK-539, TCK-541]
spec_refs:
  features:
    - docs/features.md#27-médias--fichiers
  models:
    - docs/models-spec.md#spatielaravel-medialibrary
tags: [back, media, sécurité, stockage, r2]
---

## Objectif utilisateur

Qu'un fichier privé (pièce d'identité, document de bail, pièce jointe, devis) ne soit jamais
téléchargeable par qui connaît son identifiant, et que les médias publics vivent dans le seau R2
public de l'environnement. Décision : [ADR-0029](../../adr/0029-medias-sur-r2-servis-par-cloudflare-transformations.md).

## Contrat de données

Relevé le 2026-09-21 :

- `config/media-library.php:35` — `disk_name => env('MEDIA_DISK', 'public')` : toute collection
  sans `useDisk()` atterrit sur `public`, servi sous `/storage/{id}/…` sans authentification.
- Seul `BankStatement` (`statement`) déclare `useDisk('local')`.
- `config/cdn.php:72-76` — `secure_collections` = `lease_documents`, `contract_documents`,
  `property_archived_photos` : **aucune** n'existe dans un modèle.
- `league/flysystem-aws-s3-v3` absent de `composer.json` et `composer.lock`.

Cible :

| Clé | Défaut (dev, tests) | Préproduction / production |
|---|---|---|
| `MEDIA_PUBLIC_DISK` | `public` | `r2-media` |
| `MEDIA_PRIVATE_DISK` | `local` | `r2-private` |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_MEDIA_BUCKET`, `R2_MEDIA_URL`, `R2_PRIVATE_BUCKET` | vides | posées dans Dokploy |

`media-library.disk_name` lit `MEDIA_PRIVATE_DISK` ; `media-library.public_disk_name` lit
`MEDIA_PUBLIC_DISK`. `MEDIA_DISK` disparaît.

Collections **publiques** (se déclarent `useDisk(public_disk_name)`) : `Property` `photos`,
`videos`, `plans` ; `User` `avatar`, `avatars` ; `Agency` `logo`. Toute autre collection est
privée par défaut — à trancher collection par collection pour `User.photos` et les photos
d'`Inventory`/`MaintenanceRequest` (relever qui les affiche, et où, avant de décider ; écrire la
décision dans les Notes).

## Critères d'acceptation

- [ ] `league/flysystem-aws-s3-v3` installé ; disques `r2-media` (visibilité publique, `url` =
      `R2_MEDIA_URL`) et `r2-private` (visibilité privée, sans `url`) dans `config/filesystems.php`.
- [ ] Une collection déclarée sans `useDisk()` va sur le disque privé — prouvé par un test qui
      enregistre une collection neuve et lit `$media->disk`.
- [ ] Un test énumère, modèle par modèle, les collections publiques **attendues** et échoue si l'une
      change de disque ou si une nouvelle apparaît sans être listée.
- [ ] Un fichier KYC téléversé n'est **pas** atteignable sous l'URL publique du disque public
      (test rouge sur le code d'avant — ablation notée).
- [ ] `cdn.secure_collections` ne nomme que des collections qui existent, ou disparaît si le disque
      privé la rend inutile — décision écrite.
- [ ] `MEDIA_VERSION_URLS`/`version_urls` activé : l'URL d'un média porte sa version (ADR-0029 §6).
- [ ] Les conversions lourdes passent en file `media` (`queue_name`), consommée par `worker-media`.
- [ ] Commande `media:move-disk {from} {to} [--collection=] [--dry-run]` : copie original,
      conversions et images responsives, met à jour `disk` / `conversions_disk`, idempotente,
      n'efface la source qu'avec `--delete-source`.
- [ ] Clés neuves dans `.env.example` **et** `.env.docker` ; `scripts/check-env-parity.mjs` vert.
- [ ] `./vendor/bin/pint` propre ; tests des classes touchées verts.
