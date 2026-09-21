---
id: TCK-538
title: "Médias sur R2 : pilote S3, disques public et privé, et la règle « privé par défaut » — les pièces KYC ne sont plus sur le disque public"
status: done
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

- [x] `league/flysystem-aws-s3-v3` installé ; disques `r2-media` (visibilité publique, `url` =
      `R2_MEDIA_URL`) et `r2-private` (visibilité privée, sans `url`) dans `config/filesystems.php`.
- [x] Une collection déclarée sans `useDisk()` va sur le disque privé — prouvé par un test qui
      enregistre une collection neuve et lit `$media->disk`.
- [x] Un test énumère, modèle par modèle, les collections publiques **attendues** et échoue si l'une
      change de disque ou si une nouvelle apparaît sans être listée.
- [x] Un fichier KYC téléversé n'est **pas** atteignable sous l'URL publique du disque public
      (test rouge sur le code d'avant — ablation notée).
- [x] `cdn.secure_collections` ne nomme que des collections qui existent, ou disparaît si le disque
      privé la rend inutile — décision écrite.
- [x] `MEDIA_VERSION_URLS`/`version_urls` activé : l'URL d'un média porte sa version (ADR-0029 §6).
- [x] Les conversions lourdes passent en file `media` (`queue_name`), consommée par `worker-media`.
- [x] Commande `media:move-disk {from} {to} [--collection=] [--dry-run]` : copie original,
      conversions et images responsives, met à jour `disk` / `conversions_disk`, idempotente,
      n'efface la source qu'avec `--delete-source`.
- [x] Clés neuves dans `.env.example` **et** `.env.docker` ; `scripts/check-env-parity.mjs` vert.
- [x] `./vendor/bin/pint` propre ; tests des classes touchées verts.

## Notes d'implémentation

**Décisions de visibilité (relevé du 2026-09-21).** Publiques, déclarées par
`useDisk(config('media-library.public_disk_name'))` : `Property` `photos`/`videos`/`plans`,
`User` `avatar`/`avatars`, `Agency` `logo`. Tout le reste est privé, **y compris** :

- `User.photos` — collection par défaut de `POST /api/media/upload` (`MediaController::upload`).
  Aucune ressource API ne la lit (`grep "getMedia('photos')" app/` ne rend que des `Property`), et
  aucun écran ne l'appelle (`grep -rn "media/upload" takussan-web/src` → rien). Privée.
- `Inventory.photos`/`room_photos` — lues à deux endroits seulement : la réponse d'upload
  (`InventoryController.php:255`) et le PDF d'état des lieux (`InventoryController::groupRoomPhotos`,
  qui passe `getUrl()` à `resources/views/pdf/inventories/report.blade.php:146`). Le front ne les
  affiche nulle part (`InventoryDetail.tsx` ne fait qu'envoyer). Intérieur d'un logement occupé,
  pièce contractuelle : privées.
- `MaintenanceRequest.photos`/`completion_photos` — lues par la seule réponse d'upload
  (`MaintenanceRequestService::addPhotos`) ; le front (`MaintenanceCompleteForm.tsx`,
  `queries/maintenance.ts`) ne fait qu'envoyer. Privées.

✅ **Corrigé ensuite (mission 2)** : le PDF d'état des lieux embarque maintenant les photos en URI `data:` (`PdfImageEmbedder`), et les réponses d'upload d'inventaire et de maintenance rendent une URL d'API signée (`PrivateMediaAccess::signedUrl`). Relevé d'origine : le PDF embarquait les photos par `getUrl()`. Sur un disque privé cette
URL n'est pas servie (`local` : pas d'`url` ; `r2-private` : ni domaine ni accès public) — les photos
disparaîtront du PDF. Chemin hors du tableau de TCK-539 : à y ajouter (lecture par
`Storage::disk($media->disk)` et `data:` URI), ou ticket à part.

`Document.versions` portait `useDisk(config('media-library.disk_name', 'public'))` : le repli
`'public'` l'aurait exposée si la clé manquait — retiré, la collection prend le défaut privé.
`BankStatement.statement` : `useDisk('local')` → `config('media-library.disk_name')` (sinon elle
restait sur `local` en production, hors du seau privé).

**`cdn.secure_collections` → `[]`.** Ses trois noms n'existaient dans aucun modèle ; la protection
d'un fichier privé est désormais son disque, et le disque public ne porte plus que des collections
publiques par nature. La clé reste (vide) pour ne pas toucher `MediaUrlResolver` ni ses tests : le
retrait de l'intégration CDN de TCK-105 est un ticket à part (ADR-0029, Conséquences).

