---
id: TCK-545
title: "Les photos d'état des lieux, de maintenance et le téléversement générique n'exposent plus l'URL directe d'un fichier privé"
status: done
phase: P1
family: back
estimate: S
wave: 67
created: 2026-09-21
updated: 2026-09-21
depends_on: [TCK-539]
blocks: [TCK-541]
spec_refs:
  features:
    - docs/features.md#27-médias--fichiers
  models:
    - docs/models-spec.md#spatielaravel-medialibrary
tags: [back, media, stockage, r2]
---

## Objectif utilisateur

Qu'une photo d'état des lieux ou de demande de maintenance s'affiche encore quand elle vit sur le
seau privé. Décision : [ADR-0029](../../adr/0029-medias-sur-r2-servis-par-cloudflare-transformations.md) §2-3.

## Contexte

Relevé le 2026-09-21 en implémentant TCK-539 (partie A). TCK-538 classe `Inventory` et
`MaintenanceRequest` en collections **privées** ; trois sites émettent pourtant encore
`$media->getUrl()` — l'URL directe du fichier, qu'aucun client ne peut ouvrir sur `r2-private`
(seau sans accès public) et qui, sur le disque `public` d'avant, était lisible par quiconque
devinait l'identifiant. Ils n'étaient pas dans le relevé de TCK-539.

| Où | Collection |
|---|---|
| `InventoryController.php` — `groupRoomPhotos()` et `uploadRoomPhotos()` | `room_photos` |
| `MaintenanceRequestService.php` — `addPhotos()` | `photos` (et la collection passée) |
| `MediaResource.php` via `MediaController::store()/upload()` | toute collection, publique **ou** privée |

## Delta à produire

Émettre `PrivateMediaAccess::signedUrl($media)` (route `media.private.show`, TCK-539) pour un média
d'un disque privé ; garder `getUrl()` pour un média du disque public. Pour `MediaResource`, la
décision se prend sur `$media->disk`, pas sur le nom de la collection.

## Critères d'acceptation

- [x] Aucun des trois sites ne rend `getUrl()` pour un média du disque privé — éprouvé sur
      `Tests\Support\RemoteDiskFake` (`r2-private`), l'URL rendue est une URL signée valide.
- [x] Un média du disque public garde son URL publique (témoin).
- [x] `./vendor/bin/pint` propre ; tests des classes touchées verts.

## Notes d'implémentation

- **Réutilise** `PrivateMediaAccess::signedUrl()` (TCK-539) : URL d'API signée à 30 min vers
  `media.private.show`, qui redirige vers une URL présignée du seau à 5 min. Aucun mécanisme neuf.
- **`MediaResource`** décide sur `$media->disk !== media-library.public_disk_name`. Pour un média
  privé, `url` est signée et **les trois `conversions` valent `null`** : la route signée ne sert que
  l'original. Seules `User.photos` et `User.documents` (HasMediaConversions) ont des conversions
  privées, et aucun écran ne les affiche. La branche publique, y compris la règle `viewRaw` de
  TCK-356, n'est pas modifiée. `MediaConversionTest` mesure désormais les URL de conversion sur
  `avatars` (publique), et plus sur `photos` devenue privée : l'assertion est la même, sur une
  collection où elle a un sens.
- **Inventaire / maintenance** : `signedUrl()` inconditionnel. Ces collections sont déclarées
  privées, et `MediaDiskCollectionsTest` épingle cette déclaration.
- **PDF d'état des lieux** : `App\Services\Media\PdfImageEmbedder`. Il lit par le disque la
  conversion `preview` (puis `thumbnail`) si elle existe, sinon l'original en flux, réduit à 600 px
  et encodé en JPEG à 70. Le résultat est embarqué en URI `data:`. Une photo illisible ou qui n'est
  pas une image est omise et journalisée ; le PDF signé est quand même produit.
- **Front** (lu) : les seuls consommateurs sont `uploadAgencyLogo` (logo, public) et les hooks
  d'upload d'inventaire et de maintenance, dont la réponse est typée `unknown`. Aucun champ lu ne
  change de sens.
- **Tests** : `tests/Feature/Media/MediaDiskPrivatePhotosTest.php` (7), sur
  `RemoteDiskFake::install('r2-private')`. Ablations, toutes rouges :

| Ablation | Résultat |
|---|---|
| Inventaire (PDF et upload) remis sur `getUrl()` | 2 rouges |
| Maintenance remise sur `getUrl()` | 1 rouge |
| `MediaResource::isPrivate()` → `false` | le test d'upload générique privé rougit, le témoin public reste vert |
| `PdfImageEmbedder::CONVERSIONS = []` | le test de préférence de conversion rougit |

- **Documents publiés d'un bien (mission 3, décision de la session)** : route publique **stable**
  `GET /api/public/properties/{property}/documents/{document}/file`
  (`public.properties.documents.file`, groupe `throttle:public-read`, sans authentification,
  `whereNumber`), servie par `Public\PublicPropertyDocumentController`. L'autorisation est l'état,
  relu à chaque appel :
  1. le bien est publiquement visible, via `Property::query()->public()`, la règle de la fiche ;
  2. le document appartient à ce bien, via `$bien->documents()->whereKey()` ;
  3. `metadata.public` est vrai, le même filtre que `buildDocuments()`.

  Ensuite `PrivateMediaAccess::redirect()` renvoie vers une URL présignée de 5 min. Tout échec rend
  **404**, pour ne pas révéler l'existence d'un document non publié. Seul `buildDocuments()` a été
  modifié dans `PropertyResource`, par une seule modification sur une chaîne précise : `url` y
  devient `route('public.properties.documents.file', …)`. Pour le front, `href={doc.url}`
  (`PropertyDocuments.tsx:46`) ouvre toujours le fichier : aucun changement de sens.
  - **Pourquoi une URL stable** : une URL signée de 30 min resterait figée dans une page publique.
    Mesure du cache : `CataloguePublicCacheTest` établit que la fiche **refuse** `Cache-Control:
    public` (TCK-341), et le `fetch` de Next est en `no-store`. L'API ne met donc pas la fiche en
    cache aujourd'hui. Mais le HTML servi, les robots et les liens partagés gardent l'URL, et une
    URL stable ne dépend d'aucune de ces conditions.
  - Tests : `tests/Feature/Media/MediaDiskPublicDocumentTest.php` (6), sur `RemoteDiskFake`.
    Redirection présignée ; la fiche publique lie la route stable ; 404 pour un document non
    publié, pour un document d'un autre bien, pour un bien non public ; décocher « public »
    révoque l'accès immédiatement. Liés : `PropertyDetailTest`, `CataloguePublicCacheTest` et
    `DocumentTest`, 26/26.
  - Ablations : sans la vérification de `metadata.public`, 2 tests rouges (document non publié,
    révocation) ; sans `->public()`, 1 rouge (bien non public). Les deux ont été restaurées, et la
    restauration vérifiée par grep.

