---
id: TCK-2844
title: Photo d'un quartier posée par le super-admin, servie sur les tuiles de l'accueil
status: todo
phase: P2
family: full
estimate: M
wave: null
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
    - "docs/features.md#12-recherche--découverte-publique"
  models:
    - "docs/models-spec.md#91-geoneighborhood-"
tags: [back, front, geo, media, super-admin, homepage]
---

## Objectif utilisateur

Le visiteur reconnaît un quartier à sa photo sur l'accueil, et le super-admin pose cette photo en quelques gestes, aidé de propositions qu'il peut utiliser sans créditer personne.

## Contrat de données

Décision : [ADR-0109](../../../adr/0109-la-photo-d-un-quartier.md) — à lire avant tout, elle fixe la collection, la conversion, le filtre de licence, l'import par titre et la fusion.

Endpoints (tous sous `auth:sanctum` + `super-admin`, préfixe `admin/geo`, sauf le dernier) :

- `GET  /api/admin/geo/neighborhoods` — existant : chaque ligne gagne `cover` (`{ url, source }` ou `null`) ; tri `addresses_count` accepté (`sort=-addresses_count`).
- `GET  /api/admin/geo/neighborhoods/{neighborhood}/cover/suggestions` → `{ data: [{ title, thumb_url, width, height, author, license, page_url }], meta: { unavailable: bool } }`.
- `POST /api/admin/geo/neighborhoods/{neighborhood}/cover` — multipart `file`.
- `POST /api/admin/geo/neighborhoods/{neighborhood}/cover/import` — `{ source: "wikimedia", title: "File:…" }`.
- `DELETE /api/admin/geo/neighborhoods/{neighborhood}/cover` → 204.
- `GET  /api/public/properties/neighborhoods` — existant : chaque ligne gagne `photo` (URL de la conversion `display`, ou `null`).

Les trois écritures rendent la ligne au format de l'index (`cover` compris).

## Direction UX / Artistique

- **Tuile de l'accueil** : la `TuileQuartier` de la maquette de l'accueil (`playground/maquettes/pages/accueil.tsx`) fait foi au pixel (ADR-0106) — photo plein cadre centrée, dégradé du bas, nom et compte en clair. Sans photo, la tuile d'aujourd'hui (motif bogolan) ne change pas. Une photo qui ne se charge pas retombe sur le motif.
- **Console** (`/super-admin/geo`) : à côté de la file des propositions, une vue des quartiers approuvés — ville choisie, recherche par nom, les plus fournis en biens d'abord (ce sont ceux de l'accueil). Par quartier : la photo actuelle vue **comme la tuile de l'accueil** (même cadrage carré), « Envoyer une photo », « Retirer », les propositions Wikimedia en grille (un clic importe), et « Chercher sur Unsplash » (nouvel onglet). Sobre, dense, dans le ton des autres écrans du super-admin.
- Quand Wikimedia ne propose rien ou ne répond pas, le dire en une phrase et laisser l'envoi et Unsplash disponibles.

## Contraintes strictes (métier)

- Super-admin seulement ; un quartier `pending`, `rejected` ou fusionné → 422 `geo_cover.not_approved`, rien d'écrit.
- Fichier : `image`, `mimes:jpeg,png,webp`, 10 Mo au plus.
- **Propositions** : seuls les fichiers de Commons dont `extmetadata.AttributionRequired` vaut `"false"` et larges de 800 px au moins. Commons en panne ou trop lent (timeout 5 s) → `data: []`, `meta.unavailable: true`, statut 200.
- **Import par titre, jamais par URL** : le serveur relit le fichier sur Commons, refuse 422 `geo_cover.attribution_required` si l'attribution est désormais exigée, 422 `geo_cover.source_not_found` si le titre n'existe pas, 503 `geo_cover.source_unavailable` si Commons ne répond pas ; l'URL téléchargée doit être en `https://upload.wikimedia.org/` ; la taille téléchargée est bornée à 10 Mo et le type vérifié comme pour un envoi.
- Appels à Commons avec un `User-Agent` qui identifie l'application (`config('services.wikimedia.user_agent')`), sans aucune donnée d'utilisateur.
- Aucun crédit dans les réponses publiques : `photo` est une URL seule. La provenance (`source`, `source_url`, `author`, `license`) vit dans les `custom_properties` du média.
- Fusion : la cible garde sa photo ; sinon celle de la source lui est déplacée ; la source fusionnée n'a plus de photo.
- Codes d'erreur neufs présents dans les fichiers de langue (`LangGroupParity`).
- Front : texte par next-intl (`fr`, `en` ; `wo` = le texte français tel quel, wolof en pause).

