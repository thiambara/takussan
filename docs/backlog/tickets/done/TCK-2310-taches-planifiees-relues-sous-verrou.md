---
id: TCK-2310
title: "Tâches planifiées relues sous verrou : pénalité de retard, fin d'essai et compte des sessions d'impersonation fermées"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: []
spec_refs:
  models:
    - "docs/models-spec.md#14-lease-"
  adr:
    - "docs/adr/0048-effet-d-une-suspension-d-agence.md#amendement-du-2026-10-22--une-agence-ne-se-supprime-pas-elle-sort-du-cycle-de-vie-par-son-statut"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-229--tâches-planifiées-qui-transitent-une-ligne-chargée-en-lot-face-au-geste-joué-pendant-leur-passage"
tags: [api, back, lease, late-fee, facturation, abonnement, impersonation, concurrence, pistes]
---

## Contexte

Pistes : P229.05, P229.06

Réf : **P229.05** et **P229.06** du fichier de pistes, `validé` (critère V1 accordé pour les deux).
Trois tâches planifiées lisent leurs lignes en lot, puis les écrivent sans rejuger, sous verrou, ce
que le lot a lu :

- `LateFeeCalculator::apply` calculait le montant et la base de la pénalité sur le modèle du lot
  (`chunkById(200)` d'`ApplyLateFeesJob`), hors transaction. Sous le verrou, il ne rejugeait que
  `late_fee_applied_at` et le statut. Un paiement partiel posé entre-temps ne réduisait pas la
  pénalité, contre `docs/models-spec.md` (`late_fee_percent` « appliqué au **restant dû** »).
- `AgencySubscriptionService::processTrialExpirations` relisait chaque essai par `find()`, sans
  verrou, et n'y rejugeait que `status = trialing`. Il ne relisait ni `ended_at`, ni
  `trial_ends_at`, ni le statut de l'agence, que la sélection exige depuis TCK-1501 (ADR-0048,
  amendement du 2026-10-22).
- `ImpersonationService::closeExpired` rendait le nombre de sessions chargées, et non celui des
  sessions que `stop()` a fermées.

Re-mesuré le 2026-10-25 sur `b4d905cd3`. Les tests neufs rougissent avant correctif :
- pénalité écrite 5 000 au lieu de 1 000 ;
- essai converti (1 au lieu de 0) après une suspension, une prolongation ou une fin posée ;
- `closeExpired` rend 2 au lieu de 1 ;
- `stop()` rend `null`.

## Décision du porteur

- P229.05 : validation du porteur (2026-10-25) : `compute` et `base` sur la ligne relue sous verrou
- P229.06 : validation du porteur (2026-10-25) : le patron de `renewPeriods` (verrou, critères rejugés, statut de l'agence compris) ; `stop()` rend un booléen additionné par `closeExpired`

## Hypothèses

- `apply()` garde un premier filtre hors transaction, `isApplicable($payment)`, pour ne pas ouvrir
  de transaction sur une ligne que le lot sait déjà hors champ. Ce filtre ne lit pas la base : seul
  `compute($locked)` décide du montant.
- Le statut de l'agence est relu dans la transaction de l'essai, sans verrou sur la ligne de
  l'agence. Le patron de `renewPeriods` ne verrouille que l'abonnement, et la décision ne demande
  pas plus.

## Delta à produire

- [x] `LateFeeCalculator::apply` : `compute($locked)`, `base($locked)` et le taux du bail de la
      ligne relue, dans la transaction. Le journal `late_fee_applied` et l'événement
      `LeasePaymentLateFeeApplied` portent la base relue.
- [x] `AgencySubscriptionService::processTrialExpirations` : une transaction par essai,
      `lockForUpdate`, et tous les critères de la sélection rejugés : `trialing`, `ended_at` nul,
      `trial_ends_at` posé et échu, agence `active`.
- [x] `ImpersonationService::stop()` rend `bool` (vrai si cet appel a fermé la session), et
      `closeExpired` additionne ces booléens.

## Critères d'acceptation

- [x] AC1 — Loyer `pending` de 100 000, bail à 5 %, lu par le lot, puis passé en base à
      `partially_paid` avec `paid_amount = 80 000` : `apply()` rend 1 000 et l'écrit. Le journal et
      l'événement portent la base 20 000.
- [x] AC2 — Essai échu d'une agence `active`, sélectionné, puis agence suspendue, essai prolongé ou
      fin posée avant le verrou : 0 converti, l'essai reste `trialing`. Les tests existants
      (agences `inactive` et `suspended` sautées, conversion au retour à `active`) restent verts.
- [x] AC3 — Deux sessions échues, dont l'une est fermée par un `stop` concurrent entre la sélection
      et le verrou : `closeExpired` rend 1, et la session fermée garde sa cause `stopped`.
- [x] AC4 — `stop()` rend vrai à la fermeture, et faux sur une session déjà fermée.

## Hors périmètre

- La sortie de `impersonation:close-expired` garde son texte : seul le nombre change.

## Notes d'implémentation

- Le geste concurrent est écrit par `DB::listen`, juste après la requête qui fige la sélection. Un
  écouteur `retrieved` ne convient pas ici : avec le correctif, la seule lecture est celle du
  verrou, et l'écouteur jouerait après elle, sur la même connexion.
- Ablations, chacune sur le seul correctif visé :
  - `LateFeeCalculator.php` remis à `pre-dev` → AC1 rouge (5000.0 au lieu de 1000.0) ;
  - sans le rejugé de `ended_at`, de `trial_ends_at->isFuture()` ou du statut de l'agence → un seul
    rouge à chaque fois, le jeu de données du critère retiré ;
  - `closeExpired` qui rend `$echues->count()` → AC3 rouge (2 au lieu de 1).

  Tout est vert une fois remis.
- `AgencyStatus` se compare à l'enum : `value('status')` d'une requête Eloquent rend l'attribut casté.
