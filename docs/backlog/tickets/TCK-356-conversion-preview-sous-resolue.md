---
id: TCK-356
title: "La plus grande image qu'un visiteur puisse recevoir fait 800 × 600, pour des emplacements qui en demandent jusqu'à 2 432"
status: done
phase: P2
family: back
estimate: M
wave: null
created: 2026-08-24
updated: 2026-08-25
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#27-médias--fichiers
  models:
    - docs/models-spec.md#spatielaravel-medialibrary
    - docs/models-spec.md#3-property
tags: [back, front, media, image, performance, watermark]
---

## Objectif utilisateur

Qu'un visiteur qui ouvre la fiche d'un bien voie la photo **nette** — sur la grande tuile de la
mosaïque comme en plein écran — au lieu d'un agrandissement d'une image de 800 px.

## Contrat de données

**Ce que le code sert aujourd'hui.** `Property::registerMediaConversions()`
(`app/Models/Property.php:503-507`) déclare deux conversions et pas une de plus :

```php
$this->addMediaConversion('thumbnail')->width(300)->height(300)->nonQueued();
$this->addMediaConversion('preview')->width(800)->height(600)->nonQueued();
```

`PropertyResource` expose `photos[] = {thumbnail, preview, original}` (`:96-98`), et
`originalUrlFor()` (`:332-339`) **retombe sur `preview` pour tout appelant sans `viewRaw`** —
c'est le garde-fou de TCK-106, qui empêche de contourner le filigrane. Conséquence directe et
non voulue : **pour le public, `preview` n'est pas la moyenne taille, c'est le plafond.**

**Ce que la mise en page demande** — relevé le 2026-08-24 dans
`takussan-web/src/components/property/card-image-sizes.ts` et
`.../properties/[slug]/components/PropertyGalleryMosaic.tsx`, conteneur plafonné à 1 216 px :

| Emplacement | Largeur CSS au plafond | Besoin en DPR 2 | Couvert par `preview` (800) |
|---|---|---|---|
| Lightbox (`sizes="100vw"`, `PropertyLightbox.tsx:71-74`) | ≥ 1 440 | ≥ 2 880 | ≤ 28 % |
| Mosaïque, photo unique (`TUILE_PLEINE`) | 1 216 | 2 432 | 33 % |
| Mosaïque, grande tuile (`TUILE_60`) | 725 | 1 450 | 55 % |
| Carte de recherche (`CARD_SIZES_SEARCH_GRID`) | 192 | 384 | couvert |

Les cartes vont bien — c'est ce que la passe `sizes` a réglé. **Le manque est en amont du `sizes` :
la source n'existe pas.** Aucun `sizes`, aucun format, aucun CDN ne rattrape une image qui n'a
jamais été produite à la bonne taille.

**Ce que la référence décrit déjà.** `App\Models\Concerns\HasMediaConversions` — le triplet que
`models-spec.md` et TCK-050 décrivent, utilisé par `User` — porte `thumbnail`, `preview` **et
`full` (1 200 px de large)**. `Property` re-déclare ses propres conversions et **laisse `full` de
côté**. Le ticket rapproche `Property` de la forme documentée plutôt que d'en inventer une
troisième.

## Contraintes strictes (métier)

1. **Le filigrane est la seule protection, et il est décrit à DEUX endroits.**
   `ApplyWatermarkOnConversionListener:28` et `RegenerateAgencyWatermarksJob:43` codent chacun en
   dur `['thumbnail', 'preview']`. Une conversion ajoutée sans être inscrite dans les deux serait
   servie au public **sans filigrane** — exactement ce que `originalUrlFor()` existe pour
   empêcher. *Deux listes qui doivent dire la même chose finissent par ne plus la dire.*

2. **Ce ticket relève le plafond public de 800 à 1 600 px.** C'est un arbitrage produit assumé
   (netteté contre recopie de photo), et il ne tient que si la contrainte 1 tient.

3. **Le fichier source ne devient jamais public.** `originalUrlFor()` continue de rendre le
   fichier brut au seul détenteur de `viewRaw`. Changer la valeur de repli ne doit pas changer
   la condition.

