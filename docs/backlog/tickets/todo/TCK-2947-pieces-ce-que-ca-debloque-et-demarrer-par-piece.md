---
id: TCK-2947
title: "Vos pièces : « Ce que ça débloque » au bureau, le délai de vérification, et « Démarrer » pièce par pièce"
status: todo
phase: P2
family: front
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2944]
blocks: []
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
  models:
    - "docs/models-spec.md#42-kycdossier-"
tags: [front, entree, pieces, demarrer, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

Le nouvel entrant sait ce que chaque pièce lui ouvre, quand elle sera vérifiée, et voit dans « Démarrer » chaque pièce qui lui manque.

## Contrat de données

- Étapes par pièce de « Démarrer » (TCK-2944).
- Ce que débloque une pièce : à établir dans le code (RIB → reversement, pièce d'identité → signature), voir contraintes.

## Direction UX / Artistique

- **Référence de fidélité** : `app-entree-assistants`, **approche A**, `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-entree-assistants-a.tsx`, visionneuse `?p=app-entree-assistants&a=a`, **e3 « Pièces (/app/pieces) »** :
  - **bureau** : aside « Ce que ça débloque » (RIB → « le reversement de tes loyers, le 10 de chaque mois » ; pièce d'identité → « la signature de tes mandats et de tes baux », `:850-866`) au-dessus de la légende des trois états ;
  - **téléphone et bureau** : « {agence} les vérifie sous 48 h. Tu peux utiliser ton espace en attendant. » (`:746`, `:841`) ;
  - **bureau, coque** : le groupe « Démarrer » liste les pièces une à une.
- Audit : `audit-f6-agence-entree.md`, « Famille entrée », § app-entree-assistants e3, « écarts couverts » 9, 12 ; fiche TCK-2614 (`[1]`, `[2]`, `[4]`).

## Contraintes strictes (métier)

- **Promesses vérifiées** (motif de l'écart TCK-2614 `[2]`) : une ligne de « Ce que ça débloque » n'est écrite que si le code la tient (le reversement exige-t-il le RIB vérifié ? la signature exige-t-elle la pièce d'identité ?). L'implémenteur vérifie chaque règle dans l'API et ne rend que les lignes vraies ; « le 10 de chaque mois » seulement si c'est la date réelle des reversements de l'agence.
- « sous 48 h » seulement si un délai de vérification est un engagement (règle ou réglage) ; sinon « {agence} les vérifie. Tu peux utiliser ton espace en attendant. » et la fiche garde l'écart avec ce motif.
- « Démarrer » lit les étapes `piece:*` de l'API (TCK-2944) pour le bailleur, l'agent et le prestataire ; l'étape `kyc` de l'agence (vérification) garde son libellé et son lien.
- Libellés `fr`/`en`/`wo` (`wo` = français).

## Delta à produire

- [ ] Aside « Ce que ça débloque » (lignes vraies seulement).
- [ ] Phrase du délai de vérification.
- [ ] Groupe « Démarrer » pièce par pièce (colonne, tiroir, page « Démarrer » si elle existe).
- [ ] Tests.

## Critères d'acceptation

- [ ] AC1 — À 1440, `/app/pieces` d'un bailleur rend l'aside « Ce que ça débloque » ; ses lignes sont exactement celles d'une liste déclarée où chaque ligne cite la règle de l'API qui la tient (fichier:ligne, relevé dans la PR) ; un test compare les lignes rendues à cette liste. La légende des trois états reste.
- [ ] AC2 — La phrase du délai porte « sous 48 h » si et seulement si la règle existe ; sinon la variante sans délai.
- [ ] AC3 — Pour un bailleur à qui manquent RIB et pièce d'identité, « Démarrer » liste « RIB » et « Pièce d'identité » comme deux étapes ; après envoi du RIB, son étape change d'état ; l'étape unique « Vos pièces » n'apparaît plus.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche TCK-2614 mise à jour (entrées couvertes retirées, motifs réécrits pour les promesses non tenues).
- [ ] AC-F2 — À 390 × 844 et 1440 × 900, `fidelite compare` sur e3 ne rend aucun écart non expliqué.

## Hors périmètre

- La liste des étapes côté API (TCK-2944).

## Notes d'implémentation

_(à remplir par implementing-specs)_
