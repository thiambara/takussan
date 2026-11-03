---
id: TCK-040
title: "Fiche bien immersive"
status: done
phase: P0
family: front
estimate: M
wave: 23
created: 2026-04-15
updated: 2026-04-19
depends_on: [TCK-054, TCK-055, TCK-057, TCK-035]
blocks: []
spec_refs:
  features: [docs/features.md#12-recherche--découverte-publique]
  models:
    - docs/models-spec.md#3-property
    - docs/models-spec.md#4-address
    - docs/models-spec.md#10-tag
tags: [front, property, detail, gallery, contact]
---

## Objectif utilisateur

Un visiteur consulte la fiche d'un bien et est convaincu de contacter l'agent pour visiter ou réserver.

## Contrat de données

- `GET /api/public/properties/{slug}` — détail complet avec relations (address, tags, photos, owner, agency, documents, price_history, reviews agrégés)
- `GET /api/public/properties/{slug}/similar` — biens similaires
- `GET /api/public/properties/{slug}/reviews` — liste paginée des avis
- `POST /api/public/properties/{slug}/visit-requests` — demande de visite (anonyme ou auth)
- `POST /api/public/properties/{slug}/booking-requests` — réservation (auth)
- `POST /api/public/properties/{slug}/contact` — message direct (auth, réutilise conversation)
- `POST /api/public/properties/{slug}/report` — signalement (throttle)
- Médias : `property.getMedia('photos')` avec conversions thumbnail/preview/original

## Direction UX / Artistique

- **Galerie photo est l'élément central** : mosaïque 2×3 desktop, carrousel embla mobile, lightbox plein écran.
- **Caractéristiques** : icônes pour chambres, surface, salles de bain, parking. Tableau typé.
- **Bloc prix + CTA** : sticky sidebar desktop 380px, bottom bar fixe mobile.
- **Tags/amenités** : badges visuels via `PropertyAmenities`.
- **Localisation** : OpenStreetMap iframe si lat/lng, fallback texte.
- **Biens similaires + déjà consultés** : carrousel + grille en bas de page.
- **Référence du bien** affichée dans le header.

## Contraintes strictes (métier)

- État d'erreur : bien introuvable → `not-found.tsx` via `notFound()` de `next/navigation`
- Boutons CTA : Visite (dialog, anonyme ou auth), Réservation (dialog, auth requise), Message (dialog, auth requise), Partage (dialog copy-link + 4 plateformes)
- Responsive : galerie mobile swipe embla, CTA en barre fixe basse
- Prix affiché en XOF via `formatPrice()` de `src/lib/utils.ts`

## Delta à produire

- [x] Page `/properties/[slug]` orchestrant toutes les sections (hero, header, specs, description, caractéristiques, amenities, localisation, historique prix, documents, avis, similaires, déjà consultés)
- [x] Dialogs Visite, Réservation, Message, Partage, Signalement
- [x] Sidebar sticky desktop + bottom bar mobile
- [x] Favoris (toggle DB auth ou localStorage anonyme)
- [x] Biens similaires + déjà consultés (localStorage)
- [x] Section tags/amenités avec badges visuels
- [x] Skeleton complet dans `loading.tsx`

## Critères d'acceptation

- [x] La fiche bien affiche la galerie, les détails complets et le bloc prix/CTA
- [x] Le bloc prix/CTA reste visible en scroll (sticky desktop, barre fixe mobile)
- [x] Un bien introuvable affiche la page 404 customisée
- [x] Les formulaires CTA sont fonctionnels (visite, réservation, message, signalement)
- [x] Les prix sont affichés en XOF formaté via `formatPrice()`
- [x] Partage : copier lien + 4 plateformes fonctionnels
- [x] Avis : liste + note moyenne + distribution affichées ; formulaire si auth
- [x] Biens similaires (carrousel) et déjà consultés (grille) fonctionnent

## Hors périmètre

- Messagerie in-app UI complète (stub `/messages/[id]`, → TCK-045)
- Carte interactive Leaflet avancée (iframe OSM pour l'instant, → TCK-047)
- Migration automatique favoris localStorage → DB au login
- Signature électronique de documents
