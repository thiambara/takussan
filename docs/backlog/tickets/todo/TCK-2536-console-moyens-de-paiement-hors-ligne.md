---
id: TCK-2536
title: Console d'agence : déclarer les moyens de paiement hors ligne (Wave, Orange Money, coordonnées bancaires)
status: todo
phase: P1
family: back
estimate: S
wave: 84
created: 2026-11-09
updated: 2026-11-09
depends_on: [TCK-2504]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models: []
tags: [front, payments, pay-link, agency-settings, audit-ux]
---

## Objectif utilisateur

L'administrateur d'agence déclare, dans la configuration de son agence, les moyens par lesquels un locataire peut payer hors ligne. Ce sont eux que la page du lien de paiement affiche (TCK-2504, TCK-2505).

## Contrat de données (livré par TCK-2504)

- `PATCH /api/agencies/{id}`, clés fusionnées une à une dans `settings` :
  - `settings.offline_payment_wave_number` et `settings.offline_payment_orange_money_number` : saisie libre acceptée (« 77 123 45 67 »), rendue normalisée en E.164 (`+221771234567`) ;
  - `settings.offline_payment_bank_details` : texte, 500 caractères au plus, sauts de ligne admis ;
  - `null` retire la clé ; une clé absente du corps n'est pas touchée.
- Refus : 422 sur `settings.<clé>` (numéro mal formé, texte trop long) ; 403 sans la capacité `agency.update`, avant toute validation.
- Relecture : `GET /api/agencies/{id}` → `data.settings.<clé>` (absente quand rien n'est déclaré).
- Chaque changement est journalisé (`Agency::AUDIT_ONLY` porte `settings` depuis TCK-2504).

## Contraintes strictes

- Les trois champs vivent dans le formulaire de configuration existant (`AgencyConfigForm`), pas dans un écran neuf.
- Le formulaire envoie seulement les clés modifiées : la fusion côté serveur garde les autres réglages, mais un `null` envoyé par mégarde efface une valeur.
- Les erreurs 422 s'affichent sur le champ concerné ; les libellés passent par next-intl (`fr`, `en` ; `wo` = texte français, wolof en pause).
- Un numéro rendu normalisé s'affiche tel que l'API le rend, sans reformatage local qui le contredirait.

## Delta à produire

- [ ] Trois champs dans `AgencyConfigForm` (deux téléphones, un texte multiligne), schéma `src/lib/schemas/agency.ts` et type `src/types/agency.ts`.
- [ ] Erreurs de validation de l'API sur chaque champ.
- [ ] Tests vitest du formulaire : envoi des seules clés modifiées, affichage d'une erreur 422 sur le bon champ, effacement explicite.

## Critères d'acceptation

- [ ] AC1 — L'admin saisit « 77 123 45 67 » comme numéro Wave et enregistre : le champ affiche `+221771234567` après relecture.
- [ ] AC2 — Un numéro mal formé affiche l'erreur de l'API sous le champ, et rien n'est enregistré.
- [ ] AC3 — Vider un champ puis enregistrer retire le réglage (`null`) ; les deux autres restent intacts.
- [ ] AC4 — Écran vérifié à 390 × 844 et à 1440 × 900.

## Hors périmètre

- La page publique du lien de paiement (TCK-2505).
- Le rapprochement d'un paiement hors ligne (existant côté console).
