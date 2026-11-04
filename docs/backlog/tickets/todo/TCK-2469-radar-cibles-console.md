---
id: TCK-2469
title: "Radar : la console des cibles — créer, régler, mettre en pause, et voir ce que chaque cible a trouvé"
status: todo
phase: P2
family: front
estimate: M
wave: 81
created: 2026-11-04
updated: 2026-11-04
depends_on: [TCK-2468]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [front, radar, cibles, super-admin, adr-0087]
---

## Objectif utilisateur

L'opérateur règle en une minute ce que le Radar cherche, et voit d'un coup d'œil ce que chaque recherche rapporte.

## Contrat de données

Routes de TCK-2468 (`/api/admin/radar/targets…`, `PATCH /api/admin/radar/crawl/sources/{site}` avec `scope`), et
`RadarListingResource` existant pour la liste des annonces d'une cible. Lieux et types : les mêmes sources de données que
les filtres de la recherche publique (villes, quartiers, `PropertyType`) — à re-mesurer. Sparse fieldsets obligatoires.

## Direction UX / Artistique

- Une page « Cibles » dans la section Radar de la console super-admin, à côté de la collecte et de l'observatoire.
- Liste dense : nom, résumé lisible des critères (« Appartement · location · Almadies, Ngor · 300 000 – 700 000 F ·
  2-3 ch. »), origine (badge discret « opérateur » / « demande »), état, épinglée, annonces trouvées, dernière trouvaille.
- Création et réglage dans un panneau : les critères se choisissent comme dans les filtres de la recherche publique
  (mêmes contrôles, même vocabulaire), avec l'aperçu du résumé en direct.
- Le détail d'une cible montre ses annonces (carte compacte : photo, prix, quartier, site, étape) et mène à la fiche
  annonce existante.
- Le réglage `scope` (« ciblée » / « tout ») apparaît sur la page de collecte, avec une phrase qui dit la conséquence
  (« ciblée : seules les annonces qui peuvent correspondre à une cible sont lues »).
- Le niveau `support` voit tout, sans les boutons d'écriture.
- Charte : `docs/design-guidelines.md`. Textes par next-intl (fr, en ; `wo` = texte français tel quel, wolof en pause).

## Contraintes strictes (métier)

- Les codes d'erreur de l'API (`radar.targets.*`) ont chacun un libellé ; jamais de code brut à l'écran.
- `apiFetch` / `apiRequest` : le préfixe `/api` (piège du `CLAUDE.md` racine).
- Une cible `retired` n'est pas modifiable ; une cible `demand` modifiée devient épinglée (l'écran le dit avant).

## Critères d'acceptation

- [ ] AC1 — Créer une cible depuis la console l'ajoute à la liste avec son résumé ; une validation refusée affiche le
      libellé du code.
- [ ] AC2 — La page d'une cible liste ses annonces paginées et mène à la fiche annonce.
- [ ] AC3 — Le niveau `support` ne voit aucun bouton d'écriture.
- [ ] AC4 — Tests Vitest des trois points ci-dessus ; `npm run lint`, `npx tsc --noEmit`, `npm run check:*` verts.

## Hors périmètre

- Les révisions des cibles de la demande (TCK-2470).

## Notes d'implémentation

_(à remplir)_
