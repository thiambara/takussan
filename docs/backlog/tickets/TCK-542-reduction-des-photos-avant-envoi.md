---
id: TCK-542
title: "Réduire les photos dans le navigateur avant l'envoi — dimensions plafonnées, format conservé"
status: review
phase: P2
family: front
estimate: M
wave: 67
created: 2026-09-21
updated: 2026-09-22
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#27-médias--fichiers
  models:
    - docs/models-spec.md#spatielaravel-medialibrary
tags: [front, media, image, upload, performance, mobile]
---

## Objectif utilisateur

Qu'un agent ou un propriétaire qui publie les photos d'un bien depuis son téléphone, sur réseau
mobile, les envoie en quelques secondes au lieu d'attendre plusieurs mégaoctets par photo — sans
que la photo affichée ensuite soit moins nette.

## Contrat de données

Endpoints existants, inchangés : les envois de photos passent par les requêtes validées par
`MediaUploadRequest` et `GenericMediaUploadRequest` (`mimes:jpg,jpeg,png,webp`,
`MAX_PHOTO_KB = 10 * 1024`), plus l'avatar, le logo d'agence, les photos de maintenance et les
pièces jointes image de la messagerie.

Écrans qui envoient des photos (relevé du 2026-09-21, `type="file"` / dépôt) : assistant de
publication d'un bien, panneau de médias du tableau de bord et gestionnaire de médias, en-tête de
profil (avatar), configuration de l'agence (logo), formulaires de maintenance, fil de messagerie.

Pourquoi réduire et **pas** convertir : [ADR-0029](../../adr/0029-medias-sur-r2-servis-par-cloudflare-transformations.md)
§4-5 — le format servi se décide **à la livraison** (Transformations, `format=auto` → AVIF). Un
WebP produit par le navigateur ne rend rien de plus léger à l'affichage et ajoute une compression
avec perte avant celle de la livraison. La conversion `full` plafonne à 1 600 px (TCK-356) : une
source de 2 560 px de grand côté garde de la marge pour le filigrane et un DPR 2 sans jamais
agrandir.

## Direction UX / Artistique

Invisible quand tout va bien : l'utilisateur choisit ses photos, la réduction se fait pendant
l'aperçu, et la progression affichée est celle de l'envoi réduit. Pas de réglage de qualité
exposé. Si la réduction échoue sur une photo, elle part telle quelle — jamais de blocage, jamais
de message technique.

## Contraintes strictes (métier)

- **Le format ne change pas** : un JPEG reste un JPEG (qualité ≈ 0,9), un PNG reste un PNG, un
  WebP reste un WebP. Aucune conversion vers WebP ou AVIF.
- **Grand côté plafonné à 2 560 px**, proportions conservées ; une image plus petite n'est
  **ni agrandie ni réencodée** (elle part octet pour octet).
- **L'orientation est préservée** : une photo portrait prise au téléphone arrive en portrait. Le
  réencodage supprime l'EXIF ; l'orientation doit donc être appliquée aux pixels avant.
- **Si le résultat est plus lourd que l'original, l'original part.**
- **Repli sûr** : navigateur incapable de décoder le fichier (HEIC sur un navigateur qui ne le lit
  pas, fichier corrompu, mémoire insuffisante) → l'original part, la validation serveur tranche.
- **La validation serveur reste la seule garde** : types et taille inchangés côté API. La
  réduction est une optimisation, jamais une sécurité.
- Le travail ne gèle pas l'interface pendant une sélection de 20 photos de 12 Mpx.

## Delta à produire

- [x] Une fonction de réduction partagée, appliquée à chaque écran d'envoi de **photos** listé
      au contrat.
- [x] Tests unitaires : plafonnement, non-agrandissement, format conservé, orientation, repli sur
      l'original (échec de décodage, résultat plus lourd).
- [x] Mesure notée dans les Notes d'implémentation : poids avant/après sur au moins trois vraies
      photos de téléphone (dont une portrait), et temps de réduction sur un téléphone d'entrée de
      gamme ou en émulation CPU ralentie.

## Critères d'acceptation

- [x] AC1 — Une photo JPEG de 4 000 × 3 000 envoyée depuis l'assistant de publication arrive
      côté API en JPEG de 2 560 × 1 920.
