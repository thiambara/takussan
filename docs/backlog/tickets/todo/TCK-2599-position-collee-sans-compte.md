---
id: TCK-2599
title: "Coller un lien Google Maps ou une position WhatsApp sans être connecté"
status: todo
phase: P1
family: back
estimate: S
wave: 86
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: [TCK-2600]
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  models:
    - "docs/models-spec.md#3-property"
tags: [back, geo, publish, audit-ux, app]
---

## Objectif utilisateur

Le propriétaire qui commence son annonce sans compte (TCK-2600) colle la position que son voisin lui a envoyée sur WhatsApp, comme le fait aujourd'hui l'utilisateur connecté.

## Contrat de données

Re-mesure sur `dev` (1bce3798a) : `POST /api/geo/resolve-link` (`GeoLinkController`, `routes/api/geo.php:30`) est sous `auth:sanctum` + `throttle:20,1`. Le reste de l'étape « Lieu » est déjà public (`/api/public/geo/regions|cities|neighborhoods`, `/api/public/amenities`).

- **À créer** : `POST /api/public/geo/resolve-link`, même corps (`{url}`), même réponse que la route authentifiée, servi par le même contrôleur.
- La route authentifiée reste (les appelants actuels ne changent pas).

## Direction UX / Artistique

Sans objet : ticket back. L'écran qui consomme ce contrat est dit dans « Hors périmètre ».

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0093](../../../adr/0093-publier-sans-compte-le-brouillon-vit-dans-le-navigateur.md).
- Limiteur nommé par IP (`throttle:public-geo-link`, 10 par minute) ; la route authentifiée garde le sien.
- Le serveur ne suit que les hôtes qu'il suit aujourd'hui (liens Google Maps, liens courts, position WhatsApp) : aucune URL arbitraire n'est récupérée pour un anonyme.
- Aucune écriture : la résolution ne crée rien en base.

## Delta à produire

- [ ] Route `POST /api/public/geo/resolve-link` dans `routes/api/geo.php`, groupe `public/geo`, middleware `throttle:public-geo-link` (déclaré dans `AppServiceProvider`).
- [ ] Réutilisation de `GeoLinkController` et de sa FormRequest.
- [ ] Tests : `PublicGeoResolveLinkTest` — anonyme résout un lien Google Maps (200, mêmes champs que la route authentifiée) ; hôte hors liste refusé (422) ; 11ᵉ appel dans la minute → 429.

## Critères d'acceptation

- [ ] AC1 — Sans jeton, `POST /api/public/geo/resolve-link` avec un lien Google Maps rend la latitude et la longitude que rend la route authentifiée pour le même lien.
- [ ] AC2 — Un lien vers un hôte non suivi rend 422 sans requête sortante (vérifié par le faux client HTTP).
- [ ] AC3 — Le 11ᵉ appel d'une même IP dans la minute rend 429.

## Hors périmètre

- L'écran (TCK-2600).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