4. **La régénération réécrit à la même URL.** `media-library:regenerate` remplace le fichier de
   conversion sans changer son chemin, et `/storage/` porte désormais `max-age=604800`
   (`scripts/server-setup.sh`). Une image régénérée peut donc rester périmée jusqu'à 7 jours dans
   un navigateur. C'est la même raison qui interdit `immutable` sur ce `location`.

## Delta à produire

- [ ] `Property::registerMediaConversions()` : ajouter `full` — 1 600 px de large, hauteur libre,
      `nonQueued()` comme les deux autres. Nom repris de `HasMediaConversions`, pas inventé.
- [ ] Une **seule** liste des conversions à filigraner (constante ou méthode sur `Property`),
      consommée par `ApplyWatermarkOnConversionListener` **et** `RegenerateAgencyWatermarksJob`.
      Supprimer les deux littéraux.
- [ ] `PropertyResource` : exposer `full` dans `photos[]`, et faire retomber `originalUrlFor()`
      sur `full` au lieu de `preview` pour un appelant sans `viewRaw`.
- [ ] `PropertyMediaController::index()` et `store()` : même clé `full`, pour que la console du
      propriétaire et l'API publique décrivent le même jeu d'images.
- [ ] Front : `PropertyGalleryMosaic` et `PropertyLightbox` consomment `full` ; les cartes de
      liste restent sur `preview` (leur besoin est couvert — cf. tableau).
- [ ] Régénération du parc existant (**3 307 médias `photos` en local**) : commande, ordre de
      passage filigrane compris, et la fenêtre de cache de 7 jours consignée.
- [ ] Tests : `PropertyMediaConversionsTest` — génération, filigrane, exposition, et repli de
      `originalUrlFor()`.

## Critères d'acceptation

- [ ] **AC1** — Sur une **fixture de test d'au moins 2 400 × 1 800** ajoutée par le test lui-même,
      la conversion `full` est générée et fait 1 600 px de large.
      ⚠ *Le critère porte sur une fixture, jamais sur une photo seedée : 250 originaux du parc
      local échantillonnés le 2026-08-24 donnent 128×128 (131), 800×600 (104), 1×1 (11), 512×512
      (4). Un critère écrit sur ces données-là serait vert **sans** le correctif.*
- [ ] **AC2** — Sur la même fixture, agence avec `watermark_enabled`, `full` est filigranée ; et
      un test échoue si une conversion image de `Property` n'est pas couverte par la liste unique
      de la contrainte 1 (assertion sur la liste, pas sur les trois noms écrits en dur).
- [ ] **AC3** — `GET /api/properties/{slug}` sans `viewRaw` : `photos[].original` pointe sur `full`
      et **n'est jamais** l'URL du fichier source ; avec `viewRaw`, c'est le fichier source.
- [ ] **AC4** — Sur la fiche, à 1 280 px de viewport en DPR 2, la requête réseau de la grande tuile
      demande une image d'au moins 1 450 px de large, au lieu de plafonner à 800.
- [ ] **AC5** — Après régénération, le nombre de médias de la collection `photos` sans entrée
      `full` dans `generated_conversions` est **0**.

## Hors périmètre

- Les conversions des autres modèles : `HasMediaConversions` (donc `User`, `Agency`) n'est pas
  retouché.
- Un plafond de dimension à l'upload — `StorePropertyMediaRequest` accepte 10 Mo sans contrainte
  de taille, et ce ticket ne change pas cette règle.
- Le CDN et les formats modernes côté serveur (TCK-105, `done`).
- `immutable` sur `/storage/` : reste hors de portée tant que l'URL ne porte pas de jeton dérivé
  de `media.updated_at`.
- Le déclenchement automatique de la régénération sur les environnements déployés — la procédure
  est écrite, son exécution reste une opération manuelle.

## Notes d'implémentation

### `width(1600)` AGRANDIT — mesuré, et ça changeait tout

Le delta disait « `full` — 1 600 px de large, hauteur libre ». Écrit littéralement
(`->width(1600)`), **une source de 800 px rend un `full` de 1 600 px** : deux fois le poids
pour zéro détail. Le test d'ablation d'AC1 l'a attrapé au premier passage, en rougissant sur
ce qu'il était censé démontrer — le parc local n'est fait que de vignettes de seed, et la
régénération l'aurait converti en placards de 1 600 px.

