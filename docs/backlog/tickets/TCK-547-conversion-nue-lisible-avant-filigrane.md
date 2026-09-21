---
id: TCK-547
title: "Une conversion de photo n'est jamais lisible sans filigrane dans le seau public, même avant le passage du worker"
status: todo
phase: P1
family: back
estimate: M
wave: 67
created: 2026-09-21
updated: 2026-09-21
depends_on: [TCK-539]
blocks: []
spec_refs:
  features:
    - docs/features.md#27-médias--fichiers
  models:
    - docs/models-spec.md#spatielaravel-medialibrary
tags: [back, media, filigrane, r2, cloudflare, securite]
---

## Objectif utilisateur

Qu'une agence qui active le filigrane n'ait **aucune** photo de ses biens lisible sans filigrane
sur le domaine public des médias, à aucun moment : ni entre le téléversement et le passage du
worker, ni pendant une régénération, ni sept jours plus tard depuis le cache de Cloudflare.
Décision de référence : [ADR-0029](../../adr/0029-medias-sur-r2-servis-par-cloudflare-transformations.md) §5-6.

## Contexte — ce que TCK-539 a fermé, et ce qui reste ouvert

Relevé le 2026-09-21 en fermant le défaut D3 du vérificateur adverse de `feat/medias-r2`.

**Fermé par TCK-539** : l'API n'**émet** plus l'URL d'une conversion non filigranée.
`PublicPhotoUrl::isServable()` exige que la conversion soit générée ET, si le bien exige un
filigrane (`Property::requiresWatermark()`), qu'elle figure dans `watermarked_conversions`.

**Resté ouvert, et c'est ce ticket** : le **fichier** nu existe dans le seau public, à une clé
déterministe, entre son écriture et son filigrane. Le filigrane est appliqué APRÈS coup, par
un job en file, et la conversion est écrite nue sur `conversions_disk` (public) par Spatie :

```
PerformConversionAction : copyToMediaLibrary(conversion NUE → r2-media)   ← le fichier est public ici
  → markAsConversionGenerated → ConversionHasBeenCompletedEvent
  → ApplyWatermarkOnConversionListener (file `media`) → ApplyWatermarkJob (file `media`)
  → réécriture filigranée AU MÊME CHEMIN                                    ← et jusqu'ici
```

La clé est `{media_id}/conversions/{nom}-{conversion}.jpg`. Pour un téléversement par la console,
`PropertyMediaController::store` garde le nom de fichier du client (`IMG_1234.jpg`, `PXL_…`,
`WhatsApp Image …`). L'identifiant est séquentiel. La clé se devine donc sans être triviale.

## La fenêtre, mesurée

### Ce qui a pu être mesuré (poste local, 2026-09-21)

Test jetable, supprimé depuis : photo JPEG de 4000 × 3000 (6,8 Mo), `RemoteDiskFake` pour
`r2-media` et `r2-private`, jobs capturés par `Queue::fake()` puis rejoués **en FIFO par un seul
worker**, comme `worker-media`. Charge `5.70 7.73 10.70`, 8 cœurs. Les temps n'incluent **ni la
latence de file ni les entrées-sorties R2** : ce sont des planchers.

| Étape (par photo) | Durée moyenne |
|---|---|
| téléversement, `thumbnail` synchrone compris | 155 à 290 ms |
| `PerformConversionsJob` (`preview` + `full`) | 330 à 360 ms |
| `ApplyWatermarkJob` thumbnail / preview / full | 35-60 / 40-70 / 85-130 ms |
| `CallQueuedListener` (le listener qui dépose le job) | ~10 ms |

| Fenêtre « nue sur le public » | 1 photo | lot de 5 photos |
|---|---|---|
| `thumbnail` | 465 ms | **2,3 à 2,5 s** |
| `preview` | 130 ms | 1,3 à 2,0 s |
| `full` | 216 ms | 1,4 à 2,1 s |

- **La fenêtre croît linéairement avec la taille du lot**, d'environ 0,5 s par photo en local :
  un seul processus sert la file `media`, et les jobs de filigrane d'une photo passent derrière
  les conversions des photos suivantes.
