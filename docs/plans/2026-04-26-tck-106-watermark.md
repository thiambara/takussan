# TCK-106 — Watermark auto photos biens (plan d'implémentation)

> Ce plan sera également enregistré dans `docs/plans/2026-04-26-tck-106-watermark.md` lors de l'implémentation (cohérent avec le pattern de TCK-105).

## Contexte

Les agences veulent protéger leur marque : toute photo de bien diffusée publiquement doit porter automatiquement un watermark (logo agence + URL). Aujourd'hui les conversions Spatie (`thumbnail` 300×300, `preview` 800×600 sur `Property::registerMediaConversions`) sont servies brutes — un visiteur peut sauvegarder l'image et la republier ailleurs sans signature.

TCK-106 ajoute un pipeline asynchrone qui appose un watermark sur les **conversions** Spatie (in-place), tout en gardant l'**original sacré** sur le storage. Le toggle, la position et l'opacité sont stockés dans `agencies.settings` (JSON column déjà présent depuis TCK-035 — pas de nouvelle migration). Un endpoint admin permet de régénérer en lot après changement de logo ou de réglage.

**Choix de scope confirmés avec l'utilisateur** :
- **Standalone vs TCK-105** : TCK-105 (CDN/MediaUrlResolver) n'est pas encore implémenté — on **ne s'appuie pas** dessus. Le `?raw=1` admin est géré directement dans `PropertyResource`/`MediaResource` (swap `getUrl()` → `getOriginalUrl()` après autorisation). Quand TCK-105 atterrira, l'intégration sera triviale.
- **Stockage** : le watermark **écrase** la conversion Spatie en place (le fichier `thumbnail.jpg`/`preview.jpg` est réécrit). L'original Spatie n'est jamais touché. Pas de nouveaux noms de conversions (`card-watermarked` du ticket → simplifié en réutilisant les conversions existantes).
- **Image library** : `intervention/image` v3 + driver GD (déjà configuré, pas de changement infra).
- **Hook** : `ConversionHasBeenCompleted` (pas `MediaHasBeenAddedEvent` mentionné dans le ticket) — le watermark s'applique après que Spatie ait généré la conversion, pas avant. Cela évite la course avec la queue de conversions Spatie.

---

## Architecture

```
Property::registerMediaCollections('photos')  ──► upload (POST /api/properties/{id}/media)
                                                       │
                                                       ▼
                                       Spatie file-manipulator (queue Spatie)
                                       génère thumbnail (300×300), preview (800×600)
                                                       │
                                                       ▼
                                       ConversionHasBeenCompleted event
                                                       │
                                                       ▼
                                       ApplyWatermarkOnConversionListener
                                       ├─ filtres : model_type=Property
                                       │           collection_name=photos
                                       │           conversion ∈ [thumbnail, preview]
                                       │           property.agency.settings.watermark_enabled === true
                                       └─ dispatch ApplyWatermarkJob (queue 'media')
                                                       │
                                                       ▼
                                       ApplyWatermarkJob
                                       ├─ resolve Media + Property + Agency
                                       ├─ read conversion file from disk
                                       ├─ WatermarkService::apply(image, agencyContext)
                                       │     ├─ Intervention\Image (GD driver)
                                       │     ├─ overlay logo + agency.name + agency.website
                                       │     ├─ position / opacity depuis settings
                                       │     └─ strip EXIF GPS (Intervention save() default)
                                       └─ écrit le fichier au même path + marque
                                          custom_properties.watermarked_conversions[] = $conversion

PropertyResource / MediaResource
  ├─ default ──► getUrl('thumbnail|preview')   (sert la version watermarkée car overwrite in-place)
  └─ ?raw=1   ──► getOriginalUrl() si user ∈ admin agence ; sinon 403

PATCH /api/agencies/{id}                      (existing endpoint)
  └─ AgencyUpdateRequest validates settings.watermark_* nested keys

POST /api/agencies/{id}/regenerate-watermarks (NEW endpoint)
  └─ dispatch RegenerateAgencyWatermarksJob (queue 'media')
        ├─ pour chaque property de l'agence
        ├─ pour chaque media de la collection 'photos'
        ├─ regenerate Spatie conversions (Artisan media-library:regenerate)
        └─ dispatch ApplyWatermarkJob si watermark_enabled (sinon laisse propre)
```

