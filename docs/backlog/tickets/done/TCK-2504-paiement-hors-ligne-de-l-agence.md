---
id: TCK-2504
title: Lien de paiement : moyens de paiement hors ligne déclarés par l'agence, et échéance déjà réglée
status: done
phase: P1
family: back
estimate: S
wave: 84
created: 2026-11-08
updated: 2026-11-09
depends_on: []
blocks: [TCK-2505, TCK-2536]
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models: []
tags: [back, payments, pay-link, audit-ux]
---

## Objectif utilisateur

Le locataire qui ne peut pas payer en ligne sait comment payer quand même, et celui qui a déjà payé le voit au lieu de « lien plus valide ».

## Contrat de données

- Réglages d'agence (catalogue `App\Domain\Settings\AgencySettings`) : `offline_payment_wave_number`, `offline_payment_orange_money_number` (téléphone normalisé E.164, nullable), `offline_payment_bank_details` (texte ≤ 500, nullable).
- `GET /api/pay/{token}` ajoute `offline_payment` : `{ wave_number, orange_money_number, bank_details, agency_phone, agency_whatsapp }` (champs nuls omis), et, pour une échéance payée, `paid_at` au lieu d'une erreur, avec le statut.

## Contraintes strictes (métier)

- Les numéros passent par la même normalisation que les téléphones de l'API (`TelephoneSaisi`).
- Réglages modifiables par qui détient la capacité des réglages d'agence ; journalisés comme les autres.
- Un lien d'une échéance payée ou remboursée n'ouvre toujours aucun paiement (TCK-593) ; il rend son état et `paid_at`.
- Rien de la page de paiement n'expose d'autre donnée du locataire que celles d'aujourd'hui.

## Delta à produire

- [x] Trois clés au catalogue `AgencySettings` (règles et défauts).
- [x] `PublicPaymentLinkController::show` : bloc `offline_payment`, état « déjà réglée » avec `paid_at`.
- [x] Tests : `PayLinkOfflinePaymentTest` (bloc présent, champs nuls omis), `PayLinkAlreadyPaidTest` (état et date, aucun `initiate` possible), `AgencyOfflinePaymentSettingsTest` (normalisation, capacité).
- Le formulaire des réglages d'agence côté console (trois champs) : **déplacé dans [TCK-2536](TCK-2536-console-moyens-de-paiement-hors-ligne.md)** (front, vague 3), qui reprend le contrat ci-dessous.

## Critères d'acceptation

- [x] AC1 — Une agence qui déclare un numéro Wave le voit rendu dans `offline_payment.wave_number` sur ses liens. — `PayLinkOfflinePaymentTest::test_les_moyens_declares_sont_rendus_et_les_absents_omis`
- [x] AC2 — Le lien d'une échéance payée rend 200 avec le statut payé et `paid_at`, et `POST initiate` reste refusé. — `PayLinkAlreadyPaidTest::test_une_echeance_payee_rend_son_statut_et_sa_date`
- [x] AC3 — Un numéro mal formé est refusé en 422 à l'enregistrement du réglage. — `AgencyOfflinePaymentSettingsTest::test_un_numero_mal_forme_est_refuse`

## Hors périmètre

- La page publique (TCK-2505).
- Le rapprochement d'un paiement hors ligne (existant côté console).

## Notes d'implémentation

**Mesures avant de coder (2026-11-09, `feat/audit-ux-vague-1`)** — ce que le ticket affirmait, ce que le code rend :

