---
id: TCK-540
title: "Le front sert les images par Cloudflare Transformations — l'optimiseur de Next ne tourne plus sur le VPS"
status: todo
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

- [ ] `images.loader = 'custom'` + `loaderFile` : une URL dont l'origine est `NEXT_PUBLIC_MEDIA_URL`
      devient `<media>/cdn-cgi/image/width=<w>,quality=<q>,format=auto,onerror=redirect/<chemin+requête>`.
- [ ] La largeur est **arrondie vers le haut** à un jeu fixe et court (documenté, justifié par la
      facturation) ; `quality` a une valeur par défaut unique.
- [ ] Toute autre URL (Unsplash, picsum, `blob:`, `data:`, relative, `NEXT_PUBLIC_MEDIA_URL` vide
      en dev) est rendue **sans casser** : paramètres natifs pour Unsplash, inchangée sinon.
- [ ] `NEXT_PUBLIC_MEDIA_URL` : `ARG` + contrôle du `Dockerfile`, `build-args` d'`images.yml`
      (`https://media-preview.takussan.com` pour `preview`), `.env.example`.
- [ ] `remotePatterns` accepte le domaine de médias.
- [ ] Tests unitaires du loader couvrant chaque branche, et **ablation notée** (le test rougit si
      l'arrondi ou le passage `onerror=redirect` disparaît).
- [ ] `npm run lint`, `npx tsc --noEmit`, tests touchés verts ; `npm run build` passe.