- **`thumbnail` a la fenêtre la plus longue**, bien qu'elle soit synchrone. Elle est écrite nue
  pendant la requête de téléversement, mais son filigrane attend son tour dans la file.
- En production s'ajoutent :
  - l'attente de la file : `--sleep=3` quand elle est vide, et tout ce qui la précède,
    `reconciliation` comprise, puisque `worker-media` sert `media,reconciliation` ;
  - les allers-retours R2 : l'original se télécharge du privé, chaque conversion s'écrit, puis
    se relit et se réécrit au filigrane ;
  - le CPU du VPS.
- **Fenêtre illimitée** : si `worker-media` est arrêté, ou si `ApplyWatermarkJob` échoue trois
  fois (`--tries=3`), la conversion reste nue sans limite de durée. Seul `failed_jobs` le signale.

### Régénération : la fenêtre la plus exploitable

`RegenerateAgencyWatermarksJob` (changement de logo ou de réglage), qui met en file un
`RegeneratePhotoConversionsJob` par photo, et `media:regenerate-property-conversions` réécrivent
les conversions **nues au même chemin**, un
chemin **déjà publié**. Ici, la clé n'a plus à être devinée : elle est
connue de tous. Pour une agence de P photos, la fenêtre de la dernière photo est d'environ
P × 0,5 s en local, soit ~7 min pour 800 photos, avant la latence R2.

**Régression évitée dans TCK-539 (mission 5, 2026-09-21).** Une première version purgeait la
trace en bloc avant de régénérer. `isServable()` devenait alors faux pour chaque conversion de
l'agence, et **toutes ses photos disparaissaient du site public** pendant toute la régénération.
Désormais, `ApplyWatermarkOnConversionListener` retire chaque conversion de la trace **au moment
où SON fichier va être réécrit** (`ConversionWillStartEvent`, synchrone), puis encore à la fin de
la conversion. Une photo n'est donc cachée que pendant la fenêtre de sa propre conversion. Les
conversions pas encore réécrites restent servies, filigranées, et le repli
`full → preview → thumbnail` garde la photo à l'écran. Ce qui reste est l'objet de ce ticket :
- le fichier nu occupe la clé publique pendant la fenêtre de sa conversion ;
- dans le cas d'un job de filigrane périmé intercalé par un second processus, la trace ment
  quelques ms entre l'écriture et `ConversionHasBeenCompletedEvent` ;
- **les URL déjà en circulation** (`?v=` antérieur, pages mises en cache côté front, navigateurs)
  mènent au fichier nu pendant la fenêtre, si Cloudflare ne les a pas en cache.

### Ce qui n'a PAS pu être mesuré en préproduction, et pourquoi

- **Le code mesuré ici n'est pas déployé.** `origin/preview` (`d9eedee0`, 2026-09-17) ne contient
  ni `PublicPhotoUrl`, ni `version_urls` (`false`), ni les conversions en file. Les trois y sont
  `nonQueued()`, mais **le filigrane y est déjà en file** (`ApplyWatermarkOnConversionListener
  implements ShouldQueue`, file `media`). La fenêtre existe donc déjà en préproduction, sur
  `/storage` servi par le VPS, et **l'API y émet l'URL nue immédiatement**, puisque D3 n'y est
  pas corrigé.
- La mesurer demande de téléverser une photo sur la préproduction avec un compte d'agence
  filigranée. C'est une action sortante que je n'ai pas faite. Voir l'AC 1.
- Relevé sans compte (2026-09-21) : une conversion de la préproduction
  (`/storage/1082/conversions/…-preview.jpg`) répond `200`, `cache-control: public,
  max-age=604800, stale-while-revalidate=86400`. La réponse est identique sans `?v=` et avec un
  `?v=` inventé, parce qu'aucun cache ne s'intercale aujourd'hui. Les noms de fichiers y sont
  hachés : c'est la marque des seeders, pas celle de la console.

## Le vecteur aggravant : le cache de Cloudflare

