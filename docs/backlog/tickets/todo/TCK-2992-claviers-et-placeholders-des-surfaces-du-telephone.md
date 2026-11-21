---
id: TCK-2992
title: Profils de clavier et placeholders sur les surfaces du téléphone
status: todo
phase: P2
family: front
estimate: L
wave: null
created: 2026-11-21
updated: 2026-11-21
depends_on: [TCK-2991]
blocks: [TCK-2994]
spec_refs:
  features: []
  models: []
tags: [front, mobile, formulaires, clavier, adr-0135]
---

## Objectif utilisateur

Au téléphone, là où l'on tape le plus — chercher, se connecter, publier, écrire, contacter, réserver — chaque
champ ouvre le bon clavier et montre un exemple de ce qu'on attend.

## Contrat de données

Aucun.

## Direction UX / Artistique

ADR-0135 § 1 à § 3. Placeholder : un exemple de valeur ou sa forme, jamais le libellé répété ; fr, en, wo (= fr).

## Delta

Les champs de : la recherche et l'accueil (`search`, `home`, `layout`, `public/*`, pages publiques, favoris), l'entrée
(`auth`, `invitations`, `onboarding*`, `kyc`, `profile*`), la publication (`property-form*`, `publication`), la
messagerie (`messages*`), le contact, la réservation (`bookings*`), et les pages de lien (`share`,
`lien-d-action`, `radar-claim`). La base de `check:champs` descend d'autant.

## Critères d'acceptation

- [ ] AC1 — Plus aucun défaut `check:champs` dans les dossiers ci-dessus.
- [ ] AC2 — Chaque champ quitté `type="number"` est vérifié dans son formulaire : valeur vide, bornes, envoi
      (tests du formulaire verts, ou ajoutés quand il n'y en a pas).
- [ ] AC3 — Sur l'iPhone du porteur : la recherche ne corrige plus « Almadies » ; un montant ouvre le pavé
      numérique ; le code SMS est proposé au-dessus du clavier.
