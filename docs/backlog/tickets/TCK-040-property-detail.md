---
id: TCK-040
title: "Fiche bien immersive"
status: todo
phase: P0
family: front
estimate: M
created: 2026-04-15
updated: 2026-04-15
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

- `GET /api/public/properties/{id}` — détail complet avec relations (address, tags de type amenity, media photos)
- Médias : `property.getMedia('photos')` avec conversions thumbnail/preview/full
- Données retournées : toutes les colonnes Property + address complète + tags + photos

## Direction UX / Artistique

- **Galerie photo est l'élément central**. L'IA choisit la disposition (masonry, grille, carousel plein écran, lightbox). Penser Airbnb : la photo vend.
- **Caractéristiques** : icônes pour chambres, surface, salles de bain, parking. Pas de liste texte brute.
- **Bloc prix + CTA** : reste visible (sticky sur desktop, bottom bar sur mobile). Boutons "Contacter l'agent" / "Réserver".
- **Tags/amenités** : badges visuels (piscine, clim, meublé…).
- **Localisation** : indication du quartier/ville. Pas besoin de carte interactive complète ici (→ P1).
- **Biens similaires** : section en bas si données disponibles, sinon placeholder.
- **Référence du bien** : affichée discrètement (ex: "Réf. TK-2025-001").

## Contraintes strictes (métier)

- Gestion de l'état d'erreur : bien introuvable → page 404 customisée
- Le bouton "Contacter l'agent" ouvre un formulaire de contact simple (nom, email, message, envoi email via backend). Pas de messagerie in-app (→ TCK-029/045).
- Responsive : galerie adaptée mobile (swipe), CTA en barre fixe basse
- Le prix doit être affiché en XOF avec formatage localisé (ex: "150 000 XOF/mois" ou "25 000 000 XOF")

## Delta à produire

- [ ] Page `/properties/[id]` avec galerie, détails, prix, CTA
- [ ] Formulaire de contact agent
- [ ] Page 404 customisée pour bien introuvable
- [ ] Section tags/amenités avec badges visuels
- [ ] Version mobile adaptée (galerie swipe, CTA barre fixe)

## Critères d'acceptation

- [ ] La fiche bien affiche la galerie, les détails complets et le bloc prix/CTA
- [ ] Le bloc prix/CTA reste visible en scroll (sticky desktop, barre fixe mobile)
- [ ] Un bien introuvable affiche la page 404 customisée
- [ ] Le formulaire de contact agent est fonctionnel
- [ ] Les prix sont affichés en XOF formaté

## Hors périmètre

- Messagerie in-app (→ TCK-045)
- Carte interactive (→ TCK-047)
- Favoris (→ TCK-046/047)
