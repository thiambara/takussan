---
id: TCK-2481
title: Barre d'onglets mobile par persona — quatre destinations et « Menu », qui remplace le burger sous md
status: todo
phase: P2
family: front
estimate: M
wave: 82
created: 2026-11-05
updated: 2026-11-05
depends_on: [TCK-2478]
blocks: []
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, navigation, coque, adr-0089, mobile]
---

## Objectif utilisateur

Au téléphone, les quatre destinations du quotidien de chaque profil sont sous le pouce, avec leurs
compteurs, et le reste du menu est à un geste.

## Contrat de données

Aucun endpoint neuf : la disposition de chaque persona porte ses quatre `onglets` (ADR-0089 §3),
et les compteurs sont ceux de la barre.

## Direction UX / Artistique

- Barre fixe en bas, sous `md` uniquement : quatre onglets choisis par persona, puis « Menu », qui
  ouvre le tiroir existant.
- Onglets proposés (à ajuster dans les notes si une destination n'est pas accessible au persona) :
  client : Accueil · Favoris · Visites · Messagerie ; locataire : Accueil · Paiements ·
  Interventions · Messagerie ; bailleur : Accueil · Mes biens · Demandes · Messagerie ; agent :
  Accueil · Demandes · Visites · Messagerie ; admin-agence et plateforme : Accueil · Demandes · Biens ·
  Messagerie ; hôte : Accueil · Mes biens · Réservations · Messagerie ; prestataire : Accueil ·
  Interventions · Messagerie · Documents.
- Les compteurs en pastille sur l'onglet ; l'onglet actif lisible sans la couleur seule.
- **Sous `md`, le burger de la barre haute disparaît** : « Menu » est la seule porte du tiroir.
  C'est le changement de chrome le plus visible du projet, validé par le porteur le 2026-11-05.

## Contraintes strictes (métier)

- Respecte `env(safe-area-inset-bottom)` ; le `<main>` réserve la hauteur de la barre (rien de la
  page n'est caché dessous, dernier bouton compris — cf. TCK-503).
- Absente en plein écran (`estPleinEcran`, TCK-631).
- Un onglet inaccessible au persona est remplacé par la destination suivante de sa disposition,
  jamais rendu cadenassé.
- Le lien d'évitement (TCK-905) et l'ordre de tabulation restent justes.

## Delta à produire

- [ ] Champ `onglets` des dispositions, et sa garde (identifiants existants, au plus quatre).
- [ ] Barre d'onglets ; « Menu » ouvre le tiroir ; retrait du burger sous `md`.
- [ ] Réserve de hauteur du `<main>` et zone sûre.
- [ ] Tests : onglets par persona ; remplacement d'un onglet inaccessible ; plein écran ; a11y
      (`nav` nommée, `aria-current`).

## Critères d'acceptation

- [ ] AC1 — À 390 px, chaque persona voit ses quatre onglets et « Menu » ; à 768 px, ni barre ni
      réserve de hauteur.
- [ ] AC2 — Mesure au navigateur à 360 et 390 px : le dernier élément focalisable de `/app/profile`
      et la pagination de `/app/properties` sont atteignables au-dessus de la barre.
- [ ] AC3 — Sous `md`, aucun burger ; « Menu » ouvre le tiroir et rend le focus à l'onglet à la
      fermeture.
- [ ] AC4 — Sur `/publish` (plein écran), pas de barre.

## Hors périmètre

- Choix des onglets par l'utilisateur.
- Toute modification du tiroir lui-même (il rend la barre latérale de TCK-2478).

## Notes d'implémentation

_(à remplir par implementing-specs)_
