---
id: TCK-585
title: "Les photos de biens sont servies en WebP depuis leurs conversions — plus aucune transformation Cloudflare facturée pour elles"
status: todo
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
- [ ] **ADR** : amendement d'ADR-0029 §4, **écrit avant le code**. Il pose que les conversions de
      photos sont servies sans transformation, la contrainte n°1, l'ordre de la bascule
      (contrainte n°3), et l'écart de poids mesuré accepté face à l'AVIF au palier exact.
- [ ] Back — `Property::registerMediaConversions()` : `thumbnail`, `preview` et `full` produites en
      `->format('webp')`, mêmes dimensions et mêmes modes d'ajustement. `HasMediaConversions` n'est
      pas concerné (avatars et logos sont servis en original).
- [ ] Back — encodeur WebP disponible dans l'image de l'API et sur `worker-media` (vérifier
      `gd_info()['WebP Support']` ou le pilote Imagick, selon le pilote de `spatie/image`).
- [ ] Back — `ApplyWatermarkJob` : filigrane appliqué et réécrit en WebP.
- [ ] Back — régénération des conversions existantes (`RegeneratePhotoConversionsJob` ou commande
      dédiée), filigrane compris, puis suppression des anciennes conversions `.jpg` du seau public.
      L'ordre suit l'amendement.
- [ ] Back — tests : conversion produite en `image/webp` ; filigrane présent sur une conversion
      WebP ; `PublicPhotoUrl` rend une URL `.webp` ; `PublicPhotoUrlTest` toujours vert.
- [ ] Front — loader : une URL de **conversion de photo** du seau public est rendue sans passer par
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
- [ ] AC3 — Une photo d'un bien d'une agence qui exige un filigrane le porte sur les trois
      conversions WebP. Prouvé par un test qui **échoue** quand l'application du filigrane est
      retirée (vérification par ablation).
- [ ] AC4 — `image-loader.test.ts` démontre que le loader rend, pour une conversion de photo,
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

## Notes d'implémentation

_(à remplir par implementing-specs)_
