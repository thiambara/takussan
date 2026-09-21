---
id: TCK-539
title: "Aucun code ne suppose plus qu'un média est un fichier local : KYC, versions de documents, liens de partage, relevés bancaires, filigrane"
status: done
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

- [x] Chaque chemin du tableau lit par `Storage::disk($media->disk)` (flux, ou copie temporaire
      nettoyée quand une bibliothèque exige un chemin), jamais par `getPath()`.
- [x] Le filigrane lit la conversion depuis son disque, l'écrit dans un fichier temporaire, la
      réécrit sur le **même** disque et le même chemin ; le logo de l'agence est lu par son disque.
- [x] Chaque chemin est éprouvé par un test sur un disque **distant simulé** (`Storage::fake` d'un
      disque nommé comme en production, `r2-private` / `r2-media`) — un test sur `local` ne prouve
      pas l'indépendance au disque.
- [x] Aucune ressource API n'expose l'URL directe d'un fichier privé ; l'accès passe par une route
      autorisée qui redirige vers une URL présignée (5 min) ou sert le flux.
- [x] Une garde (test ou `scripts/check-*.mjs`) refuse tout nouvel appel à `->getPath(` sur un
      média dans `app/` hors d'une liste d'exceptions justifiées.
- [x] `./vendor/bin/pint` propre ; tests des classes touchées verts.

## Notes d'implémentation

### Partie A (tck539a)

- **Un seul point de sortie : `App\Services\Media\PrivateMediaAccess`.** Il ne connaît que
  `Storage::disk($media->disk)` et `getPathRelativeToRoot()` — jamais `getPath()`, jamais
  `getFullUrl()`/`getTemporaryUrl()` de Spatie (ces deux-là passent par `CdnUrlGenerator`, qui
  réécrirait une URL privée vers le CDN si celui-ci était un jour réactivé).
- **Flux ou présignature, choisi par chemin :**
  - KYC → **flux**. Pièce d'identité : une URL présignée est un droit au porteur que la
    déconnexion ne révoque pas ; le fichier est petit.
  - Lien de partage public → **flux**. Chaque lecture doit repasser par `recordDownload`, sinon
    la présignature se rejouerait 5 minutes hors du plafond `max_downloads`.
  - Téléchargement d'une version → **redirection présignée** 5 min (`attachment`) : appelant
    authentifié, autorisation jugée, fichier potentiellement lourd.
  - Relevé bancaire → **copie temporaire** (`withLocalCopy`) : League\Csv et l'OFX exigent un
    chemin. Le parseur est un générateur : il est consommé EN ENTIER dans le rappel, sinon il
    lirait après la suppression.
- **Les ressources émettent une route signée, pas une présignature :** `GET /api/media/{media}/file`
  (`media.private.show`, middleware `signed`, **hors `auth:sanctum`**), 30 min, qui redirige vers
  la présignature de 5 min (`inline`). Hors Sanctum parce que le front authentifie par `Bearer`
  (`takussan-web/src/lib/api.ts`), qu'un `<a href>` ou le `<object data>` de `PdfViewer` n'envoient
  pas. La notification de remboursement signe pour 7 jours (lien de courriel).
  Un disque qui ne sait pas présigner (`public`) est servi en flux plutôt qu'en erreur.
- ⚠ **`Storage::fake('r2-private')` ne prouve PAS l'indépendance au disque.** C'est un disque
  LOCAL : `getPath()` y marche. Mesuré : `KycDocumentController` remis dans son état d'origine,
  les 11 cas de `KycDocumentAccessTest` restent verts sous `Storage::fake('r2-private')`.
  `Tests\Support\RemoteDiskFake` rend `path()` relatif comme S3 ; sous lui, le même retour
  arrière rougit 3 cas sur `The file "6/cni.pdf" does not exist`.
- **Ablations** (chaque correctif remis à son état `HEAD`, sur `RemoteDiskFake`) : KYC 3 rouges ;
  lien de partage 1 rouge (`file_get_contents(1/bail.pdf)`) ; relevé bancaire 11 rouges (500) ;
  `DocumentResource`, `DocumentVersionResource`, `AgencyUpgradeRequestController`,
  `DepositRefundService`, `LeaseDepositRefundNotification` 1 rouge chacun ; téléchargement de
  version 1 rouge (présignature de 15 min au lieu de 5). Garde : `getPath()` rétabli dans le
  contrôleur KYC → sortie 1 ; exception permanente rendue morte → sortie 1.
