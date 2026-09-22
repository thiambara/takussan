---
id: TCK-554
title: "Carte de bien : favori et comparateur sont des <button> DANS le lien — HTML invalide, nom accessible illisible, cibles de 32 px à 6 px d'écart"
status: todo
phase: P1
family: bug
estimate: S
wave: 68
created: 2026-09-22
updated: 2026-09-22
depends_on: []
blocks: [TCK-555]
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models: []
tags: [front, a11y, mobile, carte-de-bien, favoris, comparateur]
---

## Objectif utilisateur

Un visiteur, au doigt ou au lecteur d'écran, ouvre un bien, l'ajoute aux favoris ou au
comparateur, sans jamais déclencher l'un à la place de l'autre.

## Contexte

Audit UI/UX mobile du 2026-09-22 (constat C2), sur `PropertyCard`, qui sert la liste, l'accueil et
les autres surfaces de découverte.

- La carte entière est un `<a>` (`LienLocalise`) qui **contient** deux `<button>` (favori,
  comparateur) : 2 boutons imbriqués par lien, mesuré. Un contenu interactif dans un `<a>` est
  invalide en HTML.
- Conséquence mesurée dans l'arbre d'accessibilité : le nom du lien est toute la carte, boutons
  compris — « Villa luxueuse à Dieuppeul En location **Ajouter aux favoris Ajouter au comparateur**
  il y a 3 mois 950 000 F CFA … ».
- Les deux boutons font 32 × 32 px, empilés à 6 px d'écart (y = 364 et 402 à 390 px) : un tap
  imprécis déclenche le voisin, ou le lien.

## Contrat de données

Aucun.

## Direction UX / Artistique

- Visuellement, rien ne change pour qui voit : la carte reste cliquable sur toute sa surface.
- Le lien est nommé par le titre du bien ; favori et comparateur sont des contrôles **frères** du
  lien, pas ses enfants.
- Zones tactiles de 44 px au moins, sans agrandir le dessin des boutons.

## Contraintes strictes (métier)

- Toute la surface de la carte reste une cible d'ouverture du bien.
- Un tap sur favori ou comparateur ne navigue jamais.
- Comportement identique sur toutes les surfaces qui utilisent la carte (liste, accueil, biens
  similaires, récemment consultés).

## Delta à produire

- [ ] Structure de la carte : lien sans contenu interactif, favori et comparateur hors du lien, la
      surface entière restant cliquable.
- [ ] Nom accessible du lien = titre du bien.
- [ ] Zones tactiles de 44 px pour favori et comparateur, sans recouvrement entre elles.
- [ ] Tests : aucun `button` descendant d'un `a` dans la carte ; nom accessible du lien ; un clic
      sur favori ne navigue pas.

## Critères d'acceptation

- [ ] AC1 — sur `/fr/properties`, `document.querySelectorAll('a button, a [role=button]').length`
      vaut 0 dans la grille de résultats.
- [ ] AC2 — le nom accessible de chaque lien de carte est le titre du bien, sans « Ajouter aux
      favoris » ni « Ajouter au comparateur ».
- [ ] AC3 — à 390 px, les zones tactiles de favori et de comparateur mesurent au moins 44 × 44 px
      et ne se chevauchent pas.
- [ ] AC4 — un tap sur une zone de la carte hors des deux contrôles ouvre la fiche du bien.
- [ ] AC5 — un tap sur favori laisse l'URL inchangée.

## Hors périmètre

- La disposition de la carte sur mobile (colonnes, superpositions sur la photo) → TCK-555.

## Notes d'implémentation

_(à remplir par implementing-specs)_
