---
id: TCK-667
title: "Échéancier : une échéance trimestrielle ou annuelle facture tous les mois de sa période"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#14-location-longue-durée-baux
  models:
    - docs/models-spec.md#14-lease-
    - docs/models-spec.md#15-leasepayment-
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-4--argent--montants-devises-arrondis-factures-paiements
tags: [back, lease, payments, pistes]
---

## Objectif utilisateur

Un gestionnaire qui crée un bail trimestriel ou annuel facture au locataire tout le loyer de la
période, et non un seul mois par trimestre ou par an.

## Décision du porteur

validé — montant = loyer mensuel × mois de la période, la période couvrant tous ses mois

## Contrat de données

Réf : **P04.01** du fichier de pistes. Aucun endpoint neuf, aucune migration.

- `LeaseService::scheduleUnderLock()` (appelé par `POST /api/leases/{lease}/payments/generate-schedule`
  et par la tâche `GenerateLeasePaymentSchedule`) écrit les `LeasePayment` de loyer.
- `payment_frequency` (`monthly`, `quarterly`, `yearly`) fixe le nombre de mois d'une période :
  1, 3 ou 12.

## Contraintes strictes (métier)

- `amount` d'une échéance = `monthly_rent` × nombre de mois de sa période.
- `period_start` = premier jour du mois de l'échéance ; `period_end` = dernier jour du dernier mois
  de la période.
- Un échéancier mensuel est inchangé.

## Delta à produire

- [x] `LeaseService::scheduleUnderLock()` : montant et `period_end` selon les mois de la période
      (`monthsPerPeriod()`).
- [x] `tests/Feature/Jobs/GenerateLeasePaymentScheduleTest.php` : un test par fréquence, et la
      dernière période d'un bail qui finit en cours de trimestre.

## Critères d'acceptation

- [x] AC1 — bail du 2026-01-01 au 2026-12-31 à 100 000 : mensuel → 12 échéances de 100 000, du 1er au
      dernier jour de chaque mois.
- [x] AC2 — même bail trimestriel → 4 échéances de 300 000, `2026-01-01`–`2026-03-31`, …,
      `2026-10-01`–`2026-12-31`.
- [x] AC3 — même bail annuel → 1 échéance de 1 200 000, `2026-01-01`–`2026-12-31`.
- [x] AC4 — bail trimestriel qui finit le 2026-10-31 → la dernière échéance couvre octobre seul
      (100 000) : aucun mois après le bail n'est facturé.

## Hors périmètre

- Les échéanciers déjà générés : aucune donnée n'est réécrite (V4).
- La première échéance d'un bail qui commence après le jour de paiement du mois : elle est reportée
  d'une période entière, comme avant (comportement existant, non touché).
- Le plafond de 12 échéances d'un bail sans date de fin, qui vaut 3 ans en trimestriel et 12 ans en
  annuel.
- L'arrondi des montants (P04.08).

## Notes d'implémentation

- Hypothèse (mode sans humain) : la dernière période s'arrête au **mois** de fin du bail. Sans cette
  borne, un bail trimestriel de 10 mois aurait été facturé 12 mois. Le mois de fin compte en entier,
  comme le faisait déjà l'échéancier mensuel.
- Ablation :
  - correctif retiré → 3 rouges (trimestriel, annuel, dernière période), le mensuel reste vert ;
  - seule la borne de fin retirée → 1 rouge (dernière période : 300 000 au lieu de 100 000) ;
  - correctif remis → 9 verts, 26 assertions.
