---
id: TCK-2503
title: Demande de visite en deux temps : quand, puis qui, et un écran de suite
status: todo
phase: P1
family: front
estimate: M
wave: 84
created: 2026-11-08
updated: 2026-11-08
depends_on: [TCK-2501, TCK-2502]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models: []
tags: [front, visits, mobile, audit-ux]
---

## Objectif utilisateur

Le chercheur demande une visite sans compte en deux écrans qui tiennent chacun sans défiler, et sait ce qui va se passer ensuite.

## Contrat de données

`POST /api/public/properties/{slug}/visit-request` avec `date` + `preferred_window` (TCK-2502) ; `scheduled_at` reste possible.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=visite&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « Quand ? », « Qui ? », « Envoyée », téléphone et bureau.
- Quand : quatre jours proposés et une tranche de la journée ; Qui : nom et téléphone (+221 déjà posé), e-mail facultatif ; Envoyée : ce qui va se passer, et la prochaine action (dossier, alerte).
- Sous `md`, une feuille plein écran avec bouton collant ; en bureau, un dialogue de 520 px au plus, ou la carte de réservation.
- Récapitulatif du bien en tête de chaque écran.

## Contraintes strictes (métier)

- Aucun compte demandé ; connecté, nom et téléphone sont préremplis.
- Le type de visite se replie (sur place par défaut) ; les quatre types restent choisissables.
- Les textes légaux d'information sur les données (TCK-590) restent.

## Delta à produire

- [ ] Parcours en deux écrans puis écran de suite, lancé depuis la barre de la fiche (TCK-2501).
- [ ] Tests : envoi par tranche ; préremplissage connecté ; bouton toujours visible ; erreurs 422 rendues sur le bon champ.

## Critères d'acceptation

- [ ] AC1 — À 360 px, chaque écran tient sans défilement et son bouton est visible.
- [ ] AC2 — Une demande « jeudi, après-midi » envoie `date` + `preferred_window=afternoon` (vérifié au réseau) et affiche l'écran de suite.
- [ ] AC3 — Le parcours complet se fait au clavier seul en bureau.

## Hors périmètre

- Le choix d'une heure parmi les disponibilités de l'agent.
- Le dépôt de dossier (« Postuler »).

## Notes d'implémentation

_(à remplir par implementing-specs)_