## Delta à produire

**API (prescriptif)**

- [ ] `GeoNeighborhood` : `implements HasMedia`, `InteractsWithMedia` ; collection `cover` (`singleFile`, disque `media-library.public_disk_name`, `acceptsMimeTypes`) ; conversion `display` (`Fit::Max` 1200, `format('webp')`, `nonQueued`, `performOnCollections('cover')`) ; accesseur de l'URL de `display`.
- [ ] Config `services.wikimedia` (`endpoint` = `https://commons.wikimedia.org/w/api.php`, `user_agent`, `timeout`).
- [ ] Service `App\Services\Geo\WikimediaCovers` : `suggestions(GeoNeighborhood): array` et `fichier(string $title): array` (url, auteur, licence, page, attribution exigée).
- [ ] Contrôleur `App\Http\Controllers\Api\Admin\GeoNeighborhoodCoverController` (`suggestions`, `store`, `import`, `destroy`) ; FormRequests `GeoCoverUploadRequest`, `GeoCoverImportRequest` ; routes nommées `admin.geo.neighborhoods.cover.*` dans `routes/api/geo.php`.
- [ ] `GeoNeighborhoodAdminController` : `cover` dans `format()`, tri `addresses_count`.
- [ ] `GeoNeighborhoodModeration::fusionner()` : déplacement de la photo.
- [ ] `PublicPropertyController::neighborhoods()` : `photo` par ligne, rapprochée du référentiel (ville + nom replié par `CaseInsensitive`, approuvé, non fusionné), sans requête par ligne.
- [ ] Tests : `tests/Feature/Geo/GeoNeighborhoodCoverTest.php` (envoi, retrait, refus non-admin, refus quartier en attente, fichier invalide, import accepté, import refusé si attribution exigée, hôte d'URL refusé, Commons en panne), `tests/Feature/Geo/WikimediaCoversTest.php` (filtrage des propositions, `unavailable`), `tests/Feature/Geo/PublicNeighborhoodsPhotoTest.php` (`photo` présente / `null`), fusion dans `GeoNeighborhoodModerationTest`. Commons toujours simulé (`Http::fake`), jamais appelé par la suite.

**Front (intentionnel)**

- [ ] Vue des quartiers approuvés et gestion de la photo dans `/super-admin/geo`.
- [ ] Tuile photo de l'accueil, repli bogolan.
- [ ] Type et lecture de `photo` dans la requête des quartiers de l'accueil.
- [ ] Tests vitest des deux.

## Critères d'acceptation

- [ ] AC1 — Un super-admin envoie un JPEG sur un quartier approuvé : `GET /public/properties/neighborhoods?city=…` rend une `photo` non nulle pour ce quartier, `null` pour les autres.
- [ ] AC2 — Un non super-admin reçoit 403 sur les quatre routes `cover` ; un quartier en attente reçoit 422 `geo_cover.not_approved` et n'a aucun média.
- [ ] AC3 — Les propositions excluent un fichier dont Commons dit `AttributionRequired = "true"`, même si la recherche le rend en premier.
- [ ] AC4 — L'import d'un titre dont Commons dit (au moment de l'import) `AttributionRequired = "true"` rend 422 `geo_cover.attribution_required` et ne télécharge rien ; une `url` hors `upload.wikimedia.org` est refusée sans être appelée.
- [ ] AC5 — Fusionner un quartier avec photo dans une cible sans photo : la cible a la photo, la source n'en a plus ; dans une cible avec photo : la cible garde la sienne.
- [ ] AC6 — Aucune réponse publique ne contient l'auteur, la licence ou la page source.
- [ ] AC7 — Sur l'accueil, la tuile d'un quartier avec photo montre la photo et le dégradé de la maquette ; sans photo, la tuile est identique à celle d'avant ce ticket.
- [ ] AC8 — Dans la console, une proposition Wikimedia s'importe en un clic, et « Chercher sur Unsplash » ouvre `unsplash.com` dans un nouvel onglet, sur le nom du quartier et de la ville.

## Hors périmètre

- La photo sur les pages de quartier indexables, la recherche mobile, la page « plus disponible ».
- Le recadrage interactif ; plusieurs photos par quartier ; une photo de ville.
- L'API Unsplash (elle imposerait crédit et hotlinking — ADR-0109 §2).
- Les photos de Commons sous CC BY / BY-SA (crédit exigé, contraire à la décision 3 c).

## Notes d'implémentation

_(à remplir par implementing-specs)_
