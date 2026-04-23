---
id: TCK-038
title: "Page d'accueil & découverte"
status: review
phase: P0
family: front
estimate: S
created: 2026-04-15
updated: 2026-04-23
depends_on: [TCK-054, TCK-055, TCK-058, TCK-024]
blocks: []
spec_refs:
  features: [docs/features.md#12-recherche--découverte-publique]
  models: [docs/models-spec.md#3-property]
tags: [front, homepage, hero, featured]
---

## Objectif utilisateur

Un visiteur atterrit sur la page d'accueil et est immédiatement inspiré à explorer les biens disponibles.

## Contrat de données

- `GET /api/public/properties?featured=true` — biens en vedette
- `GET /api/public/properties?sort=created_at&order=desc&per_page=6` — derniers ajouts
- `GET /api/public/properties?search={query}` — recherche plein-texte (depuis TCK-024)
- Réponse paginée standard Laravel avec données Property (title, price, type, contract_type, photos thumbnail, address.city, address.neighborhood)

## Direction UX / Artistique

- **Hero section percutante** : grande image/illustration + barre de recherche centrale. C'est le premier contact — il doit inspirer confiance et envie.
- **Section "Biens en vedette"** : cartes de biens avec photo, prix, localisation. Design des PropertyCards à la discrétion de l'IA (grille, carousel, masonry…).
- **Section "Derniers ajouts"** : similaire mais tri par récence.
- **Animations** : au scroll (fade-in, slide), mais sobres — pas de UI qui flash.
- **États de chargement** : skeletons élégants pendant le fetch.

## Contraintes strictes (métier)

- Les données viennent exclusivement de l'API Laravel (pas de mock, pas de données en dur)
- La barre de recherche redirige vers la page de résultats (→ TCK-039)
- Responsive obligatoire
- Les PropertyCards créées ici seront réutilisées dans TCK-039

## Delta à produire

- [ ] Hero section avec barre de recherche
- [ ] Section biens en vedette (featured)
- [ ] Section derniers ajouts
- [ ] Skeletons pour chaque section
- [ ] Redirection vers `/properties?search={query}` au submit recherche

## Critères d'acceptation

- [ ] La homepage affiche les biens en vedette et les derniers ajouts depuis l'API
- [ ] La barre de recherche redirige vers `/properties?search={query}`
- [ ] Les skeletons s'affichent pendant le chargement

## Hors périmètre

- Page résultats de recherche (→ TCK-039)
- Fiche bien (→ TCK-040)
- Favoris (→ P1)

## Notes d'implémentation (Wave 3)

- Homepage refactorée dans `src/components/property/HomepageDiscovery.tsx`
  (nouvelle surface canonique) ; `src/app/(public)/page.tsx` pointe
  désormais vers ce composant. L'ancien `src/components/HomePage.tsx`
  reste en place mais n'est plus référencé — à retirer dans un pass de
  cleanup.
- La barre de recherche provient du `Navbar` (déjà existant en Wave 2).
  Elle redirige vers `/properties` en mappant l'entrée utilisateur sur
  `city=` (la navbar est typée « Où cherchez-vous ? ») plutôt que sur
  `search={query}` comme le suggère le ticket. Divergence mineure
  relative au wording AC — le back-end n'expose pas `search=` mais `q=`.
- Skeletons élégants par section (7 cartes en placeholder).
