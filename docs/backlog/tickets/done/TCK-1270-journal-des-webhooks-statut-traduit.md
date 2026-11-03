---
id: TCK-1270
title: "Le journal des webhooks traduit ses statuts, et le statut d'une demande de passage n'est déclaré qu'une fois"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-146--unions-de-statut-et-options-de-filtre-du-front-face-aux-enums-de-lapi"
tags: [front, super-admin, i18n, pistes]
---

## Contexte

Réf : **P146.05** du fichier de pistes, `retenu · autonome` (A1, A3). Entrée dans le lot par
l'angle 146.

Le journal des webhooks d'une intégration (`WebhookTrailTable`, `admin/super/integrations.tsx`)
rend `log.status` brut, alors que `superAdmin.payments.journal.statuses` nomme les quatre valeurs
que l'API pose. `AgencyUpgradeRequestStatus` est déclaré deux fois, à l'identique
(`types/agency-upgrade.ts` et `lib/queries/super-admin.ts`).

## Objectif utilisateur

L'opérateur de la console lit l'issue de chaque webhook dans sa langue.

## Contrat de données

Aucun changement d'API.

## Delta à produire

- [x] `WebhookTrailTable` : statut traduit par `superAdmin.payments.journal.statuses`, repli brut
  sur un statut inconnu.
- [x] `lib/queries/super-admin.ts` importe et ré-exporte le type de `types/agency-upgrade.ts`.
- [x] Test `WebhookTrailTable.statuts.tck-1270.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Les quatre statuts se lisent « Reçu », « Traité », « Rejeté », « En échec » ; un
  statut inconnu reste brut.
- [x] AC2 — `AgencyUpgradeRequestStatus` n'a qu'une déclaration dans `src`.

## Reste à faire

- Ajouter `blocked` à `STATUS_TONES` d'`AdminUsersTable.tsx`, avec P115.02 : la Piste l'y
  rattache, et le libellé passe par le renommage de la clé `admin.users.status.banned` en
  `blocked` que fait P115.02. P115.02 est de l'angle 115, hors de la part de cette instance.

## Hors périmètre

- Les autres écrans du statut d'utilisateur (P115.02).

## Notes d'implémentation

- Le libellé passe par `t.has()` plutôt qu'une liste recopiée : le dictionnaire est la seule liste.
- Piège : « Reçu » est aussi l'en-tête de colonne ; le test lit les badges, pas le texte de page.
- Ablation : `integrations.tsx` et `super-admin.ts` rendus à `HEAD` → 2 rouges ; correctif remis
  → 2/2 verts, `Integrations.test.tsx` et `integrations.double-facteur.test.tsx` verts.