- **Hors relevé, ouvert en TCK-545** : `InventoryController` (`room_photos`),
  `MaintenanceRequestService::addPhotos()` et `MediaResource` rendent encore `getUrl()` sur des
  collections que TCK-538 classe privées. L'AC « aucune ressource n'expose l'URL directe » reste
  donc décoché.

### Partie B (tck539b) — reportée par la session depuis les notes de l'agent

#### Relevés
- Front : `MediaManager.tsx:470` affiche `item.thumbnail` juste après l'upload (`PropertyMediaPanel.tsx` relit la liste après `uploadPropertyPhotosAction`). `thumbnail` doit donc rester synchrone. `preview`/`full` sont lus par la fiche publique (`PropertyGalleryMosaic`, `PropertyMobileGallery` : `photo.full`) et `main_photo_url` (preview).
- `HasMediaConversions` (User uniquement) : conversions lues seulement par `MediaResource`, qui rend `null` pour une conversion non générée. Le front ne lit pas `conversions.*` (grep). Les avatars sont servis en original (`getFirstMediaUrl('avatar')`).
- Spatie `PerformConversionAction` : `copyToMediaLibrary` → `markAsConversionGenerated` (save) → `ConversionHasBeenCompletedEvent`. L'événement se déclenche en synchrone comme en file.
- `version_urls` : `?v={updated_at->timestamp}`, à la SECONDE. Un `save()` dans la même seconde que l'écriture de la conversion nue ne change pas l'URL.
- worker-media = un seul processus `queue:work` (compose.api.yml:61) : les jobs d'un même média s'exécutent en série aujourd'hui.

#### Course découverte (régénération)
_État d'alors : le job d'agence faisait lui-même le travail. Il ne fait plus que répartir depuis V5-1 (voir la fin de ces notes)._
RegenerateAgencyWatermarksJob et MediaRegeneratePropertyConversions : purge de la trace → `media-library:regenerate` → envoi explicite d'ApplyWatermarkJob ×3. Avec preview/full en file, l'AWJ explicite peut passer AVANT PerformConversionsJob : il filigrane l'ANCIEN fichier (double filigrane) et le marque ; la conversion réécrit ensuite un fichier nu, que l'AWJ du listener saute. → conversion publique nue.

#### Faux distant
`Storage::fake('r2-media')` est un disque LOCAL : `getPath()` y marche → une ablation resterait verte. Utilisé : `Tests\Support\RemoteDiskFake::install('r2-media')` (écrit par tck539a), `path()` relatif comme S3. Précondition affirmée dans le test : `assertFileDoesNotExist($media->getPath('thumbnail'))`.

#### Ablations (ApplyWatermarkJobTest, WatermarkServiceTest) — toutes rouges, puis restauré vert
- A1 rétablir `getPath()` + `file_exists` + `apply($path)` dans le job → 2 rouges (in place ; URL versionnée). Le test d'idempotence reste vert sous A1 (vacuité : rien n'est écrit), c'est le test « in place » qui garde.
- A2 logo par `getFirstMediaPath('logo')` + `file_exists` → rouge `agency logo is read from its remote disk`.
- A3 retirer `nextVersion()` (save() simple, horloge figée à la seconde) → rouge `watermarking changes the versioned url within the same second`.
- A4 retirer le `delete()` du répertoire temporaire → rouge (assertion `glob(tmp) === []`).
- A5 réécrire sur `local` au lieu de `conversions_disk` → rouge.
- A6 service qui ignore le logo → rouge `logo bytes are drawn into the watermark` (écart 0 ; 0,627 mesuré avec logo).
- B1 (RegenerateAgencyWatermarksJobTest) rétablir l'envoi explicite d'ApplyWatermarkJob après `media-library:regenerate` → rouge `job leaves the watermark to the conversion event`.
- B2 retirer la purge de `watermarked_conversions` → rouge `regenerating with unchanged settings watermarks each conversion exactly once` (conversions réécrites nues, job du listener sauté).
- B3 job de filigrane par `getPath()` → rouge `changing logo then running job uses new logo` (sur disque distant).
- Mesure : GD est déterministe ici — régénérer à réglages inchangés rend les MÊMES octets pour les 3 conversions (c'est ce qui rend l'assertion « exactement une fois » possible).