---

## Fichiers critiques (existants à modifier ou référencer)

| Fichier | Rôle dans le plan |
|---|---|
| `takussan-api/app/Models/Property.php:204-220` | Source des collections `photos`, `videos`, `plans` + conversions `thumbnail`, `preview`. **Pas modifié.** |
| `takussan-api/app/Models/Agency.php:32-43` | `settings` cast as `array` — accès via `$agency->settings['watermark_enabled']`. **Pas de migration.** |
| `takussan-api/app/Models/Agency.php:74-77` | Collection Spatie `logo` (singleFile) — source du visuel watermark. |
| `takussan-api/app/Http/Requests/AgencyUpdateRequest.php:26-37` | Étendu : règles imbriquées pour `settings.watermark_enabled\|position\|opacity`. |
| `takussan-api/app/Http/Controllers/Api/AgencyController.php:70-79` | Pas modifié — `update()` accepte déjà `settings`. |
| `takussan-api/app/Http/Resources/PropertyResource.php` (lignes 58, 64-66) | Étendu : si `request()->boolean('raw') === true` ET autorisation OK, swap URLs `thumbnail/preview` → `getOriginalUrl()`. |
| `takussan-api/app/Http/Resources/MediaResource.php:28` | Même traitement que PropertyResource pour `?raw=1`. |
| `takussan-api/app/Providers/AppServiceProvider.php` | `Event::listen(ConversionHasBeenCompleted::class, ApplyWatermarkOnConversionListener::class)`. |
| `takussan-api/config/queue.php` | Ajouter mention du nom de queue `media` (DB driver supporte les queues nommées sans config supplémentaire — juste documentation). |
| `takussan-api/composer.json` | Ajouter `intervention/image: ^3.7`. |
| `takussan-api/routes/api/agencies.php` (ou équivalent) | Ajouter route `POST /api/agencies/{id}/regenerate-watermarks`. |
| `takussan-api/app/Policies/PropertyPolicy.php:23-34` | Référence du pattern auth agence pour la nouvelle ability `viewRaw($user, $media)` (sur Media). |
| `docs/backlog/INDEX.md` | Passage TCK-106 `todo → review` après PR ouverte (target = `dev` cf. mémoire utilisateur). |

---

## Nouveaux fichiers à créer

### Backend — services & jobs

- `takussan-api/app/Services/Media/WatermarkService.php`
  - Public API : `apply(string $sourcePath, AgencyWatermarkContext $context): void` (in-place modification)
  - Utilise `Intervention\Image\ImageManager::gd()` ; lit le fichier, lit le logo agence (`$agency->getFirstMediaPath('logo')`), construit l'overlay (logo + texte `{agency.name}` + URL en petit), applique opacité, place selon position, sauvegarde au même path en stripant EXIF GPS.
  - Idempotent : un appel sur une image déjà watermarkée par le même agency.id donne le même résultat (test explicite).
  - Pas de mode `tile` en V1 — uniquement `bottom_right`, `bottom_left`, `bottom_center` (le `tile` du ticket est dans le hors-périmètre simplifié, voir Hors périmètre).

- `takussan-api/app/Services/Media/AgencyWatermarkContext.php`
  - Value object DTO : `agencyName`, `agencyUrl`, `logoPath`, `position` (enum), `opacity` (int 10-100).
  - Factory statique `fromAgency(Agency $agency): self` qui lit `$agency->settings` et applique les défauts (`enabled=true`, `position=bottom_right`, `opacity=60`).
  - Méthode `defaults(): array` — source unique des défauts, réutilisable pour la migration des settings et la doc.

