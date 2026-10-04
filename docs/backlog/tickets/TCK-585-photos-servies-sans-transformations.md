---
id: TCK-585
title: "Les photos de biens sont servies en WebP depuis leurs conversions — plus aucune transformation Cloudflare facturée pour elles"
status: review
phase: P2
family: full
estimate: M
wave: 67
created: 2026-10-04
updated: 2026-10-04
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#27-médias--fichiers
  models:
    - docs/models-spec.md#spatielaravel-medialibrary
tags: [back, front, media, image, cloudflare, cout, adr]
---

## Objectif utilisateur

Que le coût d'affichage des photos de biens ne grandisse plus avec la taille du catalogue, sans
qu'un visiteur voie une photo plus lente, plus lourde au point de gêner sur réseau mobile, ou sans
filigrane. Décision à amender : [ADR-0029](../../adr/0029-medias-sur-r2-servis-par-cloudflare-transformations.md) §4.

## Contexte — pourquoi la facture suit le catalogue et pas le trafic

ADR-0029 §4 et TCK-540 ont déjà réduit les variantes : six paliers de largeur, une qualité,
`format=auto` (`takussan-web/src/lib/image-loader.ts`). Ce qui reste coûteux tient à la règle de
facturation, **re-mesurée le 2026-10-04 sur la documentation de Cloudflare** : une transformation
unique est facturée **une fois par 30 jours**, qu'elle soit en cache ou non. Le catalogue entier est
donc recompté chaque mois, et les robots d'indexation suffisent à toucher chaque photo à chaque
palier. Ordre de grandeur, **non mesuré** : 6 à 8 transformations par photo et par mois, soit
`max(0, 7 × photos − 5 000) × 0,50 $ / 1 000`.

Or l'API produit déjà, en file, les tailles que le front demande : `thumbnail` (300), `preview`
(800 × 600, servie en `main_photo_url` aux cartes), `full` (`Fit::Max` 1600, galerie)
(`Property::registerMediaConversions()`). Elles sont en **JPEG**, le format de la source ; leur
redimensionnement et l'AVIF/WebP sont la seule chose qu'on paie encore à Cloudflare. En WebP, elles
peuvent être servies telles quelles, depuis R2, dont la sortie est gratuite.

⚠ La facture réelle n'est pas encore relevée : seule la préproduction sert R2 (la production attend
la phase F). Le premier geste du ticket est de la lire au tableau de bord.

## Contrat de données

- **Aucun endpoint ni aucune migration.** Les champs que l'API rend restent les mêmes
  (`main_photo_url`, `photos[].thumbnail|preview|full`) ; seule l'extension des fichiers change.