- [x] AC2 — Une photo de 1 200 × 900 arrive identique à l'original (même taille en octets).
- [x] AC3 — Une photo portrait portant `Orientation = 6` s'affiche en portrait après l'envoi.
- [x] AC4 — Un fichier que le navigateur ne sait pas décoder est envoyé tel quel, et l'API rend sa
      réponse de validation habituelle.
- [x] AC5 — Chaque AC ci-dessus a un test qui **rougit** quand la réduction est retirée ou quand
      elle convertit le format (ablation notée).
- [x] `npm run lint`, `npx tsc --noEmit`, tests touchés verts.

## Hors périmètre

- **Pièces KYC, documents, devis et justificatifs** : ce sont des pièces justificatives. Elles
  partent telles qu'elles ont été produites, même quand ce sont des images.
- La conversion de format (décidée contre : ADR-0029).
- Le HEIC → JPEG côté client. S'il faut accepter le HEIC, c'est un ticket à part (côté API).
- Les vidéos de biens.
- Tout changement des règles de validation de l'API.

## Notes d'implémentation

**La fonction : `takussan-web/src/lib/reduire-photo.ts`.** `reduirePhoto(fichier)` rend un `File`
— réduit, ou **l'original lui-même** (`===`, donc octet pour octet) dès que la réduction ne serait
pas un gain sûr : type hors `jpeg/png/webp`, image déjà sous 2 560 px, décodage impossible,
encodeur muet, résultat plus lourd, **ou type de sortie différent du type d'entrée** (Safari sans
encodeur WebP rend du PNG : ce cas-là convertirait le format sans le dire). `reduirePhotos(lot)`
enchaîne **une photo à la fois** en rendant la main entre deux — vingt bitmaps de 12 Mpx décodés
d'un coup, c'est ~1 Go de mémoire et l'interface gelée le temps du lot.

Le décodage passe par `createImageBitmap(fichier, { imageOrientation: 'from-image' })` : c'est LUI
qui applique l'orientation EXIF aux pixels, puisque le réencodage efface l'EXIF. L'encodage se fait
sur `OffscreenCanvas.convertToBlob` quand il existe, sinon `canvas.toBlob`. Les deux opérations sont
injectables (`OutilsImage`) — jsdom n'en a aucune, et la décision « réduire ou rendre l'original »
s'éprouve ainsi sans navigateur.

**Les sept écrans de photos** appellent la fonction : assistant de publication, `MediaManager`
(donc le panneau de médias), avatar, logo d'agence, les deux formulaires de maintenance, et la
pièce jointe de la messagerie (où un PDF ou un `.docx` traverse sans être touché — son type n'est
pas réduit). Dans `MediaManager`, la réduction passe **avant** la validation de taille : une photo
de 12 Mo qui tombe sous le plafond une fois réduite n'a pas à être refusée ; les lignes de
progression s'affichent pendant la réduction, pas après.

### Mesure — Chrome 153, machine à 8 cœurs, 2026-09-22

Trois vraies photos de téléphone (Pixel 6, originaux de Wikimedia Commons, EXIF intact), plus trois
cas de bord. `identique` = l'original part tel quel.

| fichier | avant | après | dimensions | durée |
|---|---|---|---|---|
| paysage | 4 437 798 o (4080×3072) | 1 446 048 o (2560×1928) | −67 % | 396 ms |
| portrait | 2 542 798 o (3072×4080) | 818 952 o (1928×2560) | −68 % | 130 ms |
| étroite (1659×4007) | 1 756 551 o | 739 942 o (1060×2560) | −58 % | 80 ms |
| `Orientation = 6` (pixels 4080×3072) | 4 402 578 o | 1 450 005 o (**1928×2560**) | portrait rendu | 162 ms |
| 1200×900 | 412 374 o | **412 374 o, `identique`** | inchangée | 7 ms |
| JPEG tronqué | 50 002 o | **50 002 o, `identique`** | indécodable | 0 ms |

