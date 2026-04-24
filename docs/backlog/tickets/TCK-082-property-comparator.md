---
id: TCK-082
title: "Comparateur de biens côte à côte"
status: todo
phase: P2
family: front
estimate: M
created: 2026-04-24
updated: 2026-04-24
depends_on: [TCK-039, TCK-046, TCK-047]
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models:
    - docs/models-spec.md#3-property
    - docs/models-spec.md#4-address
tags: [front, discovery, compare, public]
---

## Objectif utilisateur

Permettre à un Locataire de sélectionner 2 à 4 biens depuis la liste
`/properties`, la carte ou ses favoris et les visualiser dans un tableau
comparatif côte à côte (prix, surface, pièces, amenités, localisation) pour
prendre une décision éclairée.

## Contrat de données

**Frontend uniquement — aucun nouvel endpoint backend.**

Sélection persistée côté client (`localStorage`, clé `takussan.compare.ids`,
TTL 24 h). Rechargement de page = persistance. Max 4 biens ; l'UI empêche un
5ᵉ ajout et propose de remplacer.

Fetch unique à l'ouverture de la page : `GET /api/properties?filter[ids]={ids}&include=address,primaryMedia,amenities,tags&fields[properties]=...`.
Le filtre `ids` existe dans spatie/query-builder (AllowedFilter::exact) — à
confirmer côté backend ; si absent, petit follow-up backend (filtre `ids[]`).

Les biens sont alignés sur un ensemble stable de **lignes de comparaison** :

- Photo principale + titre + prix
- Ville + quartier (depuis Address)
- Type transaction (location / vente)
- Type bien (appartement, maison, studio…)
- Surface (m²)
- Chambres / salles de bain
- Étage / ascenseur / meublé
- Amenités (WiFi, clim, parking…) — ligne par amenity
- Tags
- Bouton "Voir le bien" + "Retirer du comparateur"

## Direction UX / Artistique

**Bouton "Comparer" persistant sur chaque `PropertyCard`** (petit icône
compare/scale). Click → toggle, +badge sur un bouton flottant global bas-droite
"Comparer (N)".

**Flotant bas-droite** : pill compacte qui affiche les N biens sélectionnés +
CTA "Comparer" → redirige vers `/compare?ids=1,2,3`.

**Page `/compare`** : tableau horizontal scrollable sur desktop, version
carrousel par ligne sur mobile (swipe entre biens). Les valeurs divergentes
sont **surlignées** (badge orange clair) pour attirer l'œil. Les colonnes ont
une photo cliquable → fiche bien.

**Empty state** : si `ids` vides dans l'URL ou aucune sélection, afficher un
placeholder avec CTA "Rechercher des biens".

## Contraintes strictes (métier)

- **Min 2, max 4** biens. Moins de 2 → message "Sélectionnez au moins 2 biens".
  Plus de 4 → bloquer l'ajout.
- **Persistance localStorage uniquement** — pas de sauvegarde serveur. La page
  reste fonctionnelle en mode anonyme (visiteur sans compte).
- **Biens non publiés ou supprimés** : la liste retournée par l'API les
  filtre déjà ; l'UI doit afficher un placeholder "Ce bien n'est plus
  disponible" et proposer de le retirer.
- **URL partageable** — `/compare?ids=1,2,3` doit fonctionner en coldshare
  (quelqu'un reçoit le lien et voit le comparatif sans sélection préalable).
  Mais les `ids` de l'URL **remplacent** la sélection locale à l'ouverture.
- **Pas de requête au scroll** — le comparatif est une page finie, pas un
  flux infini. Un seul fetch à l'ouverture.
- **Accessibilité** — le tableau doit avoir un `role=table` correct, les
  lignes `role=row`, les en-têtes `scope=col`, et un contraste AA sur les
  valeurs surlignées.

## Delta à produire

- [ ] Composant `CompareToggleButton` sur `PropertyCard` (existant — TCK-039 / TCK-047)
- [ ] Store léger Zustand / context pour la sélection (`useCompareStore`)
- [ ] Composant `CompareFloatingBar` (bas-droite, sticky)
- [ ] Page `/compare` (server component + hydration)
- [ ] Composant `CompareTable` (desktop) + `CompareCarousel` (mobile)
- [ ] Helper `highlightDivergent(rows)` pour marquer les valeurs divergentes par ligne
- [ ] Hook `useCompareSelection` (sync localStorage ↔ store ↔ URL)
- [ ] i18n fr/en/wo (`compare.*`)
- [ ] Tests Vitest : `useCompareStore`, `highlightDivergent`, `CompareTable`, `CompareFloatingBar`
- [ ] Follow-up backend (si nécessaire) : filtre `ids[]` sur `/api/properties` — à vérifier avant de démarrer

## Critères d'acceptation

- [ ] AC1 — cliquer "Comparer" sur une `PropertyCard` ajoute le bien à la barre flottante qui affiche le count
- [ ] AC2 — 5ᵉ ajout bloqué avec toast "Maximum 4 biens"
- [ ] AC3 — `/compare` avec 1 seul id → empty state "min 2"
- [ ] AC4 — `/compare?ids=1,2,3` en cold-share affiche le tableau même sans sélection locale
- [ ] AC5 — les lignes dont les valeurs divergent entre biens sont surlignées visuellement
- [ ] AC6 — version mobile : swipe entre colonnes par ligne
- [ ] AC7 — la sélection persiste après reload (24 h)
- [ ] AC8 — retirer un bien via la barre ou la page met à jour l'URL et le store

## Hors périmètre

- "Biens similaires / suggestions personnalisées" (P2 dédié, ticket séparé).
- Historique local des biens consultés (P2 dédié).
- Export PDF du comparatif (P3).
- Partage via réseaux sociaux d'un comparateur — juste le lien URL suffit pour le MVP.

## Notes d'implémentation

_(à remplir par implementing-specs)_