Sur R2 derrière le domaine public (`R2_MEDIA_URL`, domaine personnalisé servi par le cache de
Cloudflare), l'objet porte `CacheControl: max-age=604800` (`config/media-library.php:290`).
Cloudflare inclut par défaut la requête entière dans la clé de cache. **Non mesuré sur le seau
de la préproduction**, faute d'objet connu : c'est à vérifier (AC 2).

1. **L'URL SANS `?v=`**. Quiconque la demande pendant la fenêtre fait mettre la version nue en
   cache sous l'URL nue, pour la durée du `max-age`, soit **7 jours**. Le filigrane réécrit
   ensuite l'objet sur R2, mais pas le cache. Ensuite, **n'importe qui**, et plus seulement
   l'auteur de la requête, lit la version nue à cette URL pendant 7 jours. Il suffit de connaître
   la clé, et elle est publique dès que l'API a émis une URL versionnée. **Une seule requête bien
   placée transforme une fenêtre de quelques secondes en une exposition de 7 jours.**
2. **Une requête inventée** (`?x=<aléa>`) manque le cache à chaque fois et atteint R2. Pendant la
   fenêtre, elle lit donc la version nue, même quand l'URL sans `?v=` est déjà en cache filigranée.
   Une règle qui porterait seulement sur l'URL sans `v` ne ferme pas ce chemin.
3. **Transformations** (`/cdn-cgi/image/…/<chemin>?<requête>`, TCK-540) met aussi en cache la
   variante dérivée de la version nue, sous sa propre clé.
4. **Aucune purge n'existe pour ce domaine.** `MediaCdnObserver` ne purge que si
   `cdn.enabled`, ne purge que les URL que rend `getUrl()`, et son pilote Cloudflare est un
   bouchon (`docs/infra/cdn.md` : « stub only — not functional »).

## Pistes, pesées (sans implémentation)

| Piste | Ferme la fenêtre ? | Coût et risques |
|---|---|---|
| **A. Filigrane appliqué DANS la conversion**, avant l'écriture | **Oui, entièrement** : aucun octet nu n'atteint le seau public | Détails sous le tableau. |
| **B. Conversions écrites d'abord sur le privé, publiées une fois filigranées** | Oui pour le fichier, si la publication est une copie atomique | Détails sous le tableau. |
| **C. Règle de cache Cloudflare** : ne pas mettre en cache une URL de conversion sans `v` | **Non.** Réduit la persistance (vecteur 1), pas l'exposition | Détails sous le tableau. |

**Piste A — le filigrane dans la conversion.** Spatie crée `PerformConversionAction` par `new`
(`FileManipulator.php:97`) : on ne peut pas le relier dans le conteneur. Le point d'accroche est
`FileManipulator`, résolu par `app()` (`PerformConversionsJob`, `Filesystem.php:38`) : une
sous-classe appliquerait `WatermarkService` sur le fichier temporaire, après les manipulations et
avant `copyToMediaLibrary`. Autre voie : `Image::watermark()` de spatie/image, avec un calque
PNG (logo et textes) rendu une fois par agence, puisque `WatermarkService` compose logo et texte
avec Intervention.
- **Ce que la piste supprime** : `ApplyWatermarkJob`, le listener, `WatermarkTrace` et la trace
  `watermarked_conversions` (avec son verrou de ligne), `nextVersion()`, et avec eux D3, D4 et
  la course de régénération. Aucune conversion n'est plus cachée pendant une régénération :
  l'objet est remplacé en une écriture, filigrané.
- **Ce qu'elle coûte** :
  - elle contourne une classe du vendor, à revoir à chaque montée de version de medialibrary ;
  - la conversion `thumbnail`, synchrone, lit le logo de l'agence sur R2 **pendant la requête de
    téléversement**.

**Piste B — conversions sur le privé, puis publication.** Spatie ne connaît qu'un
`conversions_disk`. Il faudrait :
- que `conversions_disk` vaille le privé ;
- un job de publication qui copie la conversion filigranée vers le public ;
- un `UrlGenerator` qui pointe vers le public.

Coût : chaque conversion s'écrit deux fois, une seconde fonction « générée ET publiée » s'ajoute
au modèle de données de Spatie, et `media:move-disk` devient plus complexe. Au total, plus de
code que la piste A, pour la même garantie.

