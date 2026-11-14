---
id: TCK-2832
title: "Modifier les réglages de bail de l'agence, depuis l'encart « Réglages de l'agence appliqués » du nouveau bail"
status: todo
phase: P2
family: full
estimate: M
wave: 88
created: 2026-11-14
updated: 2026-11-14
depends_on: [TCK-2643]
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#29-administration--configuration"
  models:
    - "docs/models-spec.md#30-setting-"
tags: [front, back, leases, agency, settings, audit-ux, app]
---

## Objectif utilisateur

L'administrateur d'agence qui crée un bail voit l'encart « Réglages de l'agence appliqués » (TCK-2643)
et peut, d'un lien « Modifier », régler une fois pour toute l'agence ce que chaque bail neuf reprend :
pénalité de retard, délai de grâce, indemnité de départ anticipé, plafond de révision du loyer. Il
n'a plus à corriger ces valeurs bail par bail.

## Contexte (relevé au HEAD 58c870a28, 2026-11-14)

- Décision 7 de TCK-2643 (`decisions-2643`) : l'encart est montré **sans** « Modifier », parce
  qu'aucune page n'écrit un réglage d'agence. Écart accepté dans
  `docs/qa/audit-ux-2026-11/fidelite/TCK-2643.json` ; ce ticket le solde.
- Côté API, l'écriture existe : `POST /api/settings` et `PUT|PATCH /api/settings/{setting}` en
  portée `agency`. Ils sont autorisés par `StoreSettingRequest` et `UpdateSettingRequest`
  (`AgencyPolicy::configure` : admin de l'agence ET `agency.update`, TCK-2024), et valident la valeur
  par les règles du catalogue (`StoreSettingRequest::formeCanonique`).
- Côté front, **aucun appelant** de `/api/settings` hors super-admin, et aucune page « réglages »
  sous `/app/agency/*`.
- Les clés concernées, catégorie `rentals` de `EditablePlatformSettings`, avec repli agence →
  catalogue (`ScopedSetting::numericAgencyValue`, plancher du catalogue, TCK-2643 r6) :
  - `lease.late_fee_percent` (0-50) ;
  - `lease.late_fee_grace_days` (0-30) ;
  - `lease.early_termination_penalty_months` (1-24 au catalogue, bornée 0-12 au préremplissage) ;
  - `lease.rent_review_max_pct` (> 0, ≤ 100).
- Le taux de commission (`agencies.commission_rate`) n'est pas un réglage `Setting` : il se règle
  avec l'agence. Il est hors de ce ticket.

## Intention

- **Front (intentionnel)** : un écran de réglages de bail de l'agence sous `/app/agency/*`, gardé
  comme les autres pages d'administration (`garderPageAdmin`, `PAGES_ADMIN`). Il montre, pour chaque
  clé, la valeur appliquée et sa source (agence ou plateforme), permet de la changer, et de revenir à
  la valeur de la plateforme. Le lien « Modifier » de l'encart du nouveau bail y mène, et seulement
  pour qui peut écrire. Le retour au bail ne perd pas la saisie en cours, ou l'écran dit qu'elle sera
  perdue ; le choix revient au design, sur maquette.
- **Back (prescriptif)** :
  - « Revenir à la valeur de la plateforme » supprime la ligne d'agence ; une ligne à 0 ne sert pas
    à cela (TCK-2643 r6).
  - Re-mesurer l'autorisation : qui configure l'agence écrit ses réglages, rien de plus ; ni un
    agent, ni un bailleur, ni l'admin d'une autre agence.
  - `defaults` dit au front si l'appelant peut modifier ces réglages. Le front ne le déduit pas
    seul du rôle.

## Critères d'acceptation

- [ ] AC1 — L'admin d'une agence règle `lease.late_fee_percent` à 5 depuis l'écran. Le nouveau bail
  suivant préremplit « 5 % » avec la source « Réglage de l'agence ».
- [ ] AC2 — « Revenir à la valeur de la plateforme » retire la ligne d'agence. Le nouveau bail reprend
  la valeur du catalogue avec la source « Réglage de la plateforme ».
- [ ] AC3 — L'encart du nouveau bail montre « Modifier » à l'admin qui peut configurer l'agence, et pas
  à l'agent ni au bailleur. Le lien mène à l'écran de réglages.
- [ ] AC4 — Un agent, un bailleur ou l'admin d'une autre agence reçoit 403 en écriture, avant toute
  validation. L'ablation de la garde rend ces tests rouges.
- [ ] AC5 — Une valeur hors des règles du catalogue est refusée, avec le message du champ.
- [ ] AC-F — Fidélité à la maquette retenue, à 390 et 1280, dès qu'une maquette existe (ADR-0106).
  Elle est à produire avant l'implémentation.

## Hors périmètre

- Les autres clés de `rentals` (rappels d'impayés, signature obligatoire, plafond des pénalités) :
  elles ont leur propre lecteur. L'écran peut les accueillir plus tard.
- Le taux de commission de l'agence.
