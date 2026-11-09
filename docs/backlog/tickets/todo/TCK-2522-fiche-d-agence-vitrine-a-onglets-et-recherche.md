---
id: TCK-2522
title: Fiche d'agence « La vitrine à onglets, couverture et recherche »
status: todo
phase: P1
family: front
estimate: L
wave: 85
created: 2026-11-09
updated: 2026-11-09
depends_on: [TCK-2517, TCK-2518]
blocks: [TCK-2523]
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [front, directory, agence, mobile, audit-ux]
---

## Objectif utilisateur

L'agence a une vitrine qui la vend ; le chercheur y trouve sa sélection dès le premier écran, puis fouille ses biens avec la même aisance que la recherche du site.

## Contrat de données

`GET /api/public/agencies/{slug}` (accroche, « Pourquoi nous », `cover`, `showcase`, délai, baux du mois — TCK-2518) ; biens : liste publique avec `filter[agency]` et `facets` (TCK-2517). Équipe, avis, infos : inchangés.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=agence&a=d` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans Biens, Filtres, Biens filtrés, Aucun bien ; Équipe, Avis et Infos sont ceux de l'approche A (`a=a`).
- Haut de page (de C) : couverture de trois biens, accroche, « Pourquoi nous » en trois lignes, la sélection, les avis avec leur contexte (« Locataire · bail »).
- Ensuite (de A) : onglets collants Biens · Équipe · Avis · Infos ; biens en lignes denses avec « Voir plus » ; barre WhatsApp · Appeler · Message ; colonne d'identité fixe en bureau.
- Recherche dans les biens : champ, Louer / Acheter, type, budget, chambres, quartier, tri ; feuille de filtres au téléphone, panneau par filtre en bureau avec le compte par option ; filtres actifs en pastilles retirables ; « 3 biens sur 67 » ; état « Aucun bien » : effacer, deux élargissements avec leur compte, lien vers les autres agences.
- **Les filtres sont ceux de la liste des biens, sur le même composant** — pas un second.
- ⚑ **Écart de charte, accepté (décision 2a du porteur, 2026-11-09)** : la couverture plein cadre s'étend à toutes les fiches d'agence. À écrire dans `docs/design-guidelines.md`.

## Contraintes strictes (métier)

- Rien de l'existant ne se perd : retour, logo (monogramme), badge vérifié, licence, description, chiffres, portefeuille Tous / À louer / À vendre avec les vrais totaux, avis avec note moyenne et auteur abrégé, données structurées, vrai 404, état « indisponible ».
- L'équipe ne montre que les agents (TCK-2506).
- Filtres dans l'URL : un lien partagé rouvre la même sélection ; rendu serveur de la première page.
- Sans accroche ni sélection, la fiche retombe sur la forme A sans trou.
- Sur la fiche, la barre d'actions remplace la barre d'onglets (ADR-0091 § 4).

## Delta à produire

- [ ] Haut de page vitrine (couverture, accroche, « Pourquoi nous », sélection).
- [ ] Onglets collants et lignes denses.
- [ ] Recherche et filtres branchés sur la liste publique, état vide.
- [ ] Barre d'actions.
- [ ] Règle de couverture dans `docs/design-guidelines.md`.
- [ ] Clés i18n `fr`/`en`/`wo`.
- [ ] Tests (filtres dans l'URL, compte « N sur M », état vide, retombée sans contenu de vitrine, équipe sans propriétaires).

## Critères d'acceptation

- [ ] AC1 — `/fr/agencies/<slug>?contract=rent&bedrooms=2&price_max=1000000` rend côté serveur les biens filtrés et « N biens sur M ».
- [ ] AC2 — La sélection est visible sans défilement à 390 × 844 quand l'agence en a une.
- [ ] AC3 — Une recherche sans résultat propose deux élargissements dont le compte est celui des facettes de l'API.
- [ ] AC4 — Une agence sans accroche, sans « Pourquoi nous » et sans sélection affiche couverture, identité et biens, sans bloc vide.
- [ ] AC5 — À 360 px, la page ne défile pas horizontalement.

## Hors périmètre

- La saisie de la vitrine dans la console (TCK-2524).

## Notes d'implémentation

_(à remplir par implementing-specs)_
