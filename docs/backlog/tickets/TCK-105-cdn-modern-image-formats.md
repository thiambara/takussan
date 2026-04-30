---
id: TCK-105
title: "CDN + webp/avif"
status: done
phase: P2
family: technique
estimate: S
created: 2026-04-24
updated: 2026-04-27
depends_on: [TCK-016, TCK-050]
blocks: []
spec_refs:
  features:
    - docs/features.md#27-médias--fichiers
  models: []
tags: [back, infra, cdn, performance]
---

## Objectif utilisateur

Permettre à tout visiteur ou utilisateur authentifié d'afficher les médias
(photos de biens, avatars, documents publics) avec un temps de chargement
quasi instantané, peu importe sa localisation, en consommant un volume de
données réduit grâce aux formats modernes (webp/avif) et au cache CDN.

## Contrat de données

**Backend — Configuration & abstraction** :

- Aucune migration : le CDN est une couche au-dessus du storage S3/MinIO
  existant (TCK-016) et des conversions media-library (TCK-050).
- Service `App\Services\Media\MediaUrlResolver` qui transforme une URL
  storage en URL CDN selon la conversion demandée (`thumb`, `card`, `web`,
  `original`). Le résolveur retourne aussi les variants `webp` / `avif`
  quand le navigateur les supporte (via param Accept ou suffixe d'URL).
- Override des URL générées par Spatie media-library pour passer par le
  resolver (pas de fetch direct du `disk` côté frontend).
- Support URLs signées (TTL court, ex: 5 min) pour les biens privés/documents
  sensibles — flag `requires_signature` par collection média.

**Endpoints touchés** :

- Toutes les ressources qui exposent un média (`PropertyResource`,
  `UserResource`, `LeaseResource`…) renvoient désormais des URLs CDN ;
  pas de nouvel endpoint applicatif.
- Optionnel : `GET /api/media/{id}/sign` pour générer une URL signée à la
  demande côté frontend (utilisé pour les documents privés).

**Configuration** :

- `config/media.php` ou `config/cdn.php` : `provider` (bunny | cloudflare),
  `base_url`, `signing_key`, `default_format_chain` (avif > webp > jpeg).
- ENV `CDN_PROVIDER`, `CDN_BASE_URL`, `CDN_SIGNING_KEY`, `CDN_PULL_ZONE`.

## Contraintes strictes (métier)

- **Original toujours intact** : le CDN ne touche jamais aux fichiers
  originaux stockés ; les conversions sont servies depuis les variants déjà
  générés par media-library (TCK-050) ou via les transformations natives du
  CDN (image optimization).
- **Fallback obligatoire** : si le CDN est indisponible (HTTP 5xx > seuil),
  le resolver doit retomber sur l'URL storage directe (pas de page cassée).
  Loguer l'incident.
- **Médias privés** : tout média rattaché à un Lease, un Document
  contractuel, ou un bien archivé non publié doit utiliser une URL signée
  TTL ≤ 5 min — jamais d'URL CDN publique permanente.
- **Headers Accept** : la sélection avif/webp/jpeg est négociée via
  `Accept: image/avif,image/webp,*/*` côté CDN ; ne pas livrer un avif à
  un Safari < 16 (fallback webp/jpeg automatique).
- **Cache invalidation** : si une photo de bien est remplacée ou supprimée,
  une purge CDN ciblée doit être déclenchée (job async). Pas d'effet
  immédiat acceptable, mais TTL max d'éviction 5 min.
- **Pas de breaking change frontend** : les composants existants
  consommant `media.url` doivent continuer à fonctionner — la bascule est
  transparente.
- **Coût** : prévoir des limites de taille / compteurs d'usage pour
  éviter les surfacturations en cas d'abus (logs upload massif).

## Delta à produire

- [ ] Service `App\Services\Media\MediaUrlResolver` (résolution CDN + signature)
- [ ] Override `Media::getUrl()` ou macro pour passer par le resolver
- [ ] Job `App\Jobs\Media\PurgeCdnCacheJob` (déclenché sur replace/delete)
- [ ] Endpoint `GET /api/media/{id}/sign` (optionnel — URLs signées à la demande)
- [ ] Config `config/cdn.php` + variables ENV documentées (`.env.example`)
- [ ] Migration de configuration : ajouter `requires_signature` aux collections sensibles (lease docs, archives)
- [ ] Drivers `BunnyCdnDriver` et `CloudflareCdnDriver` implémentant un contrat `CdnProvider`
- [ ] Health-check CDN exposé dans `/api/health` (via TCK-013 si présent, sinon ajout local)
- [ ] Tests `MediaUrlResolverTest` (3 formats × signed/public × fallback)
- [ ] Tests d'intégration purge cache (mock provider)
- [ ] Documentation infra `docs/infra/cdn.md` (provider, rotation clé, runbook)

## Critères d'acceptation

- [ ] AC1 — `Media::url()` d'une photo de bien public renvoie une URL CDN
  publique (host = `CDN_BASE_URL`)
- [ ] AC2 — la même URL servie à un client `Accept: image/avif` retourne
  un avif ; servie sans Accept retourne un jpeg
- [ ] AC3 — un média rattaché à un lease privé renvoie une URL signée
  expirant à TTL ≤ 5 min ; un client non authentifié ne peut pas
  régénérer une signature
- [ ] AC4 — si le CDN renvoie 5xx, le resolver retombe sur l'URL storage
  directe et écrit un log warning
- [ ] AC5 — supprimer un média déclenche `PurgeCdnCacheJob` ; après le
  job, l'URL renvoie 404 (vérifié via mock)
- [ ] AC6 — la conversion `web` (TCK-050) servie par le CDN pèse < 70 % du
  poids du jpeg équivalent à qualité visuelle similaire (vérifié sur 1
  échantillon dans le test)
- [ ] AC7 — `php artisan config:show cdn` liste tous les paramètres requis
  et le pipeline de fallback de format

## Hors périmètre

- Génération des conversions (déjà fait dans TCK-050).
- Upload S3/MinIO (déjà fait dans TCK-016).
- CDN pour assets statiques Next.js (géré par Vercel/Cloudflare côté front,
  ticket dédié si besoin).
- Lazy-loading et placeholder côté frontend (optimisation UI dédiée).
- Migration de l'historique des médias déjà en base (script one-shot
  séparé si nécessaire).
- Watermark applicatif (couvert par TCK-106).

## Notes d'implémentation

_(à remplir par implementing-specs)_
