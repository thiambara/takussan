---
id: TCK-2820
title: "Un loyer échu remboursé se compte « reçu puis remboursé » à l'accueil du bailleur, et non « en retard »"
status: todo
phase: P2
family: full
estimate: S
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: [TCK-2774]
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
    - "docs/features.md#15-transactions--paiements"
  models: []
tags: [api, front, accueil, dashboard, bailleur, loyers, remboursement, suite-de-tck-2774]
---

## Objectif utilisateur

Le bailleur qui ouvre son accueil voit ses loyers du mois en trois segments : reçus, en retard et à venir. Un loyer
qu'il a encaissé puis rendu au locataire ne doit pas lui apparaître « en retard » : il a été reçu puis remboursé, et
personne ne doit relancer ce locataire.

## Origine

Décision 18 (a) du porteur, 2026-11-14. Relevé de l'implémentation de TCK-2774 (loyers-2774). Depuis TCK-2774,
`rent_month` compte en retard toute échéance non soldée (`status != paid`) échue avant aujourd'hui. Une échéance
`refunded` y entre donc, pour son reste dû au sens de `PaymentHistory::remainingAmountSql()` : `amount − (amount −
refund_amount)`, soit le montant rendu. TCK-2623 (point 4) avait tranché le cas `failed` (reste attendu), pas le cas
`refunded`. La démo locale n'a aucune échéance `refunded` : l'effet ne s'y voit pas aujourd'hui.

## Contrat de données

- `GET /api/dashboard/owner` (`finance.rent_month`) et `GET /api/dashboard/me` (`metrics.rent_month`) gagnent
  `refunded_count` et `refunded_amount` : les échéances de loyer du mois au statut `refunded`, échues avant aujourd'hui
  (même borne de mois, même exclusion de la caution, même jour de Dakar que les trois autres segments). Le montant est
  `refund_amount`, le montant rendu.
- `overdue_count` / `overdue_amount` n'en comptent plus aucune.
- Lecture par sous-requêtes dans la requête des baux de `DashboardOwnerService::loyersDuMois()`, comme les autres
  segments.

## Contraintes strictes (métier)

- **L'invariant tient** : `received_count + overdue_count + upcoming_count + refunded_count = expected_count`. Sinon
  le lecteur du front (`lireLoyersDuMois`, `src/lib/accueil/loyers-du-mois.ts`) masque les segments, comme il le fait
  aujourd'hui quand les comptes ne bouclent pas.
- Une échéance `refunded` **non échue** (due aujourd'hui ou plus tard) reste « à venir », comme aujourd'hui.
- Une échéance `failed` reste « en retard » une fois échue (TCK-2623, point 4) : ce ticket ne la touche pas.
- Le budget de requêtes du bailleur reste au plafond de `DashboardQueryBudgetTest` (27).
- i18n `fr` / `en` / `wo` (le `wo` porte le texte français tel quel), vouvoiement.

## Delta à produire

- [x] API : `refunded_count` et `refunded_amount` dans `rent_month` (les deux routes, repli d'`OwnerMeMetrics` compris) ;
  `$enRetard` exclut le statut `refunded`.
- [x] Front : `lireLoyersDuMois` lit les deux clés (optionnelles, un `0` absent comme aujourd'hui) et `LoyersDuMois`
  rend la part « reçus puis remboursés » quand elle n'est pas nulle (libellé et montant), sans segment de couleur
  d'alerte.
- [x] `docs/features.md` § 2.5 : une ligne sur ce quatrième compte.
- [x] Tests dans `OwnerRentMonthTest` et dans les tests du lecteur de l'accueil.

## Critères d'acceptation

- [x] AC1 — Le 13 novembre, un bailleur a 14 loyers en novembre : 8 soldés, 2 échus le 5 non soldés, 1 échu le 5
  remboursé (300 000, `refund_amount` 300 000), 3 dus le 20. `rent_month` rend `received_count = 8`,
  `overdue_count = 2`, `refunded_count = 1`, `refunded_amount = 300000`, `upcoming_count = 3`, `expected_count = 14`.
- [x] AC2 — Un loyer remboursé dû le 20 (à venir) reste dans `upcoming_count` ; `refunded_count` vaut 0.
- [x] AC3 — Un loyer `failed` échu le 5 reste dans `overdue_count`.
- [x] AC4 — L'accueil du bailleur, nourri de la réponse d'AC1, affiche « 2 en retard » et une part « 1 reçu puis
  remboursé », et ses segments restent rendus (l'invariant boucle).
- [x] AC5 — `DashboardQueryBudgetTest` reste vert au plafond 27.
- [x] Ablation : retirer l'exclusion de `refunded` du segment en retard fait rougir AC1 ; compter `refunded` sans borne
  d'échéance fait rougir AC2 ; un lecteur front qui ignore `refunded_count` fait rougir AC4.

### Preuves (2026-11-14)

- AC1 : `OwnerRentMonthTest::test_tck2820_ac1_un_loyer_echu_rembourse_n_est_pas_en_retard` (les deux routes ; une
  caution remboursée échue du même mois n'entre pas) ; AC2 : `test_tck2820_ac2_…` (dû le 20 et dû le jour même) ;
  AC3 : `test_tck2820_ac3_…` ; repli d'`OwnerMeMetrics` : `test_tck2820_le_bloc_vide_porte_les_cles_des_rembourses`.
  `test_tck2774_le_montant_est_la_somme_des_remaining_amount` ajusté : la `refunded` échue en sort (4 en retard,
  1 remboursée pour son `refund_amount`).
- AC4 : `components/accueil/bailleur/__tests__/loyers-rembourses.tck-2820.test.tsx` ; lecteur :
  `lib/accueil/__tests__/loyers-du-mois.tck-2820.test.ts` (clés absentes = 0, incohérence = aucun segment).
- AC5 : `DashboardQueryBudgetTest` vert (deux sous-requêtes de plus dans la même requête des baux, aucune requête).
- Ablations, une à la fois, md5 restaurés : exclusion de `refunded` retirée du retard → AC1 (et le test des
  `remaining_amount`) rouges ; remboursées comptées sans borne d'échéance → AC2 rouge ; lecteur qui ignore
  `refunded_count` → AC4 rouge (2/3).
- Rendu : la part se dit sous les segments, encre `text-muted-foreground`, montant en `text-foreground`, sans part
  de la barre ni couleur d'alerte. Aucun relevé de fidélité : la démo n'a aucune échéance `refunded`.

## Hors périmètre

- Le reversement et la reprise d'un loyer remboursé (ADR-0039 et ses amendements).
- Les autres vues qui comptent les impayés : l'écran Impayés lit `CollectedPayments::OWED_STATUSES` (`pending`,
  `partially_paid`, `late`), où `refunded` n'entre pas.