#### Décision conversions
- Property : `thumbnail` nonQueued ; `preview`, `full` → `queued()` (file `media`, worker-media).
- HasMediaConversions (User) : idem.
- Conséquence relevée : l'instance `$media` rendue par `addMedia()` ne voit PAS les conversions en file (le job travaille sur une copie désérialisée) → `hasGeneratedConversion('full')` faux sur l'instance ; un `save()` de cette instance ÉCRASE `generated_conversions` avec sa version périmée. Les tests PropertyMediaConversionsTest qui modifiaient `$media` sans `refresh()` étaient rouges pour cette raison.

#### Conditions de team-lead (commande accordée) — 2026-09-21
Test ajouté : `RegenerateAgencyWatermarksJobTest::test_regeneration_with_queued_conversions_watermarks_each_conversion_exactly_once`, alimenté par un data provider (voie `RegenerateAgencyWatermarksJob` + voie `media:regenerate-property-conversions`). `Queue::fake()`, puis les jobs capturés sont vidés par une vraie `SyncQueue` (sérialisation comme sur un worker), dans l'ORDRE LE PLUS DÉFAVORABLE : à chaque tour, les `ApplyWatermarkJob` passent avant `PerformConversionsJob` et les listeners. Assertions : les octets des 3 conversions sont identiques à ceux de l'upload (filigrane unique), et la trace contient les 3.
- E1 envoi explicite rétabli dans le JOB → rouge (voie job). Mesure : thumbnail identique ; preview ET full DIFFÉRENTS de la version filigranée une fois. Ces deux conversions ont été réécrites nues après que le job explicite eut filigrané puis marqué l'ancien fichier, déjà filigrané.
- E2 envoi explicite rétabli dans la COMMANDE → rouge (voie commande).
- E3 purge déplacée APRÈS regenerate (job) → nouveau test VERT. En tout-asynchrone, la purge précède de toute façon l'exécution des jobs, donc ce test ne garde pas l'ordre. Ce sont les tests synchrones qui le gardent : rouges `changing logo then running job uses new logo` et `regenerating with unchanged settings … exactly once`, parce que la miniature, régénérée en ligne, est sautée par la trace encore pleine.
- E3' même ablation dans la COMMANDE → rouge `PropertyMediaConversionsTest::test_regeneration_watermarks_every_conversion_again`.
- Purge vérifiée AVANT `Artisan::call('media-library:regenerate')` dans les deux fichiers, après restauration.

#### Mission 2 — repli full → preview → thumbnail → null (2026-09-21)
- Helper partagé : `app/Services/Media/PublicPhotoUrl::upTo(Media, 'full'|'preview'|'thumbnail'): ?string`. Il descend la chaîne `['full','preview','thumbnail']` selon `hasGeneratedConversion()`, ne remonte jamais, ne rend jamais l'original, et rend `null` en bout de chaîne. Un test garde que la chaîne = `Property::watermarkedConversions()`.
- Branché dans : `PropertyResource` (urlFor, originalUrlFor, full, main_photo_url ; `largestPublicConversion` supprimée), `PropertyMediaController` (index + store, `refresh()` dans store, méthode `urls()` commune), `PublicPropertyController::conversation` (main_photo_url), `PropertyMapGeoJsonResource` (thumbnail : synchrone, mais `getFirstMediaUrl()` ne vérifiait pas la conversion).
- ⚠ RELEVÉ FRONT (lecture seule) qui contredit en partie la consigne « le front gère déjà null » :
  - `main_photo_url` : oui. `PropertyPhoto.tsx:27` → `bg-muted` « Photo à venir » ; `ConversationList.tsx:121`, `ChatView.tsx:301`, `PropertyDraftChatView.tsx:128` testent la valeur avant de l'utiliser.
  - `photos[].full` : NON. `PropertyGalleryMosaic.tsx:31` et `PropertyMobileGallery.tsx:64` passent `photo.full` directement à `next/image`, et `types/property.ts:98` le type en `string`. Un `null` y ferait planter le rendu.
  → Décision : dans `PropertyResource.photos`, une photo SANS AUCUNE conversion est RETIRÉE de la liste, plutôt que d'y entrer avec `full: null`. Elle revient dès que `thumbnail` existe, donc en pratique dès l'upload, puisque la conversion est synchrone. La console (`PropertyMediaController`) garde la photo avec des `null` : le propriétaire doit pouvoir la supprimer, et `MediaManager` fait un `<img src>` brut (image vide, pas de plantage).