La forme retenue est `->fit(Fit::Max, 1600)` : `Fit::Max` vaut `PreserveAspectRatio` +
`DoNotUpsize` (`Spatie\Image\Enums\Fit::calculateSize`), et la hauteur laissée nulle prend
celle de la source — donc seule la largeur contraint, et rien n'est recadré.

**Le plafond public vaut donc `min(1 600, largeur de la source)`, pas 1 600 sec.** C'est
strictement meilleur que la contrainte 2 : on ne fabrique jamais de pixels.

⚠ `thumbnail` et `preview` gardent leur `width()->height()`, donc leur agrandissement.
Non touché : hors delta, et changer la taille rendue par `preview` déplacerait ce que les
cartes de liste reçoivent aujourd'hui.

### Un repli qui n'était pas dans le delta, et pourquoi il y est

`Media::getUrl('full')` construit une URL depuis le NOM de la conversion **sans vérifier
qu'elle a été produite**. Tout média d'avant ce ticket aurait donc rendu une URL en 404
entre le déploiement et la régénération — sur `photos[].original`, c'est-à-dire la lightbox.
`PropertyResource::largestPublicConversion()` et `PropertyMediaController::fullUrl()`
replient sur `preview` tant que `full` manque. Le repli devient inerte quand AC5 est vert.

### Deux écarts assumés avec la lettre du delta

1. **La lightbox reste sur `original`, pas sur `full`.** `originalUrlFor()` retombant
   désormais sur `full`, le visiteur reçoit déjà les 1 600 px ; écrire `current.full`
   ne changerait rien pour lui et **dégraderait le propriétaire**, qui perdrait sa photo
   pleine résolution en plein écran.
2. **`PropertyMobileGallery` passe aussi sur `full`**, alors que le delta ne la nommait pas.
   Elle sert la même fiche en `100vw` : 1 290 px physiques sur un téléphone de 430 px en
   DPR 3, contre 800 px de source. La laisser dehors, c'était corriger la fiche pour le
   bureau et la laisser floue là où sont la plupart des visiteurs.

### La régénération du parc, et sa fenêtre de 7 jours

`php artisan media:regenerate-property-conversions` — options `--property=`, `--agency=`,
`--missing-only`, `--dry-run`. **L'ordre est la seule chose non évidente** : purger
`watermarked_conversions` AVANT de réécrire, sinon `ApplyWatermarkJob` voit la conversion
comme déjà filigranée, sort sans rien faire, et le média repart **nu** — le fichier venant
d'être réécrit depuis la source. Le test
`test_regeneration_resets_the_watermark_trace_before_rewriting` épingle cet ordre.

⚠ **Elle n'a PAS été exécutée** — ni en local (~3 307 médias, données de développement de
l'utilisateur), ni sur un environnement déployé. Conformément au « Hors périmètre », c'est
une opération manuelle. La marche à suivre :

```bash
php artisan media:regenerate-property-conversions --missing-only --dry-run   # compter
php artisan media:regenerate-property-conversions --missing-only             # exécuter
```

⚠ Les fichiers sont réécrits **au même chemin**, et `/storage/` sert désormais
`max-age=604800` (TCK-355). Un navigateur qui a déjà vu l'ancienne image peut afficher la
version d'avant **jusqu'à 7 jours** : prévoir la fenêtre, ou purger le CDN. C'est la même
propriété qui interdit `immutable` sur ce `location`.

### Ce que la liste unique garde vraiment

`Property::watermarkedConversions()` remplace les deux littéraux `['thumbnail', 'preview']`.
`test_every_registered_conversion_is_covered_by_the_watermark_list` compare la liste aux
conversions **réellement enregistrées**, dans les deux sens. Vérifié par ablation
unilatérale : retirer `full` de la seule liste rend le test rouge ; le retirer des deux
le laisse vert, ce qui est le comportement voulu — il garde l'**appariement**, pas trois
noms écrits en dur.