Un lot de **20 photos de 12 Mpx : 3,0 s**, et **89 ms** de blocage du fil principal au pire. Sous
**CPU ralenti ×6** (émulation DevTools, l'ordre d'un téléphone d'entrée de gamme) : une photo en
469 ms, le lot de 20 en **9,4 s**, pire blocage **144 ms** — l'interface répond pendant tout le lot.
Ce lot envoie 29 Mo au lieu de 89 Mo.

⚠ **Ce qui n'a PAS été mesuré de bout en bout** : aucun envoi réel vers l'API n'a été rejoué (la
pile locale n'était pas levée). AC1 à AC4 se lisent donc en deux moitiés — la sortie de la fonction,
mesurée dans Chrome ci-dessus, et le fait que ce soit ELLE qui parte, tenu par les tests de
branchement et par l'ablation. *Un envoi réel reste la seule chose qui prouverait la chaîne
entière ;* il se rejouera au prochain passage sur la préproduction.

> Le banc, les photos et leur provenance sont hors dépôt (répertoire de travail de la session) : ce
> sont des fichiers de plusieurs mégaoctets, et la mesure se refait en quelques minutes.
> `orientation6.jpg` a été fabriqué en remplaçant l'APP1 EXIF de la photo paysage par un segment
> minimal portant `Orientation = 6` — ⚠ `sips -g orientation` ne le voit pas, le navigateur si :
> c'est le navigateur qui décide ici, pas l'outil de relevé.

### La suite entière, et pourquoi il a fallu la rejouer

`npm run lint` et `npx tsc --noEmit` propres. `npm run test` : **410 fichiers, 3425 tests, 0 échec,
190 s**, machine au repos (`load average` 1-min à 6,8 avant le départ, 8 cœurs).

Les deux exécutions précédentes avaient rendu des rouges, et **aucun n'appartenait à ce travail** :
`RecentlyViewedCarousel` + `PhoneVerificationSection` à charge 216, puis, à charge 350-520, ces
deux-là **verts** et `BookingTunnel.succes` rouge à leur place — sur une attente expirée
(`Unable to find role="button"`), jamais sur une assertion fausse. Un ensemble différent à chaque
exécution, sans qu'un fichier ait changé : la signature de D-44. La même suite met **729 s** sous
charge contre 190 s au repos.

⚠ Une part de cette charge venait de la session elle-même : 24 brûleurs CPU lancés pour tenter de
reproduire les rouges avaient **survécu à leur `kill`** (`jobs -p` est vide dans le shell non
interactif de l'agent), et ont tourné 12 minutes de plus. *Un test rouge sous une charge qu'on a
soi-même posée accuse le dépôt d'un défaut qui est dans la pièce.*

⚠ Fil non refermé : la première exécution annonçait **405 fichiers** quand 410 existaient déjà sur
le disque — cinq fichiers non joués, sans que rien ne le signale. Sa sortie avait été filtrée par
`grep`, le détail est perdu. *Retenir de garder le journal entier d'une suite avant de le résumer.*

### Ablation — ce qui rougit quand on retire la réduction (AC5)

Sept mutilations, sept rouges, sur `reduire-photo.test.ts`, `PropertyWizard.test.tsx` et
`MediaManager.test.tsx` :

| mutilation | tests rouges |
|---|---|
| `reduirePhoto` rend toujours l'original | 4 |
| l'encodeur reçoit `image/webp` au lieu du type d'entrée | 2 |
| `imageOrientation: 'none'` au lieu de `'from-image'` | 1 |
| le `catch` qui replie sur l'original retiré | 3 |
| une image sous le plafond réencodée quand même | 1 (AC2) |
| l'assistant de publication débranché | 2 |
| le gestionnaire de médias débranché | 2 |

**Un test de branchement** (`reduire-photo.branchement.test.ts`) tient les quatre écrans qui n'ont
pas de test de comportement — et, dans l'autre sens, garde que KYC, documents, devis et
justificatifs **ne réduisent rien** : une pièce justificative part telle qu'elle a été produite.

**Ce que la réduction ne garde pas** : le réencodage efface l'EXIF (orientation appliquée aux
pixels, mais aussi date de prise de vue et GPS). C'est sans effet sur l'API — medialibrary ne lit
aucun de ces champs — et plutôt une bonne chose pour la position GPS d'une photo de bien.