**Piste C — la règle de cache.** Chaque requête sans `v` atteint R2 et lit le nu pendant la
fenêtre, tout comme une requête inventée (vecteur 2). Une règle d'edge ne peut pas vérifier qu'un
`v` est authentique sans signature. Elle vaut comme **défense en profondeur**, et aussi contre le
coût de Transformations (voir « Hors périmètre »). Elle ne remplace pas A ou B.

**Recommandation : piste A**, plus la piste C en complément. A est la seule qui supprime la
condition, au lieu d'en raccourcir la durée. Elle retire aussi plus de code qu'elle n'en ajoute.
C'est une décision structurelle sur le pipeline des médias : **un ADR avant l'implémentation**
(règle du dépôt), qui amende ADR-0029 §5.

## Contraintes strictes (métier)

- Aucun octet d'une conversion non filigranée d'un bien qui exige un filigrane
  (`Property::requiresWatermark()`) ne doit être écrit sur `media-library.public_disk_name`.
- La règle d'activation reste unique : `AgencyWatermarkContext::isEnabledFor()`.
- Changer le logo ou les réglages d'une agence change toujours l'URL servie (`version_urls`) : la
  version précédente, déjà en cache sous l'ancienne `?v=`, ne doit pas être resservie sous la
  nouvelle.
- L'original reste sur le privé (TCK-539, D2) : aucune piste ne le republie.

## Delta à produire

- [ ] ADR : où le filigrane s'applique dans le pipeline des conversions (amende ADR-0029 §5).
- [ ] Implémentation de la piste retenue.
- [ ] Si la piste A est retenue : retrait d'`ApplyWatermarkJob`, d'`ApplyWatermarkOnConversionListener`,
      de `watermarked_conversions`, et simplification de `PublicPhotoUrl::isServable()` (une
      conversion générée est servable).
- [ ] Règle de cache Cloudflare sur le domaine public des médias (piste C), consignée dans
      `docs/infra/` avec sa mesure.
- [ ] Tests : `tests/Feature/Media/WatermarkNeverPublicNakedTest` sur `RemoteDiskFake`. Un
      espion d'écriture sur le disque public vérifie, pour **chaque** écriture d'une conversion,
      que ses octets sont filigranés, au téléversement comme à la régénération.

## Critères d'acceptation

- [ ] AC1 — **La fenêtre est mesurée en préproduction, AVANT le correctif et APRÈS lui**, avec
      TCK-541 déployé (R2, `worker-media`, file `media`). Protocole : une agence filigranée, un
      lot de 1 puis de 10 photos téléversées par la console. On sonde en boucle la clé de chaque
      conversion sur `R2_MEDIA_URL` avec une requête **inventée** à chaque essai (pour manquer le
      cache), et l'on note, par conversion, l'instant où l'objet apparaît et celui où ses octets
      deviennent filigranés. Avant le correctif, la durée mesurée est > 0. Après, **aucun**
      essai ne rend d'octets nus. Même mesure pour une régénération d'agence.
- [ ] AC2 — Le comportement du cache de Cloudflare sur le domaine public est **mesuré**, pas
      supposé : `cf-cache-status` et `age` pour une clé sans requête, avec `?v=`, et avec une
      requête inventée.
- [ ] AC3 — Le test d'espion d'écriture rougit si l'on rétablit l'écriture de la conversion nue
      suivie d'un filigrane en file (ablation).
- [ ] AC4 — Pendant la régénération d'une agence, **chaque** conversion de ses photos reste
      servie : aucune n'est retirée de la trace, faute de fichier nu à la clé publique.
      Aujourd'hui (TCK-539, mission 5), seules les conversions en cours de réécriture sont
      cachées, et la photo reste présente grâce au repli. Garde existante :
      `WatermarkTraceDuringRegenerationTest`. Ce critère demande de passer de « cachée pendant
      sa fenêtre » à « jamais cachée ».
- [ ] AC5 — `Queue::fake()` : sans aucun job exécuté après le téléversement, `thumbnail`
      existe sur le disque public **et** ses octets sont filigranés.