- Les URL restent émises **exclusivement** par `PublicPhotoUrl::upTo()`, qui ne rend qu'une
  conversion servable (produite et, si le bien l'exige, filigranée — TCK-539).
- `media.generated_conversions` et `custom_properties.watermarked_conversions` sont relus et
  réécrits par la régénération ; leur forme ne change pas.

## Contraintes strictes (métier)

1. **Le loader ne fabrique JAMAIS l'URL d'une conversion.** Il peut seulement rendre telle quelle
   l'URL qu'il reçoit. En dériver une voisine (`-preview` → `-full` selon la largeur) contournerait
   `PublicPhotoUrl::isServable()` : l'URL fabriquée pourrait viser une conversion pas encore
   filigranée, qui existe nue dans le seau public entre son écriture et son filigrane (TCK-547),
   ou pas encore produite (404). **Le choix de la conversion appartient à l'API et au composant
   qui choisit le champ**, comme aujourd'hui.
2. **Le filigrane tient sur une conversion WebP.** `ApplyWatermarkJob` choisit son encodeur
   d'après l'extension : le passage au `.webp` doit le prendre en compte et être prouvé par un test,
   pas supposé.
3. **Aucune photo publiée ne rend 404 pendant la bascule.** `getUrl('preview')` calcule
   l'extension à partir de la conversion déclarée, pas du fichier présent. Une fois le code
   déployé, toute photo dont la conversion est encore un `.jpg` produirait donc une URL `.webp`
   inexistante. L'ordre de la bascule (régénération, puis suppression des `.jpg`) se décide dans
   l'amendement de l'ADR et se vérifie en préproduction.
4. **Le reste du chemin ne change pas.** Sans `NEXT_PUBLIC_MEDIA_URL` (production Vercel jusqu'à
   la phase F, `next dev`), l'optimiseur de Next reste en place. Les images qui ne sont pas des
   conversions de photos (avatars, logos d'agence, `plans`) gardent Transformations.

## Delta à produire

- [ ] **Relevé avant** : nombre de transformations uniques sur 30 jours au tableau de bord de
      préproduction (Images → Transformations), et poids servi d'une carte et d'une tuile de
      galerie (préproduction, `curl -s -o /dev/null -w '%{size_download} %{content_type}'`).
- [x] **ADR** : amendement d'ADR-0029 §4, **écrit avant le code**. Il pose que les conversions de
      photos sont servies sans transformation, la contrainte n°1, l'ordre de la bascule
      (contrainte n°3), et l'écart de poids mesuré accepté face à l'AVIF au palier exact.
- [x] Back — `Property::registerMediaConversions()` : `thumbnail`, `preview` et `full` produites en
      `->format('webp')`, mêmes dimensions et mêmes modes d'ajustement. `HasMediaConversions` n'est
      pas concerné (avatars et logos sont servis en original).
- [x] Back — encodeur WebP disponible dans l'image de l'API et sur `worker-media` (vérifier
      `gd_info()['WebP Support']` ou le pilote Imagick, selon le pilote de `spatie/image`).
- [x] Back — `ApplyWatermarkJob` : filigrane appliqué et réécrit en WebP.
- [x] Back — régénération des conversions existantes (`RegeneratePhotoConversionsJob` ou commande
      dédiée), filigrane compris, puis suppression des anciennes conversions `.jpg` du seau public.
      L'ordre suit l'amendement.
- [x] Back — tests : conversion produite en `image/webp` ; filigrane présent sur une conversion
      WebP ; `PublicPhotoUrl` rend une URL `.webp` ; `PublicPhotoUrlTest` toujours vert.
- [x] Front — loader : une URL de **conversion de photo** du seau public est rendue sans passer par
      `/cdn-cgi/image/`. Toute autre URL du seau public (avatar, logo, plan) garde le comportement
      actuel. La règle de reconnaissance se teste dans `image-loader.test.ts`, contrainte n°1
      comprise.
- [ ] **Relevé après**, avec la même commande que le relevé avant, consigné dans
      `docs/infra/hebergement.md` ou dans l'amendement.

## Critères d'acceptation

- [ ] AC1 — Sur la préproduction, une fiche de bien et une page de recherche ne font **aucune**
      requête `/cdn-cgi/image/` pour une photo de bien (relevé réseau du navigateur). Les avatars
      et les logos en font toujours.
- [ ] AC2 — Une conversion `preview` et une conversion `full` servies en préproduction rendent
      `Content-Type: image/webp`, et leur URL est exactement celle que l'API a émise.
- [x] AC3 — Une photo d'un bien d'une agence qui exige un filigrane le porte sur les trois
      conversions WebP. Prouvé par un test qui **échoue** quand l'application du filigrane est
      retirée (vérification par ablation).
- [x] AC4 — `image-loader.test.ts` démontre que le loader rend, pour une conversion de photo,
      l'URL reçue à l'identique, quelle que soit la largeur demandée. Le test **échoue** si le
      loader réécrit `-preview` en `-full` ou l'inverse.
- [ ] AC5 — Pendant la bascule de la préproduction, aucune photo publiée ne rend 404 : relevé sur
      l'ensemble des `main_photo_url` de l'API publique, avant et après la régénération.
- [ ] AC6 — Après la régénération, le seau public ne contient plus aucune conversion `.jpg` de
      photo (comptage des objets par préfixe).
- [ ] AC7 — Le relevé avant/après (transformations sur 30 jours, poids d'une carte et d'une tuile)
      est écrit, daté, avec sa commande.

## Hors périmètre

- **Le plafonnement de la largeur au gabarit de la conversion source** (demander au plus 800 pour
  une `preview` et 1600 pour une `full`) : il n'a plus d'objet, puisque plus aucune transformation
  n'est demandée pour une conversion de photo. À reprendre seulement si l'amendement garde
  Transformations pour les paliers inférieurs à la source.
- Des conversions en AVIF ou une conversion intermédiaire (par exemple une `card` à 480 px) pour
  rapprocher le poids d'une carte mobile de celui de l'AVIF à 640 : ticket à part, sur mesure.
- Avatars, logos d'agence et `plans` : volume d'une image par compte ou par agence, négligeable.
- Le défaut de TCK-547 (conversion nue lisible avant le filigrane) : ce ticket ne l'aggrave pas
  et ne le ferme pas.
- Un autre service (Bunny Optimizer, imgproxy, Glide, optimiseur de Next sur le VPS) : écarté par
  ADR-0029, qui a sorti l'encodage du VPS.

## Reste sur dev

Le code est sur `dev` depuis la PR #318 (2026-10-04). Ce qui manque ne se fait qu'en préproduction :
déploiement, puis `media:convert-photos-to-webp` (runbook : `docs/infra/hebergement.md`,
« Basculer les photos en WebP »), puis le relevé d'AC1, AC2, AC5, AC6 et AC7. Le compte de
transformations sur 30 jours (AC7) se lit au tableau de bord Cloudflare, hors de portée de la
session qui a implémenté.

## Notes d'implémentation

- **Le format se décide par média, et c'est la décision qui porte tout le ticket.** `getUrl()`
  calcule l'extension depuis la conversion *déclarée*. Déclarer `->format('webp')` pour tout le
  parc aurait rendu des URL `.webp` sur les fichiers `.jpg` existants dès le déploiement.
  `PhotoConversionFormat` : marqueur `custom_properties.conversions_format`, posé par
  `Media::creating` (`AppServiceProvider`) sur toute photo de bien neuve, et lu par
  `Property::registerMediaConversions($media)`, que Spatie appelle avec le média à la génération
  comme au calcul d'URL. **Aucune migration de données, aucune fenêtre au déploiement** : une
  photo sans marqueur reste en `.jpg`, et le loader l'envoie encore à Transformations.
- **Bascule** : `ConvertPhotoConversionsToWebpJob` (hérite de `RegeneratePhotoConversionsJob`,
  dont il garde le délai, les rejeux et le fail-closed), mis en file par
  `media:convert-photos-to-webp`. Sous verrou : marqueur posé, conversions marquées non
  produites, trace vidée. Puis suppression des `.jpg`, puis régénération. Le marqueur seul aurait
  suffi à émettre des URL `.webp` sur des fichiers absents. Prouvé par ablation : sans la ligne
  qui marque les conversions non produites,
  `test_during_the_switch_the_api_never_emits_the_url_of_a_missing_file` rougit.
- **Qualité 75 explicite** (`PhotoConversionFormat::QUALITY`) : le pilote GD de `spatie/image`
  passe `-1` à `imagewebp()`, soit 80 côté libwebp (46 Ko au lieu de 38 sur la photo mesurée).
- **`ApplyWatermarkJob` n'a pas changé** : `WatermarkService::apply()` choisit déjà son encodeur
  d'après l'extension. Le nouveau test unitaire compare la *zone* du filigrane à un coin opposé,
  parce qu'un simple réencodage change l'empreinte du fichier. Prouvé par ablation (service réduit
  à un réencodage : rouge). Le test existant, qui compare les empreintes, serait vert sans le
  filigrane.
- **`PropertyPhotoExposureTest`** : la précondition dérivait la clé de l'original en retirant
  `-full`, ce qui donne `villa.webp` alors que l'original est `villa.jpg`. La dérivation devine
  maintenant l'extension de la source, la forme la plus forte de l'attaque. La propriété gardée
  (rien à cette clé sur le seau public) n'a pas bougé.
- **Encodeur** : `gd_info()['WebP Support'] = 1` en local et dans
  `ghcr.io/thiambara/takussan-api:local` (construite le 2026-09-14 à 22:19, après le dernier
  changement du `Dockerfile` à 22:05).
- **Relevé avant, partiel** : les poids sont dans l'amendement d'ADR-0029. Le compte de
  transformations sur 30 jours (tableau de bord Cloudflare) n'a pas été relevé : pas d'accès
  depuis cette session.
- **Ce qui reste ouvert, et pourquoi le ticket est en `review`** : AC1, AC2, AC5, AC6 et AC7
  demandent le déploiement en préproduction, puis `media:convert-photos-to-webp` (runbook :
  `docs/infra/hebergement.md`, « Basculer les photos en WebP »). Rien de cela n'est joué ici.
- **Constat hors périmètre** : sur la préproduction, la `thumbnail` d'une source de 800 × 600 mesure
  400 × 300, pas 300 × 300 (`width(300)->height(300)`). Mesuré, pas expliqué ; non touché.
