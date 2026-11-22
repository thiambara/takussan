---
id: TCK-2995
title: Feuilles du bas et panneaux plein écran au-dessus du clavier
status: doing
phase: P2
family: front
estimate: M
wave: null
created: 2026-11-22
updated: 2026-11-22
depends_on: [TCK-2988]
blocks: []
spec_refs:
  features: []
  models: []
tags: [front, mobile, clavier, adr-0133]
---

## Objectif utilisateur

Au téléphone, quand on tape dans une feuille du bas (« Demander au fil », un motif d'annulation, une révision de
loyer…) ou dans un formulaire plein écran (« Nouveau client »), le champ ET le bouton qui envoie restent au-dessus du
clavier.

## Contrat de données

Aucun.

## Direction UX / Artistique

ADR-0133, amendement du 2026-11-22, § 6, 7 et 10.

## Delta

- `SuiviDeLaFenetre` (`src/lib/fenetre.ts`, à côté de `useFenetre`) : l'abonnement à la mesure pendant l'ouverture, et
  le champ focalisé ramené en vue.
- `FeuilleDuBas` : sous `md`, en saisie, `bottom: --clavier` et `max-height: min(90dvh, --vue-h − 8 px)`, zone sûre
  du pied retirée.
- `PanneauDroit` : sous `xl`, en saisie, calé sur `--vue-top` et `--vue-h` ; en-tête du formulaire en 44 px, sans la
  ligne d'étape.

## Critères d'acceptation

- [x] AC1 — En émulation 390 × 844 (clavier simulé de 336 px) : « Demander au fil » passe de 101-844 à 8-508, pied
      à 439-508 ; « Nouveau client » de 0-844 à 0-508, pied (« Continuer ») à 408-508, en-tête 44 px. Avec un
      décalage de 150 px, chacun reste dans la fenêtre visible. Clavier fermé, tout revient.
- [x] AC2 — Focus sans clavier (saisie optimiste) : la feuille garde sa hauteur, rien ne se retire.
- [x] AC3 — Tests de classes et d'abonnement (`saisie-des-surfaces.tck-2995.test.tsx`), vérifiés par ablation.
- [ ] AC4 — Sur l'iPhone du porteur : dans « Demander au fil » et « Nouveau client », le bouton reste au-dessus du
      clavier pendant la frappe.

## Reste sur dev

- **AC4** : la vérification sur l'iPhone du porteur (ADR-0133 : le téléphone juge la géométrie du clavier). Le
  code est fusionné ; le ticket passe `done` une fois le constat écrit ici.