- Tests : `tests/Feature/Media/PublicPhotoUrlTest.php` (9 tests). Disque `r2-media` distant (RemoteDiskFake) et `Queue::fake()`, pour reproduire l'état entre l'upload et le passage du worker. Chaque URL rendue est vérifiée sur le disque (`exists`).
- Ablations, toutes rouges puis restaurées :
  - M1 urlFor → `getUrl($conversion)` : 2 rouges.
  - M2 service qui rend l'original en bout de chaîne : 3 rouges.
  - M3 store sans `refresh()` : rouge `upload response serves full when conversions ran during the request`. Sous `Queue::fake()`, le `refresh` est invisible : la miniature, synchrone, est marquée sur la même instance. Seule une file synchrone le révèle.
  - M4 sans filtre des photos vides : 1 rouge.
  - M5 conversation `getUrl('preview')` : 1 rouge.
  - M6 carte `getUrl('thumbnail')` : 1 rouge.
  - M7 console, ancien `fullUrl` : 2 rouges.
  - M8 `originalUrlFor` → `getUrl()` : 2 rouges.
- Voisinage : 494 tests verts (tests/Feature/Media, Unit/Media, PropertyMediaTest, PropertyResourceRawFlagTest, PropertyDuplicationTest, tests/Feature/Public, Unit/Http/Resources, RegenerateWatermarksEndpointTest), 72 s, load average 4,3. `check-media-getpath.mjs` : exit 0.

#### Passe 5 — V5-1 : régénération d'agence découpée par photo (2026-09-21)
- **Défaut.** `RegenerateAgencyWatermarksJob` faisait tout le travail, sans `$timeout` propre. Au délai du worker (60 s par défaut, `pcntl` actif), le processus était tué, et chaque rejeu repartait du premier bien (`orderBy('id')`). Une agence trop longue ne finissait donc jamais. Au dernier rejeu, le worker appelait `failed()` sans que `handle()` ait retiré une seule exemption, et les photos restaient servies NUES indéfiniment. Le journal de `failed()` affirmait l'inverse.
- **`RegenerateAgencyWatermarksJob` ne fait plus que répartir.** Il lit les photos des biens de l'agence (`lazyById(500)`) et met en file un `RegeneratePhotoConversionsJob` par photo. J'ai découpé par photo plutôt que par bien, parce que rien ne limite le nombre de photos d'un bien (aucune règle `max` sur `photos`).
- **`RegeneratePhotoConversionsJob`** (nouveau) :
  - `createDerivedFiles` pour une seule photo ;
  - `catch (Throwable)`, puis `WatermarkTrace::failClosed()`, puis relance de l'exception : la photo est cachée dès la première tentative en échec ;
  - `tries = 3`, `backoff = [30, 120]`.
- **`$timeout = 75` sur les deux jobs**, strictement sous `retry_after` (90 s, `config/queue.php`). Au-delà, la file redonnerait le job à un second worker pendant qu'il tourne encore. `RegenerationTimeoutTest` compare les deux valeurs, lues de la classe et de la config. ⚠ Il ne lit que la config de TEST : la valeur déployée se relève dans Dokploy (TCK-541).
- **`failed()` fait le fail-closed de SON périmètre, sans supposer que `handle()` a tourné.**
  - Job de photo : `failClosed()` sur sa photo. Si le média a été supprimé, il écrit un `warning` et s'arrête.
  - Job d'agence : si l'agence exige le filigrane, il retire les exemptions de toutes ses photos (`WatermarkTrace::withdrawExemptions()`, nouvelle méthode extraite de `failClosed()`), puis écrit un journal (`agency_id`, `watermark_required`, `exemptions_withdrawn`, `withdrawal_failures`, `exception`) qui invite à relancer `--untraced`.
  - Les conversions FILIGRANÉES ne sont jamais retirées.
- **Inchangés** : `AgencyObserver` (mise en file à la transition false→true, `afterCommit`), la commande de régénération (synchrone), le listener `FailClosedWhenConversionsJobFails`.
- **Tests** (`RegenerationFailureTest`) :
  - `test_f` pour les deux jobs, par `CallQueuedHandler::failed()` avec une `MaxAttemptsExceededException` : photo cachée, journal présent, puis `--untraced` la rattrape ;
  - K3b : filigranée intacte, plus le cas mixte ;
  - K4 : une `Error` levée par la conversion ;
  - K6 : listener, média supprimé avant l'événement.
- **Ablations** : 11, toutes rouges, md5 restauré (T1, T2, F1, F2, D1, D2, K3b, K3, K4, K6 ; détail dans le rapport de passe).
- **Reste** : entre une tentative expirée et la dernière, une photo exemptée reste servie nue, comme avant tout passage du job. C'est borné à quelques minutes ; consigné dans TCK-547.