## Restes connus (latents, relevés par la troisième passe adverse, 2026-09-21)

Deux chemins par lesquels une photo EXEMPTÉE — produite quand l'agence n'exigeait pas de
filigrane (`watermark_exempt_conversions`, TCK-539 R1) — reste servie nue alors que son bien
exige désormais le filigrane. **Aucun des deux n'a de chemin d'appel aujourd'hui**, d'où leur
place ici plutôt qu'un correctif. La piste A les supprime tous deux, puisqu'elle n'aurait plus
d'exemption à tenir.

- **R1b — un bien qui change d'agence garde ses exemptions.** Passer d'une agence sans
  filigrane à une agence qui l'exige ne met aucune régénération en file : `AgencyObserver` ne
  regarde que les réglages d'une agence, pas `properties.agency_id`. Aucun chemin d'API ne
  modifie `agency_id` (`UpdatePropertyRequest` ne l'accepte pas, relevé 2026-09-21).
  Test qui le montrerait : photo envoyée sous une agence `watermark_enabled=false`, donc
  exemptée. Ensuite `Queue::fake()`, `$property->update(['agency_id' => $agenceSousFiligrane->id])`,
  puis `Queue::assertPushed(RegenerateAgencyWatermarksJob::class)` (ou un job de régénération du
  bien) et, une fois la file vidée, `full` filigranée. Aujourd'hui : 0 job, `full` nue et servie.
  Correctif le jour où un chemin existe : un `PropertyObserver::updated` sur `agency_id` qui
  régénère les photos du bien si la nouvelle agence exige le filigrane et pas l'ancienne.
- **R1c — une écriture de masse contourne l'observateur.**
  `Agency::query()->update(['settings' => …])` ou `DB::table('agencies')->update(…)` ne
  déclenche aucun événement de modèle, donc pas `AgencyObserver::updated`. Aucun appel de ce
  genre dans `app/` (relevé 2026-09-21), et c'est écrit dans le docblock de l'observateur.
  Test qui le montrerait : même préparation, puis
  `Agency::query()->whereKey($agency->id)->update(['settings' => ['watermark_enabled' => true]])` ;
  attendu, `RegenerateAgencyWatermarksJob` en file. Aujourd'hui : 0 job, et la photo exemptée
  reste servie nue.

- **Échec d'une régénération : fermé en fail-closed, avec un délai borné (cinquième passe
  adverse, V5-1, 2026-09-21).** Une photo exemptée dont la régénération échoue définitivement
  perd ses exemptions, et n'est donc plus servie nue. Elle revient par
  `media:regenerate-property-conversions --untraced`. C'est vrai même quand l'échec est un délai
  dépassé à la dernière tentative : le worker appelle alors `failed()` sans que `handle()` ait
  tourné, et `failed()` fait le retrait lui-même, pour sa photo (`RegeneratePhotoConversionsJob`)
  ou pour toute l'agence (`RegenerateAgencyWatermarksJob`, qui ne fait plus que répartir). Chaque
  job a un `$timeout` de 75 s, sous le `retry_after` de 90 s (`RegenerationTimeoutTest`).
  **Reste** : entre une tentative expirée et la dernière, la photo exemptée reste servie nue,
  comme avant tout passage du job. C'est au plus trois délais plus les attentes (`retry_after`
  90 s, puis `backoff` 30 et 120 s), soit quelques minutes. La piste A supprime ce cas avec les
  exemptions.

## Hors périmètre

- La découpe original privé / conversions publiques : faite par TCK-539 (D2).
- Le déplacement des photos existantes : TCK-541 et `media:move-disk --to-declared`.
- Le coût de Transformations : une requête `/cdn-cgi/image/…` avec une requête inventée crée une
  transformation facturable par variante. C'est un sujet de facture, à part ; la piste C l'atténue.
- Piège constaté en passant, sans usage aujourd'hui : `media-library:regenerate --only-missing`
  cherche les conversions sur `$media->disk` (`FileManipulator::performConversions`). Pour
  `Property.photos`, où `disk` ≠ `conversions_disk`, il les croit toutes absentes et régénère tout.

## Notes d'implémentation

_(à remplir)_