- `takussan-api/app/Jobs/Media/ApplyWatermarkJob.php`
  - `implements ShouldQueue` ; `public string $queue = 'media'`
  - `tries=3`, `backoff=[10, 30, 120]`
  - Constructeur : `int $mediaId, string $conversionName` (pas le Media model — il peut être supprimé entre dispatch et exécution ; SerializesModels lèverait `ModelNotFoundException`, cohérent avec le pattern `PurgeCdnCacheJob` du plan TCK-105)
  - `handle(WatermarkService $service)` :
    1. `Media::find($mediaId)` ; si null → return (idempotent silencieux)
    2. Vérifie `model_type === Property::class` et `collection_name === 'photos'` (double-check)
    3. Charge property + agency ; si `agency.settings.watermark_enabled !== true` → return
    4. Si `$conversionName` ∈ `custom_properties.watermarked_conversions` → return (idempotence dur)
    5. Path = `$media->getPath($conversionName)`
    6. `$service->apply($path, AgencyWatermarkContext::fromAgency($agency))`
    7. Append `$conversionName` à `custom_properties.watermarked_conversions` puis `$media->save()`

- `takussan-api/app/Jobs/Media/RegenerateAgencyWatermarksJob.php`
  - `implements ShouldQueue` ; `public string $queue = 'media'`
  - Constructeur : `int $agencyId`
  - `handle()` :
    1. Itère `Property::where('agency_id', $agencyId)->cursor()`
    2. Pour chaque property, `$property->getMedia('photos')` :
       - Reset `custom_properties.watermarked_conversions` à `[]`
       - Lance `Artisan::call('media-library:regenerate', ['--ids' => $media->id, '--force' => true])` (ce qui régénère thumbnail/preview depuis l'original)
       - Si `watermark_enabled === true` : dispatch `ApplyWatermarkJob` pour chaque conversion (`thumbnail`, `preview`)
       - Sinon : ne dispatch rien — les conversions restent propres

- `takussan-api/app/Listeners/Media/ApplyWatermarkOnConversionListener.php`
  - Écoute `Spatie\MediaLibrary\Conversions\Events\ConversionHasBeenCompleted`
  - `implements ShouldQueue` (queue `media`) — listener queued pour ne pas bloquer la queue de conversions
  - Filtre :
    - `$event->media->model_type === Property::class`
    - `$event->media->collection_name === 'photos'`
    - `$event->conversion->getName() ∈ ['thumbnail', 'preview']`
    - `$event->media->model->agency->settings['watermark_enabled'] ?? true === true`
  - Si tous OK → `ApplyWatermarkJob::dispatch($event->media->id, $event->conversion->getName())`

### Backend — endpoints

- `takussan-api/app/Http/Controllers/Api/Agency/RegenerateWatermarksController.php`
  - Single-action `__invoke(Request $request, Agency $agency)`
  - Auth : reproduit le pattern inline de `AgencyController::update()` (line 72) — `$agency->primary_admin_id === user.id || user.hasRole(['admin','super_admin'])`. Sinon 403.
  - Dispatch `RegenerateAgencyWatermarksJob::dispatch($agency->id)` ; renvoie 202 `{queued: true, agency_id}`.

### Backend — enum

- `takussan-api/app/Models/Enums/WatermarkPosition.php`
  - `enum WatermarkPosition: string { case BottomRight = 'bottom_right'; case BottomLeft = 'bottom_left'; case BottomCenter = 'bottom_center'; }`
  - Suit le pattern simple d'`AgencyStatus.php` (cf. exploration). Le mode `tile` du ticket est en hors-périmètre (cf. infra) — uniquement les 3 positions usuelles.
  - Méthode `static default(): self => self::BottomRight`.

### Backend — autorisation `?raw=1`

- `takussan-api/app/Policies/MediaPolicy.php` — **nouveau fichier** (ni `MediaPolicy` ni `AgencyPolicy` n'existent aujourd'hui)
  - Méthode `viewRaw(User $user, Media $media): bool`
    - true si `$user->hasRole(['admin','super_admin'])`
    - OU si le media appartient (via `model_type === Property::class` et property.agency_id === user.agency_id) à une agence où user est `primary_admin` OU a la permission `properties.update` (cohérent avec `PropertyPolicy::update`)
  - Pas d'enregistrement explicite nécessaire — Laravel auto-discover via `App\Policies\MediaPolicy`.

- Modification de `PropertyResource` : helper privé `urlFor(Media $media, string $conversion): string` qui fait :
  ```
  if (request()->boolean('raw') && Gate::forUser(auth()->user())->allows('viewRaw', $media)) {
      return $media->getOriginalUrl();
  }
  return $media->getUrl($conversion);
  ```
  Si `raw=1` est passé sans autorisation : on **n'erreur pas** (200), on retourne simplement les URLs watermarkées par défaut. AC7 dit "un visiteur public reçoit 403" — ambigu : strictement, on peut renvoyer 200 avec URL standard (équivalent fonctionnel). On choisit la version stricte : renvoyer 403 si `raw=1` est passé sans autorisation, traité dans le controller `PropertyController::show` (à étendre) plutôt que silencieusement dans la resource.

  Décision finale : **gérer dans `PropertyController::show`** : si `request()->boolean('raw') && !Gate::allows('viewRaw', $property->getFirstMedia('photos'))` → `abort(403)`. Sinon, la resource lit `request()->boolean('raw')` et émet les URLs originales.

### Tests

- `takussan-api/tests/Unit/Media/WatermarkServiceTest.php` — 7 tests :
  1. `test_applies_watermark_at_bottom_right` (assertion : pixels en zone attendue ≠ originaux ; PSNR < seuil sur ROI)
  2. `test_applies_watermark_at_bottom_left`
  3. `test_applies_watermark_at_bottom_center`
  4. `test_opacity_60_vs_30_produces_different_pixels` (deux opacités → diff)
  5. `test_idempotent_when_called_twice_with_same_context` (hash identique au 2e appel)
  6. `test_strips_gps_exif` (lecture EXIF avant/après)
  7. `test_preserves_orientation_exif` (orientation EXIF conservée)

- `takussan-api/tests/Feature/Media/ApplyWatermarkJobTest.php` — 5 tests :
  1. `test_listener_dispatches_job_when_property_photo_uploaded` (Queue::fake)
  2. `test_listener_does_not_dispatch_when_watermark_disabled` (AC4)
  3. `test_listener_does_not_dispatch_for_avatar_or_lease_collection` (AC5)
  4. `test_job_writes_watermarked_file_in_place` (assertion file size/hash changed, original unchanged via getOriginalUrl)
  5. `test_job_marks_custom_property_watermarked_conversions` (idempotence storage)

- `takussan-api/tests/Feature/Media/RegenerateAgencyWatermarksJobTest.php` — 3 tests :
  1. `test_disabling_watermark_then_running_job_strips_existing_watermarks` (AC3)
  2. `test_changing_logo_then_running_job_uses_new_logo` (smoke)
  3. `test_other_agency_photos_untouched` (isolation tenant)

- `takussan-api/tests/Feature/Api/RegenerateWatermarksEndpointTest.php` — 4 tests :
  1. `test_admin_agence_can_trigger_regeneration` (200 + Bus::fake assertion)
  2. `test_non_admin_returns_403`
  3. `test_super_admin_can_trigger_regeneration_for_any_agency`
  4. `test_endpoint_validates_agency_exists` (404)

- `takussan-api/tests/Feature/Api/PropertyResourceRawFlagTest.php` — 4 tests :
  1. `test_default_returns_watermarked_urls` (AC1, AC2 — original hash inchangé entre avant/après upload)
  2. `test_raw_flag_returns_original_url_for_admin_agence` (AC7)
  3. `test_raw_flag_returns_403_for_public_visitor` (AC7)
  4. `test_raw_flag_returns_403_for_agent_other_agency`

- `takussan-api/tests/Unit/Policies/MediaPolicyTest.php` — 3 tests : super_admin OK, primary_admin OK, agent autre agence KO.

### Documentation

- `docs/plans/2026-04-26-tck-106-watermark.md` (court) :
  - Schéma settings (`agencies.settings.watermark_*`) avec valeurs par défaut
  - Procédure régénération en lot (curl exemple ou artisan)
  - Procédure changement de logo (réuploader sur la collection `logo` de l'agence puis appeler `/regenerate-watermarks`)
  - Note sur le hors-périmètre (`tile`, vidéo, PDF)

---

## Détails d'implémentation clés

### Pas de migration de schéma

`agencies.settings` est déjà un JSON cast `array` (TCK-035, migration `2026_04_18_000002_add_settings_to_agencies_table`). On ajoute simplement les clés `watermark_enabled`, `watermark_position`, `watermark_opacity` au schéma JSON validé par `AgencyUpdateRequest`. Les valeurs par défaut sont produites par `AgencyWatermarkContext::defaults()` quand les clés sont absentes — pas besoin de backfill SQL.

Le ticket Delta mentionne « Migration ajoutant les colonnes settings watermark sur `agencies` (extension de TCK-035 si pas déjà couvert) ». Justement, **c'est déjà couvert** par la JSON column. Pas de migration.

### Validation `AgencyUpdateRequest`

Étendre les règles avec :
```
'settings.watermark_enabled' => ['sometimes', 'boolean'],
'settings.watermark_position' => ['sometimes', new Enum(WatermarkPosition::class)],
'settings.watermark_opacity' => ['sometimes', 'integer', 'between:10,100'],
```
Garder la règle générique existante `'settings' => ['sometimes', 'nullable', 'array']`. Les autres clés (couleur de marque, etc.) restent libres ; on valide strictement uniquement les 3 nôtres.

### `ConversionHasBeenCompleted` plutôt que `MediaHasBeenAddedEvent`

Le ticket spécifie `MediaHasBeenAddedEvent`, mais ce dernier est tiré **avant** que les conversions ne soient générées (les conversions Spatie sont queued). Si on dispatchait à ce moment, le job devrait soit :
- attendre la fin des conversions (polling — fragile)
- générer ses propres dérivés (duplication du pipeline Spatie)

`ConversionHasBeenCompleted` est tiré **par conversion** une fois le fichier écrit. C'est le bon hook. Documenté en Notes d'implémentation du ticket. Spatie expose `$event->media`, `$event->conversion` (objet `Conversion` avec `->getName()`), parfait pour le filtrage.

### `WatermarkService` — composition de l'image

Avec Intervention Image v3 (driver GD) :
1. `$image = ImageManager::gd()->read($sourcePath)`
2. Charger logo : `$logo = ImageManager::gd()->read($context->logoPath)`
3. Redimensionner logo à max 20% de la largeur cible (lisibilité, contrainte ticket "ne couvre pas > 25%")
4. Appliquer opacité au logo (Intervention `->opacity($context->opacity)`)
5. Composer texte sous le logo : `{agency.name}\n{agency.url}` (font système, taille proportionnelle, ombre légère)
6. `$image->place($composed, $context->position->toInterventionPosition(), $offsetX, $offsetY)` (Intervention supporte `bottom-right`, `bottom-left`, `bottom-center` natifs)
7. Strip EXIF GPS : Intervention v3 strip metadata par défaut sur `save()`. Pour préserver l'orientation, on lit l'EXIF Orientation **avant** save, applique `->orient()` (rotation auto), puis save (orientation devient implicite dans les pixels).
8. `$image->save($sourcePath)` (overwrite in place)

### `RegenerateAgencyWatermarksJob` — idempotence et reset

Le défi : si on a un watermark v1 sur la conversion et qu'on doit revenir à un état propre OU à un watermark v2, on ne peut pas "désappliquer" le watermark de la conversion (l'image a été altérée). Solution : régénérer la conversion **depuis l'original Spatie** (qui est intact). Spatie expose ça via `php artisan media-library:regenerate --ids=X --force`. Programmatiquement, on appelle `Artisan::call(...)` dans le job.

Après régénération, on dispatche éventuellement `ApplyWatermarkJob` selon `watermark_enabled`. Le custom_property `watermarked_conversions` est reset à `[]` au début de chaque itération.

### `?raw=1` admin override

Le contrôleur `PropertyController::show` (existant) reçoit `?raw=1`. Avant de transformer la réponse via `PropertyResource`, il vérifie :
```
if ($request->boolean('raw')) {
    Gate::authorize('viewRaw', $property->getFirstMedia('photos') ?? abort(404));
}
```
Si OK, on passe `raw=true` à la resource via `PropertyResource::make($property)->additional(['raw' => true])`. La resource lit ce flag et choisit `getOriginalUrl()` au lieu de `getUrl('thumbnail|preview')`.

Pour `MediaResource` (utilisé par `PropertyMediaController::show`), même mécanisme.

### Custom properties sur Media (Spatie)

Spatie supporte `$media->setCustomProperty('watermarked_conversions', [...])` et `$media->getCustomProperty('watermarked_conversions', [])`. Persistance automatique. Permet :
- idempotence stricte (ne pas réappliquer le watermark si déjà appliqué)
- visibilité ops (`tinker → Media::where('id', X)->first()->custom_properties`)

---

## Mapping critères d'acceptation → vérifications

| AC | Vérification |
|---|---|
| **AC1** — Upload sur agence `watermark_enabled=true` produit conversion `card` (lire : `thumbnail`/`preview`) avec watermark visible | `ApplyWatermarkJobTest::test_job_writes_watermarked_file_in_place` (hash diff vs source) + `WatermarkServiceTest` × 3 positions |
| **AC2** — `getOriginalUrl()` ne contient pas de watermark (hash inchangé) | `ApplyWatermarkJobTest::test_job_writes_watermarked_file_in_place` asserte `hash(getOriginalUrl)` identique avant/après job |
| **AC3** — Désactiver `watermark_enabled` puis `RegenerateAgencyWatermarksJob` régénère sans watermark | `RegenerateAgencyWatermarksJobTest::test_disabling_watermark_then_running_job_strips_existing_watermarks` |
| **AC4** — Upload sur agence sans `watermark_enabled` ne déclenche pas le job | `ApplyWatermarkJobTest::test_listener_does_not_dispatch_when_watermark_disabled` (`Queue::fake() + assertNotDispatched`) |
| **AC5** — Avatars users + documents baux jamais watermarkés | `ApplyWatermarkJobTest::test_listener_does_not_dispatch_for_avatar_or_lease_collection` (deux subtests) |
| **AC6** — Version watermarkée a ses GPS retirés | `WatermarkServiceTest::test_strips_gps_exif` (lecture EXIF post-save) |
| **AC7** — Admin agence récupère raw via `?raw=1`, public reçoit 403 | `PropertyResourceRawFlagTest::test_raw_flag_returns_original_url_for_admin_agence` + `test_raw_flag_returns_403_for_public_visitor` + `MediaPolicyTest` |

---

## Variables d'environnement

Aucune nouvelle variable. Le watermark est piloté entièrement par `agencies.settings`. La queue `media` utilise le driver `database` global existant (`config/queue.php`). Pas de signing key ni d'API externe.

---

## Étapes d'exécution (ordre recommandé)

1. **Dépendance composer** — `composer require intervention/image:^3.7`. Vérifier que GD est dispo (`php -r 'phpinfo();' | grep GD`).
2. **Enum** — `WatermarkPosition.php` + tests d'enum (smoke).
3. **Value object** — `AgencyWatermarkContext.php` + tests des défauts.
4. **WatermarkService** — implémentation + 7 tests (`tests/Unit/Media/WatermarkServiceTest.php`). Utilise des fixtures images pour les positions.
5. **MediaPolicy** + tests.
6. **ApplyWatermarkJob** + `ApplyWatermarkOnConversionListener` + binding dans `AppServiceProvider` + tests `ApplyWatermarkJobTest` (5 tests, dont AC4 et AC5 sur le filtrage du listener).
7. **RegenerateAgencyWatermarksJob** + tests (AC3 et isolation tenant).
8. **Endpoint** `POST /api/agencies/{id}/regenerate-watermarks` + route + auth inline + tests `RegenerateWatermarksEndpointTest`.
9. **Validation** — étendre `AgencyUpdateRequest` avec règles imbriquées + un test sur la validation (3 cas : valid, opacity hors range, position invalide).
10. **PropertyResource / MediaResource** — `?raw=1` + auth dans `PropertyController::show` + tests `PropertyResourceRawFlagTest` (AC7).
11. **Documentation** — `docs/plans/2026-04-26-tck-106-watermark.md`.
12. **Lint** — `./vendor/bin/pint` (mémoire utilisateur — obligatoire avant commit).
13. **INDEX.md** — passer TCK-106 `todo → review` à l'ouverture de la PR ; **target = `dev`** (mémoire utilisateur).

---

## Vérification end-to-end

- **Tests automatisés ciblés** :
  ```
  php artisan test --filter='Watermark|RegenerateAgencyWatermark|RegenerateWatermarks|PropertyResourceRawFlag|MediaPolicy'
  ```
  Toutes vertes attendues.
- **Suite complète** : `php artisan test` — pas de régression sur les tests existants `MediaConversionTest`, `PropertyMediaTest` (les conversions doivent toujours fonctionner pour les cas sans watermark).
- **Smoke manuel** :
  1. Créer une agence A avec logo, `settings.watermark_enabled=true`, `position=bottom_right`, `opacity=60`.
  2. Uploader une photo sur un bien de A : `POST /api/properties/{id}/media` avec un JPEG 1600×1200.
  3. Attendre la queue (`php artisan queue:work --once` × N) — d'abord la conversion Spatie, puis le job watermark.
  4. `GET /api/properties/{id}` → URL de `thumbnail` doit servir une image avec logo A en bas-droite.
  5. `GET /api/properties/{id}?raw=1` en tant qu'admin de A → URL de l'image originale (sans watermark, vérifier visuellement).
  6. `GET /api/properties/{id}?raw=1` en tant que visiteur public → 403.
  7. `PATCH /api/agencies/{A.id}` avec `settings.watermark_enabled=false` puis `POST /api/agencies/{A.id}/regenerate-watermarks` → after queue drain, `thumbnail` ne contient plus de watermark.
- **Pint** : `./vendor/bin/pint --test` doit passer sans diff.
- **AC6 EXIF** : `exiftool` sur le fichier `thumbnail` post-watermark : pas de tags `GPS*`, mais `Orientation` présent.

---

## Hors périmètre (rappel + simplifications)

- **Ticket original** : pas de watermark dynamique avec identité visiteur, pas de vidéo, pas de PDF, pas d'UI de prévisualisation, pas de migration des photos pré-existantes.
- **Simplifications de ce plan** :
  - Pas de mode `tile` en V1 — uniquement les 3 positions cardinales (suffisant pour la valeur métier ; `tile` peut être ajouté par extension de l'enum dans un ticket dédié).
  - Pas de nouveau nom de conversion (`card-watermarked`) — réutilisation des conversions existantes `thumbnail`/`preview`.
  - Pas de `MediaUrlResolver` (TCK-105 pas en place) — gestion directe dans `PropertyResource`/`MediaResource`. Quand TCK-105 atterrira, déplacer la logique `?raw=1` dans le resolver est un changement local.
  - Pas de migration SQL — tout via `agencies.settings` JSON (déjà en place).
