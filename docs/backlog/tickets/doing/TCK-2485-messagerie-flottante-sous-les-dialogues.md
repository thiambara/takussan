---
id: TCK-2485
title: Messagerie flottante — son panneau ne passe plus au-dessus d'un dialogue modal
status: doing
phase: P3
family: bug
estimate: S
wave: 82
created: 2026-11-06
updated: 2026-11-06
depends_on: [TCK-2482]
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, messagerie, empilement, z-index, dialogue]
---

## Objectif utilisateur

Quand un dialogue s'ouvre (palette ⌘K, confirmation, galerie…) alors que la messagerie flottante
est ouverte, l'utilisateur voit le dialogue en entier : rien ne se pose dessus.

## Contrat de données

Aucun.

## Direction UX / Artistique

Un dialogue modal est la couche du dessus de la page, sous les seuls menus, infobulles et avis
(`z-[1100]`, `z-[1200]`). Le panneau de la messagerie reste au-dessus de ce qui flotte sur la page
(pastille du comparateur, barres flottantes, cartes Leaflet), comme aujourd'hui.

## Contraintes strictes (métier)

- Relevé de départ (TCK-2482, constat M4, `rapport-2482-mesure.md`) : panneau ouvert, `z-[1000]` ;
  à 1024 px il recouvre **121,6 × 274 px** de la palette (z-50), `elementFromPoint` au centre du
  recouvrement = le panneau. Défaut ancien de tout `Dialog`, rendu atteignable par ⌘K.
- **Décision de la session** : relever d'abord POURQUOI `z-[1000]` (le commentaire cite Leaflet) et
  quelles cartes l'exigent. Préférence : le panneau passe SOUS les dialogues (z inférieur à 50) et
  reste au-dessus des cartes en isolant leurs conteneurs (`isolate`), si la mesure le permet sans
  régression ; à défaut, le panneau se ferme à l'ouverture d'un dialogue modal. Le choix et sa
  preuve s'écrivent dans les notes.
- Un brouillon de message non envoyé ne doit pas se perdre du seul fait qu'un dialogue s'ouvre
  (TCK-500 ne le perd qu'à la fermeture volontaire du panneau).

## Delta à produire

- [ ] Relevé : l'origine de `z-[1000]`, les calques de la page qui dépassent `z-40` et leur contexte
      d'empilement (cartes Leaflet comprises), écrit dans les notes.
- [ ] Le panneau ouvert se range sous les dialogues modaux (ou, à défaut mesuré, se ferme à leur
      ouverture), et reste au-dessus de ce qu'il couvrait sur la page.
- [ ] Test qui rougit sur l'ancien ordre (`z-[1000]`).
- [ ] Mesure au navigateur (CDP direct) : panneau ouvert puis ⌘K à 1024 ; une page à carte ; la
      barre publique fixe à hauteur de portable.

## Critères d'acceptation

- [ ] AC1 — Panneau ouvert, ⌘K à 1024 px : `elementFromPoint` sur l'ancienne zone de recouvrement
      rend la palette, plus le panneau (mesuré au navigateur).
- [ ] AC2 — Le panneau ouvert reste au-dessus de ce qu'il couvrait sur la page : pastille du
      comparateur, barres flottantes, carte Leaflet (relevé + test).
- [ ] AC3 — Un test rougit sur l'ancien ordre (ablation écrite dans les notes).
- [ ] AC4 — Gardes du dépôt et du front vertes.
- [ ] AC5 — Suites entières vertes (par la CI).

## Hors périmètre

- Le lanceur fermé (`z-40`) : inchangé.
- Le bouton flottant mobile (lien vers `/app/messages`, pas de panneau).
- La garde « autre dialogue » de la palette (ne pas s'ouvrir panneau ouvert) : le panneau n'est
  pas modal, la palette peut s'ouvrir par-dessus.

## Notes d'implémentation

_(à remplir par implementing-specs)_
