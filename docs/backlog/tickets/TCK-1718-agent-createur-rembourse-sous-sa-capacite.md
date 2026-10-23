---
id: TCK-1718
title: "L'agent qui a saisi un bien d'agence rembourse un acompte sous `bookings.refund`, comme le reste du personnel"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-160--propertiesuser_id-lu-comme-le-bailleur-dans-une-décision-métier"
tags: [api, autorisation, reservations, argent, pistes]
---

## Contexte

Réf : **P160.01** du fichier de pistes (🔴, `validé`). `BookingMoneyAccess::isDirectLandlord`
tenait pour « bailleur direct » quiconque est `properties.user_id`, et `canRefund` le laissait
passer avant tout contrôle de capacité. Or `PropertyController::store` pose l'agent qui saisit un
bien d'agence en `user_id` : l'agent du rôle système, qui n'a pas `bookings.refund`, remboursait
les acomptes des réservations de ce bien (mesuré : `POST /api/booking-payments/{id}/refund` → 200,
acompte `refunded`), et la fiche lui montrait le geste (`can_refund`).

**Décision du porteur** : validé — validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

Le critère accordé est V1 et V2 (retirer le remboursement à l'agent créateur ; sens de `user_id`
sur un bien saisi par le personnel).

## Objectif utilisateur

L'agent qui a saisi un bien d'agence ne rembourse un acompte que si son rôle lui donne
`bookings.refund`, comme tout membre du personnel.

## Delta à produire

- [x] `App\Services\Property\BailleurDuBien::est()` : un seul prédicat, partagé avec TCK-1720 et
  TCK-1722 — désigné par la colonne de bailleur, ET bien sans agence ou profil propriétaire dans
  l'agence.
- [x] `BookingMoneyAccess::isDirectLandlord` l'appelle : `canRefund`, `canRecordAsCollector` et
  `can_refund` de la fiche en héritent.
- [x] Tests dans `BookingPaymentRefundAuthorizationTest`.

**Choix de l'implémenteur** (voie la plus étroite) : la `Piste` dit « propriétaire au sens de
`PrimaryPropertyContact::estProprietaire` (bien sans agence, ou `OwnerProfile` de l'agence du
bien) ». Le prédicat retient la parenthèse — détenir un profil propriétaire dans l'agence, quel
qu'en soit le statut —, et non `estProprietaire` entier, qui exige aussi un profil `active` et un
compte joignable : il retirerait en plus des gestes au bailleur `inactive` ou `draft`, ce que la
piste ne mesure ni ne demande. Le bailleur `blocked` reste écarté par la règle d'avant.

## Critères d'acceptation

- [x] AC1 — agent du rôle système, créateur du bien : remboursement 403, acompte `paid`,
  `can_refund` faux (`test_the_agent_who_entered_the_property_is_judged_by_bookings_refund`).
- [x] AC2 — le même agent titulaire de `bookings.refund` : 200
  (`test_the_agent_who_entered_the_property_refunds_with_the_capability`).
- [x] AC3 — le bailleur du bien : 200 (`test_the_direct_landlord_can_refund`, existant), y compris
  s'il est aussi agent de l'agence (`test_a_landlord_who_is_also_staff_still_refunds_his_own_property`).

## Hors périmètre

- `canRecordAsCollector` : l'agent créateur y reste vrai, au titre du personnel (`isStaff`), qui
  n'y est jugé par aucune capacité. Le constat (« sans `payments.record` → vrai ») n'est donc pas
  fermé par ce ticket ; c'est la branche personnel qu'il faudrait garder par `payments.record`,
  défaut distinct de celui de la piste.
- Qui est le bailleur d'un bien saisi par le personnel (P15.06, P50.01, TCK-997).

## Notes d'implémentation

- Ablation : `BookingMoneyAccess.php` rendu à `origin/pre-dev` → AC1 rouge (« Expected 403 but
  received 200 »), les 20 autres verts ; correctif remis → 21 verts.
- Classes rejouées, vertes : `BookingPaymentRefundAuthorizationTest`,
  `BookingPaymentRefundSettledByPlatformTest`, `BookingRefundTaskTest`, `BookingPaymentTest`,
  `MoneyOutTwoFactorTest`, `BookingWriteMatchesShowTest`, `PaymentGatewayInitiateTest`.