**`media:move-disk`** — n'emploie que `files`/`readStream`/`writeStream`/`delete` et des chemins relatifs du `PathGenerator`, jamais `path()` ni `getPath()` ; son test copie vers `RemoteDiskFake` (TCK-539), pas vers `Storage::fake` qui est local. Les conversions et images responsives sont **listées** dans leurs
répertoires (`PathGenerator`), pas reconstruites depuis `generated_conversions` : un nom de
conversion dépend du *file namer* et du format, et le listage ne peut pas en manquer une. La ligne
ne bascule qu'une fois tous ses fichiers copiés ; un échec de lecture la laisse sur sa source, et la
commande sort en échec. Les images responsives sont lues sur `conversions_disk` (c'est là que
`Filesystem::copyToMediaLibrary` les écrit).

**Tests** : `tests/Feature/Media/MediaDiskCollectionsTest.php` (5), `MediaMoveDiskTest.php` (7).
Ablations, toutes ROUGES :

| Ablation | Résultat |
|---|---|
| `MEDIA_PRIVATE_DISK=public` (l'ancien défaut) | `undeclared collection…` et `kyc document is not on the public disk` rouges — le KYC rougit sur `allFiles()` du disque public non vide |
| `Agency.logo` → `useDisk('public')` en dur | l'énumération rougit : `'logo' => 'other disk [public]'` |
| `media:move-disk` qui ignore conversions et responsives | 3 tests sur 7 rouges |
| copie par chemins (`copy($source->path(), $target->path())`) au lieu des flux, cible `RemoteDiskFake::install('r2-private')` | 4 tests sur 7 rouges : le disque distant simulé rend un `path()` relatif, comme S3 |
| `MEDIA_QUEUE=default` | `queued conversions go to the media queue` rouge |
| `version_urls => false` | `a media url carries its version` rouge |

**Tests existants** qui fakaient `public` (ou `media`, disque inexistant) en téléversant dans une
collection devenue privée : ils restaient VERTS, mais écrivaient dans le vrai
`storage/app/private` — **148 fichiers** relevés après un passage des 37 classes « médias ». Ils
fakent désormais les deux disques par `config()` ; zéro fichier écrit au second passage.

**Mission 4 : D-1 (défaut grave relevé par la revue adverse).** Le runbook d'origine, « `media:move-disk public r2-media` puis les privées vers `r2-private` », rangeait tout `public` dans le seau PUBLIC, pièces KYC comprises. La seconde commande ne trouvait ensuite plus rien à déplacer.

- **Nouveau mode `media:move-disk {from} --to-declared`.** Pour chaque ligne, la cible est le disque que **son modèle** déclare pour **sa** collection, lu par `getMediaCollection()`. La résolution suit celle de spatie à l'upload : `useDisk()`, sinon `media-library.disk_name` ; `storeConversionsOnDisk()`, sinon `media-library.conversions_disk_name`, sinon le disque de l'original. L'original et les conversions/responsives partent **séparément**, ce qui couvre la forme `Property.photos` = original privé + conversions publiques (TCK-539). Il n'y a aucune liste en dur. Une classe de modèle introuvable fait refuser la ligne.
  - *Pourquoi un drapeau et pas une nouvelle commande* : c'est la même copie en flux, la même idempotence et le même `--delete-source` ; seule la cible change. Avec `{to}` et `--to-declared` exclusifs l'un de l'autre, la forme sûre est à une option près de la forme dangereuse, et la forme dangereuse refuse maintenant par elle-même.
- **Mode explicite `{from} {to}`.** Le plan est calculé **en entier avant la première écriture**. Toute ligne dont le disque déclaré (original ou conversions) n'est pas `{to}` est refusée et listée, et la commande sort en échec sans rien écrire. `--force` passe outre, pour un cas délibéré.
- **Tests** (`MediaMoveDiskTest`, 11/11, `local`/`public` vers `RemoteDiskFake` `r2-private` **et** `r2-media`) :
  - le runbook fautif (`public r2-media` sans filtre, avec un KYC et un avatar sur `public`) échoue, liste le KYC, et n'écrit rien sur aucun seau ;
  - `--to-declared` envoie le KYC vers `r2-private`, l'avatar vers `r2-media` (conversions comprises), et un modèle de test `useDisk(privé)->storeConversionsOnDisk(public)` vers original = `r2-private` et conversions + responsives = `r2-media` ;
  - le second passage est idempotent ;
  - `--force` passe outre ;
  - `{to}` et `--to-declared` sont exclusifs ;
  - les 7 tests d'origine sont réécrits dans l'état réel d'une migration : configuration qui vise déjà les seaux, lignes encore sur les disques d'avant.
- **Ablation** : le contrôle du disque déclaré retiré, `test_the_faulty_runbook_is_refused_before_any_write` rougit ; restauré.
- ⚠ **Pour le runbook de TCK-541** : la migration complète est `media:move-disk public --to-declared` **puis** `media:move-disk local --to-declared`. Avant ce ticket, `BankStatement.statement` vivait sur `local`, et ce disque porte aussi les lignes privées créées entre-temps en développement.
