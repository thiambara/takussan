---
id: TCK-2053
title: "Un compte créé par téléphone est nommé sans trou dans les avis, les exports et la console, et n'y est plus « Anonyme »"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#111-avis--réputation"
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-193--comptes-et-invitations-sans-e-mail-face-aux-textes-et-avis-bâtis-sur-l-e-mail"
tags: [api, web, moderation, exports, notifications, pistes]
---

## Objectif

Un compte créé par téléphone (ni nom, ni e-mail) est désigné par quelque chose partout où il
apparaît, et un signalement fait par lui ne se lit plus comme anonyme.

## Contexte

Réf : **P193.05** du fichier de pistes, `validé`.

### Décision du porteur

> validé — validation du porteur (2026-10-23) : `nameWithoutContact()` pour l'avis de gouvernance, le message système et les exports ; `full_name ?: email ?: phone` dans la console et l'avis de demande d'upgrade (TCK-632) ; « Anonyme » seulement sans `user_id`

`PhoneLoginService::createAccount` pose `first_name = ''`, `last_name = ''`, `email = null`.

## Hypothèses (mode sans humain)

- « Les exports » : les colonnes qui nomment un **compte** (`User` : bailleur, bénéficiaire d'une
  commission, bailleur du reversement). Le payeur d'un paiement et le locataire d'un bail sont
  des fiches client (`Customer`), qui n'ont pas `nameWithoutContact()` : elles gardent leur nom.
- Le message système d'une conversation perd son repli sur l'e-mail, puis sur `#id` :
  `nameWithoutContact()` ne rend jamais une coordonnée (TCK-815).
- Dans la file de la console, un signaleur connu dont l'API ne rend aucun nom (ni nom, ni e-mail,
  ni téléphone) est désigné par `#<id>`, sans texte neuf. Le détail d'un avis garde son repli
  « Utilisateur » pour ce cas.

## Delta à produire

- [x] `GovernanceAlertService` : acteur et membre par `nameWithoutContact()`.
- [x] `SystemMessageFactory::displayName` : `nameWithoutContact()`.
- [x] `ExportDataService::fullName` : `nameWithoutContact()` pour un `User`, `username` chargé.
- [x] `UnifiedModerationService` et `ReviewController::reports` : `full_name ?: email ?: phone`.
- [x] `AgencyUpgradeRequestSubmittedNotification::toMail` : repli `email ?: phone`.
- [x] Front : `moderation.tsx` et `ModerationDetail.tsx`, « Anonyme » seulement sans compte.

## Critères d'acceptation

- [x] AC1 — L'avis de demande d'upgrade d'un compte créé par téléphone porte son numéro.
- [x] AC2 — La console de modération et la liste des signalements d'un avis nomment ce compte par
  son numéro.
- [x] AC3 — Le message système et l'avis de gouvernance ne rendent ni trou, ni e-mail, ni `#id`.
- [x] AC4 — L'export des baux nomme un bailleur sans nom par son `username`.
- [x] AC5 — Le front n'écrit « Anonyme » que pour un signalement sans compte.

## Hors périmètre

- Le repli sur le numéro masqué (laissé par le délégué au porteur, V3).
- La clé `submitted_by_email` de la cloche de la demande d'upgrade, inchangée.

## Notes d'implémentation

- Reproduit avant correctif : 6 rouges côté API (`NomDUnCompteSansNomTest`, 5 ;
  `GovernanceAlertTest::test_un_nouvel_admin_sans_nom_est_nomme_sans_trou`), 2 côté front.
- Ablation : `app/` et les deux composants remis à `HEAD` → 6 + 2 rouges ; remis → verts.
- Les relations `landlord` et `beneficiary` des exports ne chargeaient que `id,first_name,last_name` :
  sans `username` dans le `select`, `nameWithoutContact()` rendait toujours « — ».
