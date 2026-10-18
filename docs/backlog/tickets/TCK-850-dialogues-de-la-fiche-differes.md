---
id: TCK-850
title: "Fiche bien : les quatre dialogues se chargent à l'ouverture"
status: done
phase: P2
family: technique
estimate: M
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#la-fiche-bien-est-un-seul-composant-client-qui-charge-ses-quatre-dialogues-et-un-calendrier-avant-le-premier-clic"
tags: [front, performance, fiche, pistes]
---

## Contexte

Réf : **P33.04** du fichier de pistes, `validé` par le porteur (critère accordé : V8, la piste
entière tenant sur plus d'un ticket ; la précision n'en confie que la première moitié).

`PropertyDetailContent` importe statiquement ses quatre dialogues (visite, réservation, partage,
message) : leur code et react-day-picker (`Calendar`, `DatePicker`) entrent dans le JS initial de
la fiche avant tout clic. Le crochet `useIntentionDeReservation`, appelé au montage, est exporté du
module du dialogue de réservation : l'importer suffit à tirer tout le dialogue.

## Décision du porteur

dialogues de la fiche chargés à l'ouverture par `next/dynamic` (`useIntentionDeReservation` sort de leur module), mesurés avant et après

## Reste à faire

le rendu serveur des blocs sans interaction, en tickets, plus tard

## Objectif utilisateur

La fiche d'un bien s'affiche et devient interactive plus vite, surtout sur un réseau mobile lent.

## Delta à produire

- [x] `components/useIntentionDeReservation.ts` : le crochet, sorti de `PropertyReservationDialog.tsx`.
- [x] `PropertyDetailContent` : les quatre dialogues par `next/dynamic`, montés seulement une fois
      ouverts (puis gardés montés, pour l'animation de fermeture).
- [x] Test de garde sur le graphe d'imports, et mesure du JS initial avant et après au build.

## Critères d'acceptation

- [x] AC1 — `PropertyDetailContent` n'importe statiquement aucun des quatre dialogues.
- [x] AC2 — Le JS initial de la fiche ne contient plus react-day-picker, mesuré au build.
- [x] AC3 — Le retour de connexion par `?action=reserver` rouvre toujours la boîte de réservation
      (tests `PropertyReservationDialog.intention` verts).

## Hors périmètre

- Le rendu serveur des blocs sans interaction (reste du porteur, ci-dessus).
- La garde du poids des routes en CI (P33.05).

## Notes d'implémentation

- **Mesure au build** (`npm run build`, script temporaire hors dépôt qui somme en gzip les
  `rootMainFiles` et les `entryJSFiles` du `page_client-reference-manifest.js` de la route) :
  fiche **480,1 → 441,2 Kio gzip** (38 → 36 fichiers), react-day-picker (classes `rdp-`) présent
  avant, absent après ; page légale témoin inchangée à 322,7 Kio. Le chiffre de l'explorateur (538)
  venait d'un build plus ancien et d'une autre méthode : seul l'écart avant/après est comparable.
- **Ablation** : correctif retiré → les 9 tests de `__tests__/dialogues-differes.test.ts` rouges ;
  remis → verts, et les 124 tests du dossier de la fiche verts.
- Le test lit la source : jsdom ne mesure aucun chunk, il garde la cause, le build mesure l'effet.
