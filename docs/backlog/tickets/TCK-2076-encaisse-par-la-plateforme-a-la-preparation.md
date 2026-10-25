---
id: TCK-2076
title: "La préparation du reversement au bailleur marque « encaissé par la plateforme » la pièce que la plateforme a encaissée"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: [TCK-2064, TCK-2074]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models: []
  adr:
    - "docs/adr/0039-les-sorties-d-argent.md#3-le-brut-nest-jamais-une-saisie"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-178--argent-encaissé-par-la-plateforme-et-reversé-au-bailleur-avant-que-lagence-lait-reçu"
tags: [web, reversements, argent, pistes]
---

## Contexte

Réf : **P178.04** du fichier de pistes (🟢, `validé`). Les lignes de la préparation ne disaient pas
qui avait encaissé l'argent : l'agence choisissait ses lignes sans distinguer le loyer reçu en espèces
de celui que la plateforme avait encaissé puis reversé.

**Décision du porteur** : validé — validation du porteur (2026-10-23) : la recommandation du délégué ; un seul libellé « encaissé par la plateforme » pour la préparation et le rapprochement ; après P178.01 et P178.03

La recommandation du délégué, dans la branche que P178.01 a prise (option stricte, TCK-2064) : la pièce
que la plateforme détient encore quitte la préparation ; l'« Encaissé » de l'agence reste tel quel.
P178.03 (TCK-2074) émet déjà `settled_by_platform` sur chaque ligne de loyer et de séjour.

## Objectif utilisateur

L'agence voit, sur la préparation, quelles pièces la plateforme a encaissées.

## Contraintes strictes (métier)

- Le libellé est « Encaissé par la plateforme », le même pour le rapprochement quand il y sera posé.
- Aucun calcul, aucun champ d'API neuf : la lecture de `settled_by_platform` (TCK-2074).
- L'« Encaissé » des tableaux de bord ne change pas.

## Hypothèses (mode sans humain)

- Sur le rapprochement, une pièce soldée par la plateforme n'est plus ni proposée (scope
  `awaitingBankCredit`, TCK-1417) ni acceptée (`ReconciliationManager`, TCK-1415) : aucun objet de
  l'écran ne porte aujourd'hui une telle pièce. Où y poser le libellé n'est écrit nulle part ; c'est
  laissé en reste, avec le texte déjà fixé.
- La mention « N encaissements attendus de la plateforme », que la recommandation donne « au mieux »,
  n'est pas faite : elle demande une lecture et un texte de plus, laissés en reste.

## Delta à produire

- [x] `CreatePayoutDialog` : le libellé sur la ligne de loyer ou de séjour dont `settled_by_platform`
  est vrai ; textes `fr`/`en` (`wo` reprend le français, wolof en pause).
- [x] Test : `src/components/payments/__tests__/CreatePayoutDialog.test.tsx`.

## Critères d'acceptation

- [x] AC1 — une pièce encaissée par la plateforme porte « Encaissé par la plateforme » ; la pièce en
  espèces du même calcul ne le porte pas.

## Hors périmètre

- Le libellé sur le rapprochement (reste de P141.03), et la mention des encaissements attendus.

## Notes d'implémentation

- Le libellé de la ligne est passé dans son propre `<span>` : sans lui, `getByText` ne trouve plus la
  cellule dont le texte est coupé en deux nœuds.
- Ablation : libellé retiré des deux lignes → 1 rouge ; remis → 11 verts.
