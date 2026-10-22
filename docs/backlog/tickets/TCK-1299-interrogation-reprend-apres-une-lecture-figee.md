---
id: TCK-1299
title: "Une lecture figée ne suspend plus l'interrogation périodique : garde sur la vérification de paiement"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1297]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-113--appels-du-navigateur-vers-lapi-sans-délai"
tags: [front, network, payments, pistes]
---

## Contexte

Réf : **P113.02** du fichier de pistes, `validé (délégué)` (V7 accordé).

Décision du porteur (déléguée) : réglé par la borne de 30 s des lectures de P113.01 (la requête figée passe en erreur et l'interrogation reprend au tic suivant), sans borne propre par requête ; garde : un test de `useNewMessagesPolling` ou de `useVerifyPayment` dont le premier appel ne répond jamais, qui exige un second appel après la borne

À chaque tic de `refetchInterval`, TanStack rend la promesse en vol au lieu d'en lancer une neuve :
sans borne, une requête figée suspendait l'interrogation (fil de messages, vérification de
paiement) jusqu'au démontage. La borne de 30 s des lectures du navigateur (TCK-1297) la fait passer
en erreur ; ce ticket n'ajoute que la garde.

## Objectif utilisateur

La vérification d'un paiement reprend d'elle-même après une requête restée sans réponse.

## Contrat de données

Aucun changement d'API ni de code applicatif.

## Delta à produire

- [x] Test de `useVerifyPayment` sous le vrai `createQueryClient()`, premier appel figé, qui exige
  un second appel à `/verify` après la borne.

## Critères d'acceptation

- [x] AC1 — Premier appel figé : un second appel part (borne ramenée à 20 ms dans le test).

## Hors périmètre

- Une borne propre par requête interrogée (écartée par la décision).
- La cloche : elle passe par une action serveur, déjà bornée côté serveur (TCK-1215).

## Notes d'implémentation

- Le second appel peut venir du réessai par défaut (une fois, après 1 s) ou du tic suivant : la
  garde exige le second appel, pas sa cause.
- Ablation : `api.ts` rendu à `origin/pre-dev` (sans la borne de TCK-1297) → rouge, « expected 1
  to be greater than or equal to 2 » ; borne remise → vert.
