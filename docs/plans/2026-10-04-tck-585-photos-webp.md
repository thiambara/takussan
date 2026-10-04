# Plan — TCK-585 : photos de biens servies en WebP, sans transformation

Ticket : [TCK-585](../backlog/tickets/TCK-585-photos-servies-sans-transformations.md) ·
Décision : amendement d'[ADR-0029](../adr/0029-medias-sur-r2-servis-par-cloudflare-transformations.md) §4.

## Le nœud : le format d'une conversion se décide PAR MÉDIA

`getUrl('preview')` calcule l'extension depuis la conversion **déclarée**
(`Conversion::getResultExtension()`), jamais depuis le fichier présent. Passer toutes les
conversions en `->format('webp')` d'un coup rendrait, dès le déploiement, une URL `.webp` pour
chaque photo dont le fichier est encore un `.jpg` : 404 sur tout le parc jusqu'à la
régénération.

D'où un **marqueur par média**, `custom_properties.conversions_format = 'webp'` :

- `Property::registerMediaConversions(?Media $media)` reçoit le média (Spatie le passe, à la
  génération comme au calcul d'URL) : WebP si le marqueur est posé, format de la source sinon.
  URL et génération lisent la même règle sur la même ligne : elles ne peuvent pas diverger.
- **Un média neuf reçoit le marqueur à sa création** (`Media::creating`, photos de biens
  seulement), donc avant toute conversion. Un média ancien n'en a pas : ses URL restent en
  `.jpg`, sur des fichiers qui existent. **Aucune migration de données, aucune fenêtre au
  déploiement.**
- **La bascule d'un média ancien** est un job par photo (`ConvertPhotoConversionsToWebpJob`),
  mis en file par `media:convert-photos-to-webp` :
  1. sous verrou de la ligne : marqueur posé, les trois conversions marquées NON produites,
     retirées des deux listes de la trace ;
  2. suppression des anciens fichiers, quand leur chemin diffère du nouveau (une source déjà en
     `.webp` donne le même nom) ;
  3. `createDerivedFiles()` — `thumbnail` en ligne, `preview` et `full` en file ; le filigrane
     suit l'événement de fin de conversion, comme aujourd'hui.

  Entre 1 et 3, `PublicPhotoUrl` ne rend aucune URL (rien n'est produit) : la photo est cachée
  quelques secondes, puis se replie sur `thumbnail` jusqu'à `preview` et `full`. **Jamais de
  404, jamais de fichier nu** : la trace est vide, donc rien n'est servable sous filigrane avant
  `ApplyWatermarkJob`.

## Front

Le loader rend telle quelle (`#w=` pour taire l'avertissement de Next, comme pour les autres
hôtes) toute URL du seau public dont le chemin est une conversion de photo **en `.webp`**
(`/conversions/<nom>-(thumbnail|preview|full).webp`). Un `.jpg` ancien garde Transformations :
la transition se gère seule, photo par photo. Le loader ne dérive jamais une conversion d'une
autre.

## Étapes

1. Amendement ADR-0029 (avant le code).
2. Back, TDD : marqueur à la création ; format par média ; URL `.webp` ; média ancien inchangé.
3. Back, TDD : filigrane sur une conversion WebP (`WatermarkServiceTest`, `ApplyWatermarkJob`).
4. Back, TDD : job de bascule + commande ; aucune URL émise vers un fichier absent pendant la
   bascule.
5. Tests existants qui supposaient `-preview.jpg` sur un média neuf : à mettre à jour.
6. Front, TDD : `image-loader.test.ts`.
7. Pint, tests ciblés, lint, `tsc`.
