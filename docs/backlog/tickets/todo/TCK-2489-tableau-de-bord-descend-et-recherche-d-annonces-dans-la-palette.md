---
id: TCK-2489
title: Le tableau de bord n'ouvre le menu que pour l'admin d'agence ; la recherche d'annonces entre dans la palette ; le modèle « Aujourd'hui »
status: todo
phase: P2
family: front
estimate: S
wave: 83
created: 2026-11-06
updated: 2026-11-06
depends_on: []
blocks: [TCK-2490, TCK-2491]
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, navigation, coque, adr-0090]
---

## Objectif utilisateur

Un hôte, un bailleur, un agent, un client trouvent d'abord ce qui fait leur métier, pas un tableau de
bord ; tout le monde cherche une annonce depuis « Aller à » sans barre du haut.

## Contrat de données

Aucun endpoint neuf. Données du front : `src/lib/navigation/dispositions.ts` (groupes par persona),
`a-traiter.ts` (`pastillesATraiter`, `priorites`), la palette (`PaletteDeCommandes.tsx`, `palette.ts`).

## Direction UX / Artistique

Décisions d'[ADR-0090](../../../adr/0090-la-coque-de-app-sans-barre-du-haut.md) §3 et §4.

## Contraintes strictes (métier)

- `admin-agence` : « Tableau de bord » reste la première entrée.
- Toute autre persona : l'entrée descend **après le deuxième groupe titré** (dans un groupe sans titre
  à elle) ; s'il y a moins de deux groupes titrés, après le dernier ; une persona sans groupe titré
  (prestataire) la place en quatrième ligne de sa tête. Aucune destination ne se perd (gardes
  d'ADR-0089), `/app` reste la page d'arrivée, la barre d'onglets ne change pas.
- « Aujourd'hui » : un modèle pur, dérivé des `priorites` et des comptes, qui rend pour chaque
  compte non nul une ligne (clé, nombre, href, **libellé d'action** i18n : « Messages non lus »,
  « Visites à confirmer », « Demandes de contact »…, une clé par `NavCounterKey` priorisé par une
  persona) ; liste vide quand tout est à zéro. Il remplace `pastillesATraiter` (plus de coupe à 4 +
  « autres » si le rendu n'en a plus besoin — à décider sur le rendu de TCK-2490).
- Palette : une action « Chercher un bien sur Takussan » ; avec du texte tapé, « Chercher « … »
  parmi les annonces », qui mène à `/properties?q=…` (relire le paramètre réel de la recherche
  publique). Hors `/app` rien ne change.
- i18n : fr/en/wo (wo = texte français tel quel).

## Delta à produire

- [ ] Dispositions : position du tableau de bord par persona, comme une donnée ; tests par persona.
- [ ] Modèle « Aujourd'hui » + libellés ; tests (zéros, ordre des priorités, entrée verrouillée).
- [ ] Palette : action de recherche d'annonces ; tests.

## Critères d'acceptation

- [ ] AC1 — Pour chaque persona, un test fige la place de « Tableau de bord » (premier pour
  `admin-agence`, la règle ci-dessus pour les autres) et rougit si on la remet en tête.
- [ ] AC2 — Le modèle « Aujourd'hui » rend les lignes non nulles dans l'ordre des `priorites`, avec un
  libellé d'action par clé ; vide si tout est à zéro ; une entrée verrouillée n'y paraît pas.
- [ ] AC3 — La palette propose « Chercher un bien » et transmet le texte tapé ; test.
- [ ] AC4 — Gardes d'ADR-0089 vertes (aucune destination perdue, recensements), `check:*`, tsc, lint.
- [ ] AC5 — Suites par la CI.

## Hors périmètre

Le rendu de la barre (TCK-2490), la suppression de la barre du haut (TCK-2491).

## Notes d'implémentation
