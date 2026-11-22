---
titre: "Retirer de Dokploy les clés CDN_* et BUNNY_* de l'intégration CDN de TCK-105"
type: cle-env
tickets: [TCK-2463]
cles: [CDN_ENABLED, CDN_PROVIDER, CDN_BASE_URL, CDN_PULL_ZONE, CDN_SIGNING_KEY, CDN_SIGNATURE_TTL, CDN_HEALTH_THRESHOLD, CDN_HEALTH_WINDOW, CDN_HEALTH_COOLDOWN, BUNNY_ACCESS_KEY, BUNNY_STORAGE_ZONE]
creee: 2026-11-16
preview: fait
production: sans-objet
---

## Quoi faire

TCK-2463 retire l'intégration CDN de TCK-105 (pilotes Bunny/Cloudflare, signature, purge, sonde `cdn`) et
`config/cdn.php` : plus rien ne lit ces onze clés. Les gabarits ne les déclarent plus. Une clé restée dans
Dokploy n'y casse rien, mais elle y fait croire à un CDN branché.

⚠ **Avant le déploiement qui porte TCK-2463** : vérifier que `CDN_ENABLED` n'est pas `true` dans l'onglet
Environment de l'API. Le retrait n'est prouvé sans changement d'URL que pour `cdn.enabled = false`
(`MediaUrlGenerationTest`) ; un `true` posé y réécrivait les URL de médias vers le CDN, et le déploiement
les ramènerait sur R2.

1. Relever les clés réellement posées, noms seuls, par `comparer-config-env.php --contre-courant`
   contre le gabarit courant (`docs/infra/hebergement.md`, étape 3) : les clés `CDN_*` et `BUNNY_*`
   posées sortent parmi les « clés posées que le fichier ne déclare pas ».
2. Dans l'onglet *Environment* de l'API de préproduction, retirer celles qui y figurent.
3. Ne **pas** retirer `CLOUDFLARE_ACCOUNT_ID` ni `CLOUDFLARE_API_TOKEN` : ils ont changé de section
   (« 17. PDF ») et restent lus par le pilote `cloudflare` de `spatie/laravel-pdf`.
4. Déployer.

## Comment vérifier

- `comparer-config-env.php --contre-courant` ne nomme plus aucune clé `CDN_*` ni `BUNNY_*`.
- La page super-admin « Santé du système » n'affiche plus de tuile CDN, et `/api/admin/health` ne rend plus
  de clé `cdn`.
- L'URL d'une photo de bien publiée (`thumbnail`) relevée avant le déploiement est identique après.
- `GET /api/media/{id}/sign` rend 404.

## Historique

- 2026-11-16 · preview · fait · Claude (session, pour le porteur) · 11 clés retirées, 316 → 305 lignes, CDN_ENABLED=false avant
- 2026-11-16 · production · sans-objet · Claude (TCK-2463) · aucune production n'existe, et son gabarit `deploy/takussan/env.api.production.example` ne déclare plus ces clés : elle naîtra sans elles
- 2026-11-16, préproduction — promotion #1691 (`ac2a32f66`, fusionnée 23:27:40 Z, `images.yml` 43979477538 vert à 23:34:49 Z) ; `CDN_ENABLED` relevé à `false` avant le retrait.
  Les onze clés retirées du Compose `takussan-api-preview` par `compose.update` (200) : `CDN_BASE_URL`, `CDN_PULL_ZONE`,
  `CDN_SIGNING_KEY`, `BUNNY_ACCESS_KEY`, `BUNNY_STORAGE_ZONE`, `CDN_ENABLED`, `CDN_PROVIDER`, `CDN_SIGNATURE_TTL`,
  `CDN_HEALTH_THRESHOLD`, `CDN_HEALTH_WINDOW`, `CDN_HEALTH_COOLDOWN` ; relu : 316 → 305 lignes, le reste identique ;
  `CLOUDFLARE_ACCOUNT_ID` et `CLOUDFLARE_API_TOKEN` gardées. Environnement d'avant :
  `~/Sauvegardes/env-takussan-api-preview-avant-retrait-cdn-2026-11-16.env` (0600). Les conteneurs en cours gardent
  ces variables jusqu'au prochain déploiement (rien ne les lit).