- `GET /api/pay/{token}` (`PublicPaymentLinkController::show`, `routes/api/pay.php`) **rend déjà 200** pour une échéance `paid`, pendant 30 jours après le paiement (`LeasePaymentLinkService::effectiveExpiry`, `payments.pay_link.receipt_days`) : `status: paid`, `amount_due: 0`, `providers: []`, `receipt_available: true`, `initiate` en 409 `payment.not_payable`. Au-delà des 30 jours, 410 `pay_link.gone`. **Il manquait seulement `paid_at`.** Une échéance `refunded` rend 410 `pay_link.gone` (`isPayableByNature`), et `PublicPaymentLinkTest::test_unknown_gone_paid_and_unavailable_answers` (TCK-602 AC15) l'épingle.
- **L'agence n'a aucun champ WhatsApp** (`agencies` : `email`, `phone`, `website`… ; aucune colonne ni réglage `whatsapp`). `agency_whatsapp` du contrat n'a donc aucune source : il n'est pas rendu (champ nul omis, conforme au contrat).
- `AgencySettings` existe tel que cité ; ses clés sont validées par `AgencyUpdateRequest` (`PATCH /api/agencies/{id}`, autorisation `configure` = `agency.update`), fusionnées clé par clé sous verrou par `AgencyController::update`, et **journalisées par `Auditable` sur `Agency`** (`settings` est dans `$fillable`, `logOnlyDirty`) : rien à ajouter pour le journal.
- `TelephoneSaisi` est à la fois la normalisation (`normaliser()`, E.164 pour un numéro sénégalais) et la règle de validation : elle est appliquée aux deux numéros dans `AgencyUpdateRequest::prepareForValidation`.
- `AgencyResource` rend `settings` (sans les clés d'onboarding) : les trois réglages y apparaissent, servis au seul personnel (`GET /api/agencies/{id}`), ce qui suffit au formulaire de la console.
- **Premisse contredite — « journalisés comme les autres »** : `Agency` est `Auditable` mais en LISTE BLANCHE (`Agency::AUDIT_ONLY`), et `settings` n'y était pas : **aucun réglage d'agence n'était journalisé**. Décision de la session (2026-11-09) : `settings` entre dans `AUDIT_ONLY` — changer en silence les coordonnées de paiement d'une agence est la fraude par détournement que le journal doit voir. Tous les réglages de l'agence sont donc journalisés désormais, pas seulement ces trois (`AgencyOfflinePaymentSettingsTest::test_changer_les_coordonnees_bancaires_laisse_une_trace`, vérifié par ablation).

**Décisions non évidentes**

- **Une échéance remboursée se LIT** : `show` rend 200 avec `status: refunded` et `paid_at` (`LeasePaymentLinkService::resolve($token, readSettled: true)`) ; `initiate`, `verify` et `receipt` restent 410. La caution rendue, la révocation, la suppression et l'expiration restent 410 pour tous. `PublicPaymentLinkTest` (TCK-602 AC15) a été ajusté sur ce seul point.
- **Le délai de 30 jours après paiement n'est PAS levé** — et il vaut aussi pour la remboursée (revue) : passé ce délai, le lien d'une échéance payée rend toujours 410 `pay_link.gone`, celui d'une échéance remboursée 30 jours après le remboursement (réception du dernier événement `refunded` du fournisseur, `metadata.gateway_events`), ou après le paiement si le remboursement n'a pas de date (`LeasePaymentLinkService::effectiveExpiry`, `PayLinkAlreadyPaidTest::test_une_echeance_remboursee_tombe_trente_jours_apres_*`, ablations 3a/3b rouges). Une échéance **annulée** reste 410 : elle ne se lit pas comme « réglée » (`test_une_echeance_annulee_reste_gone`, ablation 4b rouge). Le jeton est une autorisation au porteur ; l'étendre indéfiniment exposerait montant, bien et agence à quiconque retrouve un vieux lien. Le cas visé par l'objectif — le locataire qui rouvre son lien après avoir payé — tombe dans les 30 jours.
- `offline_payment` vaut `null` (et non `{}`) quand rien n'est connu, ou quand plus rien n'est dû. **Revue (2026-11-09, tranché par la session)** : le bloc paraît tant que quelque chose reste dû — `amount_due > 0` **OU** `late_fee_outstanding > 0` — et seulement sur une échéance ni remboursée, ni annulée, ni caution rendue (`PublicPaymentLinkController::owesSomething`). Un loyer payé dont la pénalité reste due garde donc le bloc (la pénalité se règle à l'agence) ; il s'appuyait avant sur `isPayable`, qui le retirait (`PayLinkOfflinePaymentTest::test_loyer_paye_penalite_due_le_bloc_hors_ligne_reste`, ablations 6a/6b rouges).
- **Une échéance remboursée ne doit plus rien, pénalité comprise** : `LeasePayment::lateFeeOutstanding()` rend 0 pour `refunded` comme pour `cancelled` — la console (`LeasePaymentResource`) et le lien lisent la même source (`test_une_echeance_remboursee_ne_doit_rien_et_n_a_pas_de_bloc_hors_ligne`, ablations 6c/6d rouges). **Contre-vérification (2026-11-09)** : le miroir SQL `CollectedPayments::lateFeesOutstanding()` (accueil de l'agence et du bailleur, accueil du locataire, relevé de gérance) n'excluait que `cancelled` — il comptait 7 500 « à recouvrer » sur une remboursée que la ligne disait nulle et que le règlement refusait (409). Il exclut désormais `refunded` aussi ; et le modèle, qui comptait une pénalité sur une restitution de caution que le SQL excluait (divergence préexistante), l'exclut à son tour. Parité gardée statut par statut, caution comprise, par `PenalitesARecouvrerTest::test_le_miroir_sql_rend_la_regle_du_modele_sur_chaque_statut`, et la remboursée vaut 0 dans les trois agrégats (ses trois tests) — ablations rouges. Les autres lectures de la pénalité (`PayoutCalculator`, `PlatformMetricsSnapshotter`, `PortfolioMetrics::266`, `AgencyDetailController`, `PlatformPayoutService`) portent sur la pénalité RÉGLÉE, hors de cette règle.
- Les numéros passent par `TelephoneSaisi::normaliser` (dans `AgencyUpdateRequest::prepareForValidation`), puis par `TelephoneJoignable` + `TelephoneSaisi` (les règles de `visitor_phone`) : `TelephoneSaisi` seul n'aurait refusé ni « abc » ni « +330612345678 ».

**Contrat pour le front (TCK-2505, et TCK-2536 pour le formulaire de la console)**

- **Règle d'affichage du bloc hors ligne pour TCK-2505** : l'écran affiche `offline_payment` dès qu'il n'est pas `null`, sans recalculer — le serveur l'émet tant que `amount_due > 0` ou `late_fee_outstanding > 0`, jamais sur une échéance remboursée ou annulée.
- `GET /api/pay/{token}` ajoute deux clés, toujours présentes :
  - `paid_at` : instant ISO-8601 (`2026-11-02T10:15:00+00:00`) ou `null` ;
  - `offline_payment` : `null`, ou un objet dont les clés NULLES SONT OMISES parmi `wave_number`, `orange_money_number` (E.164), `bank_details` (texte ≤ 500, sauts de ligne possibles), `agency_phone` (tel que l'agence l'a saisi). `agency_whatsapp` n'est jamais rendu (aucune source).
- États : due → `status` `pending`/`late`/`partially_paid`…, `paid_at: null`, `offline_payment` éventuel ; payée et pénalité réglée (≤ 30 j) → 200, `status: paid`, `paid_at`, `providers: []`, `receipt_available: true`, `offline_payment: null`, `POST initiate` 409 `payment.not_payable` ; payée mais pénalité due → 200, `status: paid`, `amount_due: 0`, `late_fee_outstanding` > 0, `offline_payment` présent (le bloc dit où régler la pénalité) ; remboursée (≤ 30 j après le remboursement) → 200, `status: refunded`, `paid_at`, `amount_due: 0`, `late_fee_outstanding: 0`, `receipt_available: false`, `offline_payment: null`, `initiate`/`verify`/`receipt` 410 ; annulée → 410 ; sinon 410 `pay_link.gone` (`params.agency`), 404 `pay_link.not_found`.
- Réglages : `PATCH /api/agencies/{id}` avec `settings.offline_payment_wave_number`, `settings.offline_payment_orange_money_number` (saisie libre « 77 123 45 67 » acceptée, rendue `+221771234567`), `settings.offline_payment_bank_details` ; `null` retire la clé ; 422 sur `settings.<clé>` ; 403 sans la capacité `agency.update`. Relus dans `GET /api/agencies/{id}` → `data.settings.<clé>`.
- [x] Delta specs fait par la session (2026-11-09) : `docs/features.md` § 1.5 (lien de paiement : `paid_at`, échéance remboursée lue, `offline_payment`) ; `docs/models-spec.md` § 2 (`settings` journalisés, trois clés au catalogue).
