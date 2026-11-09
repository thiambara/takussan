---
id: TCK-2521
title: Annuaire « La liste dense, une vitrine en tête » : Professionnels, onglets Agences · Agents
status: todo
phase: P1
family: front
estimate: M
wave: 85
created: 2026-11-09
updated: 2026-11-09
depends_on: [TCK-2518, TCK-2520, TCK-2506]
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [front, directory, mobile, audit-ux]
---

## Objectif utilisateur

Choisir vite une agence ou un agent au téléphone — le premier résultat sous 300 px, la note et le délai de réponse visibles d'emblée — et voir, en tête, l'agence mise en avant dans sa ville.

## Contrat de données

`GET /api/public/agencies` et `/agents` (champs de TCK-2518, `spotlight` de TCK-2520, règle des propriétaires sur option de TCK-2506). Recherche par nom et filtre par ville dans l'URL, inchangés.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=annuaire&a=d` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans Agences et Agents, téléphone et bureau.
- Un annuaire « Professionnels », onglets Agences · Agents ; lignes d'environ 80 px : logo (monogramme en repli), nom et badge vérifié, biens en ligne, villes, note et avis, délai de réponse ; pour un agent, langues et quartiers.
- En tête, au plus une carte « Mise en avant » : couverture de trois biens de l'agence, signalée en clair ; absente, la liste commence directement.
- En bureau, chaque carte d'agence porte ses trois aperçus.
- Villes sur une rangée qui défile ; plus de sur-titre en capitales ; « Rejoindre Takussan » en pied.
- Tutoiement (découverte).

## Contraintes strictes (métier)

- Rien de l'existant ne se perd : recherche par nom et ville dans l'URL (rendu serveur, indexé), compte des résultats, pagination, état vide qui garde les filtres, panne distincte du vide, badge vérifié, portefeuille à louer / à vendre, note et nombre d'avis.
- Aucun numéro sur une ligne d'annuaire.
- L'agence mise en avant apparaît aussi à son rang (décision 1a).
- Un champ absent (délai, langues) ne laisse pas de trou ni de « — ».

## Delta à produire

- [ ] Page « Professionnels » à deux onglets (les deux URL `/agencies` et `/agents` restent et sélectionnent l'onglet).
- [ ] Ligne dense agence et agent ; monogramme ; rangée de villes.
- [ ] Carte « Mise en avant ».
- [ ] Aperçus en bureau.
- [ ] Clés i18n `fr`/`en`/`wo`.
- [ ] Tests (onglet par URL, vitrine absente sans `spotlight`, champs facultatifs absents, état vide et panne distincts).

## Critères d'acceptation

- [ ] AC1 — À 390 × 844, le premier résultat commence à moins de 300 px du haut (sans vitrine).
- [ ] AC2 — Avec `spotlight`, une seule carte « Mise en avant » en tête, et l'agence aussi à son rang.
- [ ] AC3 — `/fr/agents?city=dakar` ouvre l'onglet Agents filtré, rendu serveur (le HTML contient les résultats).
- [ ] AC4 — Aucune ligne ne contient de numéro de téléphone (balayage du HTML rendu).

## Hors périmètre

- Les fiches (TCK-2522, TCK-2523).

## Notes d'implémentation

_(à remplir par implementing-specs)_
