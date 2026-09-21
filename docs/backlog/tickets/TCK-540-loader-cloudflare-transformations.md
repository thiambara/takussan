---
id: TCK-540
title: "Le front sert les images par Cloudflare Transformations — l'optimiseur de Next ne tourne plus sur le VPS"
status: done
phase: P1
family: front
estimate: M
wave: 67
created: 2026-09-21
updated: 2026-09-21
depends_on: []
blocks: [TCK-541]
spec_refs:
  features:
    - docs/features.md#27-médias--fichiers
tags: [front, media, image, performance, cloudflare]
---

## Objectif utilisateur

Que les photos de biens arrivent vite et légères (AVIF/WebP), depuis le réseau de Cloudflare, sans
que le serveur du front les réencode ni perde son cache à chaque déploiement. Décision :
[ADR-0029](../../adr/0029-medias-sur-r2-servis-par-cloudflare-transformations.md) §4-5.

## Contrat de données

- Mesuré le 2026-09-21 : `https://media-preview.takussan.com/cdn-cgi/image/width=640,quality=75,format=auto,onerror=redirect/<chemin>`
  → `200 image/avif`, 37 648 o (source JPEG 81 636 o), 0,054 s en cache.
- L'API rend des URL **absolues** (`main_photo_url`, `thumbnail`, `preview`, `full`, `original`,
  `avatar_url`, `logo_url`) ; le front les passe telles quelles à `next/image`.
- Autres sources servies par `next/image` : `images.unsplash.com` (`(auth)/layout.tsx`),
  `picsum.photos` (playground), `blob:` / données locales (`unoptimized`).
- Facturation : transformation **unique** = source × paramètres ; 5 000/mois gratuites.

## Critères d'acceptation

- [x] `images.loader = 'custom'` + `loaderFile` : une URL dont l'origine est `NEXT_PUBLIC_MEDIA_URL`
      devient `<media>/cdn-cgi/image/width=<w>,quality=<q>,format=auto,onerror=redirect/<chemin+requête>`.
- [x] La largeur est **arrondie vers le haut** à un jeu fixe et court (documenté, justifié par la
      facturation) ; `quality` a une valeur par défaut unique.
- [x] Toute autre URL (Unsplash, picsum, `blob:`, `data:`, relative, `NEXT_PUBLIC_MEDIA_URL` vide
      en dev) est rendue **sans casser** : paramètres natifs pour Unsplash, inchangée sinon.
- [x] `NEXT_PUBLIC_MEDIA_URL` : `ARG` + contrôle du `Dockerfile`, `build-args` d'`images.yml`
      (`https://media-preview.takussan.com` pour `preview`), `.env.example`.
- [x] `remotePatterns` accepte le domaine de médias.
- [x] Tests unitaires du loader couvrant chaque branche, et **ablation notée** (le test rougit si
      l'arrondi ou le passage `onerror=redirect` disparaît).
- [x] `npm run lint`, `npx tsc --noEmit`, tests touchés verts ; `npm run build` passe.

## Notes d'implémentation

**Le loader ne se branche que si `NEXT_PUBLIC_MEDIA_URL` est posée au build** (`next.config.ts`).
`loader: 'custom'` désactive l'optimiseur partout — vérifié dans
`node_modules/next/dist/shared/lib/get-img-props.js` : un loader configuré n'appelle plus jamais
`/_next/image`. Vercel construit `master` sans la variable jusqu'à la phase F, et son API sert ses
médias depuis son disque : un branchement inconditionnel y aurait servi chaque photo en JPEG pleine
taille. Sans la variable (Vercel, `next dev`), rien ne change. L'image Docker l'exige
(`RUN test -n`), sans quoi l'optimiseur reviendrait en silence sur le VPS. La forme est validée au
build (origine exacte, sinon échec) : le loader compare `url.origin` à la valeur, et une barre finale
ferait repasser chaque photo par la source sans rien casser.

**Largeurs : `128, 384, 640, 960, 1280, 1920`, arrondi vers le haut.** Le `srcset` de Next propose 14
largeurs ; elles tombent sur ces 6 paliers (test). Chaque palier correspond à une surface mesurée (avatars
32-64 px en DPR 2 → 128 ; carte de grille à 192 px → 384, le palier que `card-image-sizes.ts` avait
mesuré à 19 Ko contre 51 Ko pour 640 ; carte mobile → 640 ; galerie → 960 ; mosaïque → 1280 ;
visionneuse `100vw` → 1920). `deviceSizes`/`imageSizes` ne sont pas modifiés : le `srcset` garde ses
descripteurs, dont plusieurs pointent vers la même URL arrondie — sans effet sur le téléchargement,
qui ne peut qu'être plus grand que le besoin, jamais plus petit.

**Qualité : 75, unique ; celle d'un composant est ignorée pour les médias.** Aucun composant n'en passe
(`grep -rn 'quality=' src` vide au 2026-09-21), et chaque valeur distincte multiplie la facture par le
nombre de largeurs. Unsplash, lui, la reçoit (`q`) : rien n'y est facturé.

**Hôtes inconnus : l'URL source intacte, la largeur en fragment (`#w=640`).** Next avertit en dev si
l'URL rendue égale `src` (`get-img-props.js:465`). Le fragment n'est jamais envoyé au serveur : ni
requête, ni transformation, ni variante de cache de plus. `blob:`, `data:` et les chemins relatifs
ressortent strictement inchangés (le fragment y serait au mieux ignoré, au pire fautif).

**Mesures (2026-09-21)** : `…/cdn-cgi/image/width=640,quality=75,format=auto,onerror=redirect/_sonde/test.jpg?v=1`
→ `200 image/avif 37 648 o` (Accept avif), `200 image/webp 43 626 o` (Accept webp) — la requête `?v=`
ne gêne pas Transformations ; `width=128` → `200 image/avif 4 040 o`. Build de production avec les
trois variables : la chaîne `cdn-cgi/image` et l'origine de médias figurent dans un chunk client ;
`next start` rend sur `/auth/login` un `srcSet` Unsplash en `w=…&q=75&auto=format` (vérifié `200
image/avif`).

**Ablations** (`src/lib/__tests__/image-loader.test.ts`, `image-loader-branchement.test.ts`), chacune
rougit puis le fichier est restauré :

| retrait | tests rouges |
|---|---|
| arrondi (`width=${width}`) | 2 — « arrondit VERS LE HAUT », « les 14 largeurs … que les paliers du jeu » |
| `,onerror=redirect` | 2 — « réécrit en Transformations … », « passe onerror=redirect … » |
| conservation de la requête (`url.search`) | 2 — « réécrit en Transformations … », « conserve la requête … » |
| condition du branchement (loader inconditionnel) | 1 — « sans NEXT_PUBLIC_MEDIA_URL : l'optimiseur reste » |

**Hors du périmètre de ce ticket, mais exigé par une garde** : `scripts/check-front-env-keys.mjs` impose
que toute `NEXT_PUBLIC_*` soit relevée dans `docs/infra/frontend-deploiement.json` ; l'entrée
`NEXT_PUBLIC_MEDIA_URL` y est ajoutée (non posée sur Vercel, et pourquoi).

**Transition** : entre ce ticket et la bascule de TCK-541, une image `preview` construite avec la
variable sert les photos encore hébergées par l'API (`preview.api.takussan.com/storage/…`) telles
quelles, sans optimiseur. Les deux se déploient ensemble.
