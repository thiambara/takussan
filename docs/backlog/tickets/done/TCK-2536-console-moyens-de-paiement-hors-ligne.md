---
id: TCK-2536
title: Console d'agence : déclarer les moyens de paiement hors ligne (Wave, Orange Money, coordonnées bancaires)
status: done
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

## Notes d'implémentation

**Re-mesuré le 2026-11-09 (agent console, vague 2)** : le contrat de TCK-2504 tient —
`php artisan test tests/Feature/Api/Agency/AgencyOfflinePaymentSettingsTest.php` → 4 verts (saisie
« 77 123 45 67 » rendue `+221771234567`, 422 sur `settings.<clé>`, `null` retire la clé, fusion clé par
clé). **Prémisse non écrite au ticket** : `PATCH /api/agencies/{id}` exige la 2FA de l'admin (TCK-761) —
mesuré sur la base de dev, `admin@agency1.demo.takussan.sn` (2FA non activée) → `403
two_factor_required` avant toute validation. Le formulaire passe déjà par `avecGardeDoubleFacteurAction`
(la boîte de la coque s'ouvre) ; l'enregistrement réel n'a donc pas été rejoué au navigateur (activer
la 2FA d'un compte de démo partagé aurait changé l'état de la base des autres agents).

- Les trois champs vivent dans une section « Paiement hors ligne » d'`AgencyConfigForm`, pour TOUTE
  agence (l'API ne les refuse pas à une `individual`, qui envoie aussi des liens de paiement).
- Envoi : une clé ne part que si sa valeur ROGNÉE a changé par rapport à la référence `settings`
  recalée sur chaque réponse (même patron que TCK-2486) ; vidée (ou réduite à des blancs) → `null`.
- Erreurs : l'API répond `settings.offline_payment_*` ; `erreursDesReglagesSurLeurChamp`
  (`src/lib/schemas/agency.ts`) renomme ces trois clés vers le champ du formulaire, sinon `useApiForm`
  les rangeait dans le bandeau. Les autres clés `settings.*` ne changent pas de chemin.
- Relecture : `onSuccess` pose les trois champs depuis `saved.settings` — le numéro affiché est celui
  que l'API a normalisé, sans reformatage local.
- Pas de contrôle de forme des numéros côté client (l'API accepte la saisie libre) ; la zone de texte
  porte `maxLength=500` et un compteur.
- Tests : `AgencyConfigForm.paiement-hors-ligne.tck-2536.test.tsx` (13), sept ablations rouges
  (envoi retiré, les trois envoyés, `''` au lieu de `null`, comparaison non rognée, renommage des
  erreurs retiré, relecture retirée, borne retirée).
- Écran vu au navigateur à 1440 × 900 et 390 × 844 (admin d'agence `standard`) : aucun débord
  (`scrollWidth` = largeur), champs de 534/534/1082 px au bureau, 310 px au téléphone.
- **Revue adverse — Orange Money relu à part** : un 14ᵉ test ne touche que le champ Orange Money
  (`78 111 22 34` → réponse `+221781112234`). La saisie part seule, le champ relit l'E.164 rendu par
  l'API, Wave reste intact et un second envoi ne renvoie rien. Ablation : seule la relecture
  `setValue('offline_payment_orange_money_number', …)` retirée → ce test rougit, et lui seul (les tests
  Wave restent verts). Fichier restauré par `cp` (md5 47683946…).
