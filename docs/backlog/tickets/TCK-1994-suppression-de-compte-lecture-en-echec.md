---
id: TCK-1994
title: "« Supprimer mon compte » : une lecture de la demande en échec affiche son message, sans bouton"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-172--lectures-du-navigateur-faites-par-fetch-dans-un-useeffect-hors-de-tanstack-query"
tags: [front, rgpd, suppression-de-compte, pistes]
---

## Contexte

Réf : **P172.05** du fichier de pistes, `validé`.

`AccountDeletionSection` lit la demande en cours par `getAccountDeletionRequestAction`, puis
`setRequest(result.ok ? result.data : null)`. `null` est l'état « aucune demande », qui montre le
bouton « Supprimer mon compte ». Une lecture en échec (API lente, 5xx, jeton absent) proposait donc
de demander la suppression à un compte dont la suppression est peut-être déjà programmée ; une
nouvelle demande la reprogramme (`AccountDeletionService::requestDeletion`, `updateOrCreate`).

## Décision du porteur

- P172.05 : « validation du porteur (2026-10-23) : en cas d'échec de lecture, afficher le `result.message` existant, sans bouton ; aucun texte neuf »

## Objectif utilisateur

Un échec de lecture se voit comme un échec : ni bouton de demande, ni bouton d'annulation.

## Contrat de données

Aucun changement : `ActionResult` porte déjà `message` en cas d'échec (`failure(err, 'loadFailed')`).

## Delta à produire

- [x] `AccountDeletionSection` : état d'échec qui affiche `result.message` (`role="alert"`), sans
  bouton.
- [x] Test vitest : action en échec → message, aucun bouton ; sans demande → bouton proposé.

## Critères d'acceptation

- [x] AC1 — action `{ ok: false, message }` → le message s'affiche, ni « Supprimer mon compte » ni
  « Annuler ».
- [x] AC2 — action `{ ok: true, data: null }` → le bouton « Supprimer mon compte » reste proposé.

## Reste à faire

- La double lecture : passer à la section la demande que la mise en page `(dashboard)` a déjà lue
  (partie de la `Piste` que la décision ne retient pas).

## Hors périmètre

- Un bouton « Réessayer » (la décision l'écarte : « sans bouton »).

## Notes d'implémentation

- Aucun texte neuf : le message vient de l'action (`serverActions.accountDeletion.loadFailed` côté
  serveur, ou le message de l'API filtré par `messageErreurApi`).
- Ablation : `AccountDeletionSection.tsx` rendu à `HEAD` → 1 rouge sur 2 ; correctif remis → 2/2,
  et les 9 tests d'`AccountDeletionSection.test.tsx` verts.
