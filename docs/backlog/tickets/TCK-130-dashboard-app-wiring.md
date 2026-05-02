---
id: TCK-130
title: "Dashboard /app — câblage tuiles & contenu personnalisé"
status: todo
phase: P1
family: front
estimate: M
created: 2026-05-02
updated: 2026-05-02
depends_on: [TCK-032]
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
  models:
    - docs/models-spec.md#1-user
    - docs/models-spec.md#3-property
    - docs/models-spec.md#14-lease-
    - docs/models-spec.md#16-favorite-
tags: [front, dashboard, p1]
---

## Objectif utilisateur

Tout utilisateur authentifié (locataire, agent, bailleur) ouvre `/app` et voit immédiatement les indicateurs clés de son rôle, sans page « En cours de développement ».

## Contrat de données

Endpoint adaptatif fourni par TCK-032 (`GET /api/dashboard/me`) — la réponse varie selon les rôles de l'utilisateur authentifié et expose les blocs nécessaires (`stats`, `widgets`, `links`).

Le frontend doit utiliser `fields[...]` et `include=` selon les conventions Spatie ; jamais de fetch global ni de filtrage côté client.

## Direction UX / Artistique

- Densité **dashboard** sobre, pas marketing — privilégier la lecture immédiate des chiffres.
- Conserver la grille `2/4 colonnes` actuelle pour les KPIs ; chaque tuile = un chiffre fort + un libellé court + un delta (↑/↓) si l'API le fournit.
- Sous les KPIs : zones par rôle (raccourcis "Mes biens", "Mes baux", "Messages non lus", "Tâches", etc.) — l'IA décide du layout (cards, listes condensées).
- États vides explicites par rôle (ex : locataire sans bail → CTA "Explorer les biens").
- Pas de StubPlaceholder résiduel.
- Cohérent avec la sidebar `app` et le design system actuel (TCK-129).

## Contraintes strictes (métier)

- Respecter le rôle effectif (`isAgent`, `isAdmin`, `isLandlord`, `isCustomer`) — un même compte peut cumuler plusieurs rôles, le dashboard doit composer.
- Si super_admin sans `agency_id` : conserver le `NoAgencyState` existant (TCK-115).
- Aucun chiffre fictif : `—` tant que l'API n'a pas répondu, valeur réelle ensuite.
- Permissions : ne jamais exposer une métrique d'une autre agence/portefeuille.

## Delta à produire

- [ ] Page UI: `src/app/(dashboard)/app/page.tsx` — retirer `<StubPlaceholder>` et remplacer par les blocs câblés
- [ ] Composants `DashboardKpiTile`, `DashboardSection`, et widgets par rôle (locataire / agent / bailleur)
- [ ] Hook/query React Query pour `GET /api/dashboard/me` avec `fields[...]`
- [ ] Skeletons `loading.tsx` cohérents avec le layout final
- [ ] États vides par rôle avec CTA pertinents
- [ ] Tests UI (rendu par rôle, état vide, état chargé)

## Critères d'acceptation

- [ ] Le composant `StubPlaceholder` n'est plus utilisé sur `/app`
- [ ] Un compte locataire voit des KPIs centrés sur favoris / réservations / baux / messages avec données réelles
- [ ] Un compte agent voit des KPIs centrés sur biens actifs / clients / pipeline / commissions
- [ ] Un compte cumulant plusieurs rôles voit les blocs combinés sans doublon
- [ ] Un super_admin sans agence affiche `NoAgencyState`
- [ ] Aucun appel ne retourne tous les champs d'une ressource (sparse fieldsets respectés)

## Hors périmètre

- Implémentation de l'endpoint `GET /api/dashboard/me` (TCK-032)
- Graphiques temporels (P2, ticket dédié)
- Export CSV/PDF (P2, ticket dédié)
- Personnalisation des KPIs par utilisateur (P3)

## Notes d'implémentation

_(à remplir par implementing-specs)_
