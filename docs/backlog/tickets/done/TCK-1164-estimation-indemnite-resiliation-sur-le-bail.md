---
id: TCK-1164
title: "L'estimation de l'indemnité de résiliation anticipée lit le nombre de mois du bail"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-98--écrans-décriture-de-la-console-super-admin--ce-quils-changent-hors-de-la-console"
tags: [back, front, leases, early-termination, pistes]
---

## Contexte

Réf : **P98.05** du fichier de pistes, `validé` (V1 accordé : montant affiché au locataire avant
sa demande).

Décision du porteur : « validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket »

Le dialogue de demande de résiliation anticipée estimait l'indemnité avec `DEFAULT_PENALTY_MONTHS = 2`
en dur, alors que le serveur exécute `EarlyTerminationService::penaltyMonthsFor()` : la valeur figée
sur le bail, sinon le réglage de l'agence, sinon le global. `LeaseResource` n'exposait pas ce nombre.

## Objectif utilisateur

Celui qui demande la résiliation voit une estimation calculée sur le nombre de mois que la
résiliation exécutera pour ce bail.

## Delta à produire

- [x] `LeaseResource` rend `early_termination_penalty_months` = `penaltyMonthsFor()`, sur le détail
      seul (`forViewer`).
- [x] `EarlyTerminationDialog` estime sur ce nombre ; repli à 2 s'il manque.
- [x] Tests API (`LeaseContractTermsTest`) et front (`EarlyTerminationDialog.test.tsx`).

## Critères d'acceptation

- [x] AC1 — `GET /api/leases/{id}` d'un bail figé à 3 mois rend 3, avec un réglage à 4 ; un bail
      sans valeur figée rend le réglage (4).
- [x] AC2 — le dialogue d'un bail à 3 mois et 400 000 de loyer affiche « 3 mois » et 1 200 000.

## Hors périmètre

- Le calcul serveur de l'indemnité, inchangé.
- Les listes de baux : le champ n'y est pas rendu (une requête de réglage par bail).

## Notes d'implémentation

- Choix : la voie unique de la piste (exposer `penaltyMonthsFor()` et le faire lire au dialogue).
- Le champ est rendu sous `when($this->viewer !== null)`, comme `can_sign_as` : à défaut de valeur
  figée, `penaltyMonthsFor()` lit la ligne de réglage de l'agence, une requête par bail.
- Ablation : `LeaseResource.php` et `EarlyTerminationDialog.tsx` rendus à `pre-dev` → 1 rouge API
  (clé absente), 1 rouge front (« 2 mois ») ; correctif remis → `LeaseContractTermsTest` 36/36,
  `EarlyTerminationDialog.test.tsx` 5/5.
