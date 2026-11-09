---
id: TCK-2504
title: Lien de paiement : moyens de paiement hors ligne déclarés par l'agence, et échéance déjà réglée
status: todo
phase: P1
family: back
estimate: S
wave: 84
created: 2026-11-08
updated: 2026-11-08
depends_on: []
blocks: [TCK-2505]
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

- [ ] Trois clés au catalogue `AgencySettings` (règles et défauts).
- [ ] `PublicPaymentLinkController::show` : bloc `offline_payment`, état « déjà réglée » avec `paid_at`.
- [ ] Tests : `PayLinkOfflinePaymentTest` (bloc présent, champs nuls omis), `PayLinkAlreadyPaidTest` (état et date, aucun `initiate` possible), `AgencyOfflinePaymentSettingsTest` (normalisation, capacité).
- [ ] Le formulaire des réglages d'agence côté console : trois champs (même ticket, petit).

## Critères d'acceptation

- [ ] AC1 — Une agence qui déclare un numéro Wave le voit rendu dans `offline_payment.wave_number` sur ses liens.
- [ ] AC2 — Le lien d'une échéance payée rend 200 avec le statut payé et `paid_at`, et `POST initiate` reste refusé.
- [ ] AC3 — Un numéro mal formé est refusé en 422 à l'enregistrement du réglage.

## Hors périmètre

- La page publique (TCK-2505).
- Le rapprochement d'un paiement hors ligne (existant côté console).

## Notes d'implémentation

_(à remplir par implementing-specs)_
