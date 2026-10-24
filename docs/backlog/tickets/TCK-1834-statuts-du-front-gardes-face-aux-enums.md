---
id: TCK-1834
title: "Une garde confronte les unions de statut du front aux enums de l'API, et les tables de tons sont typées par l'union"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-146--unions-de-statut-et-options-de-filtre-du-front-face-aux-enums-de-lapi"
tags: [front, garde, statuts, pistes]
---

## Contexte

Réf : **P146.04** du fichier de pistes, `validé (délégué)`. P146.01 à P146.03, et P115.02 avant
elles, avaient la même cause : chaque écran recopie la liste des statuts, et rien ne la compare à
l'enum de l'API. Onze tables de tons ou de libellés sont typées `Record<string, …>` : un cas
oublié n'y produit ni erreur de type ni test rouge.

## Décision du porteur (déléguée)

> validé (délégué) — après la fusion des correctifs de P146.01, P146.02, P146.03 et P146.05, une garde de dépôt `scripts/check-*.mjs` qui lit les cas des enums `*Status` de l'API et les compare aux unions de `src/types` par une table de correspondance, en échec sur un cas absent ou en trop ; les onze tables de tons de la `Mesure` (dont `admin/super/integrations.tsx:46`) passent à `Record<UnionDuFront, …>` ; un écart voulu ne se déclare dans la garde qu'avec la décision écrite qui le fonde (piste, ticket ou spec) ; un écart sans décision écrite n'est pas figé : l'entrée revient au porteur

## Objectif utilisateur

Un statut que l'API ajoute ou que le front oublie se voit avant la fusion, et pas à l'écran sous
sa forme brute.

## Contrat de données

Aucun changement d'API.

## Delta à produire

- [x] `scripts/check-status-unions.mjs` : chaque enum `*Status` de `app/Models/Enums` est mis en
  correspondance avec ses unions du front (`CORRESPONDANCES`) ou déclaré sans union nommée
  (`SANS_UNION`) ; échec sur un cas absent ou en trop, sur un enum non classé, sur un écart déclaré
  sans décision écrite (`ECARTS`) ou résorbé. Cas d'épreuve joués à chaque invocation.
- [x] Les onze tables passent à `Record<Union, …>` : `booking-status.ts`, `BookingDetail.tsx`,
  `customer-form/options.ts`, `ModerationQueueList.tsx`, `user-detail.tsx`, `agency-detail.tsx`
  (deux tables), `AgencyModerationCard.tsx` (deux tables), `AdminUsersTable.tsx`,
  `PropertyStatusBadge.tsx`, `super-admin/users/page.tsx`, `integrations.tsx`.
- [x] `lib/table-de-statut.ts` (`lireTable`, `estCleDe`) : lit une table typée avec une valeur
  servie en `string`, en ne retenant que ses clés propres.
- [x] Types nommés `PropertyStatusFilterValue` et `IntegrationStatus`.
- [x] Tests `table-de-statut.tck-1834.test.ts` et `AdminUsersTable.statuts.tck-1834.test.tsx`.

## Critères d'acceptation

- [x] AC1 — `node scripts/check-status-unions.mjs` est vert sur l'arbre, rouge sur les unions
  d'avant P146.01 et P146.03.
- [x] AC2 — Retirer un cas d'une des tables fait échouer `tsc`.
- [x] AC3 — Aucun écran ne change : ton neutre et libellé brut restent le repli d'un statut que la
  table ou le dictionnaire ne connaît pas.

## Reste à faire

- Brancher `scripts/check-status-unions.mjs` dans `.github/workflows/repo-ci.yml` (et ses
  déclencheurs `takussan-api/app/Models/Enums/**`, `takussan-web/src/**`) : chemin fermé à
  l'implémenteur. D'ici là, la garde tourne avant chaque publication d'un agent des pistes et dans
  le rituel `for g in scripts/check-*.mjs`.

## Hors périmètre

- Les enums sans union nommée au front (`SANS_UNION`) : leur donner une union est un autre travail.
- Les statuts qui ne sont pas des enums de l'API (santé d'intégration, journal des webhooks).
- Le libellé de `deleted` dans la console d'équipe : le dictionnaire ne le nomme pas, il reste brut.

## Notes d'implémentation

- Aucune union mise en correspondance ne diverge de son enum au 2026-10-23 : `ECARTS` est vide.
  Aucun écart n'a donc eu à être figé ni à revenir au porteur.
- Trois tables d'utilisateur reçoivent `deleted: 'neutral'`, qui est leur repli d'avant.
  `AdminUsersTable` décidait du libellé par la présence de la clé dans la table : il passe par
  `t.has`, sinon `deleted` aurait rendu `MISSING_MESSAGE`.
- `user-detail.tsx` lit aussi le statut d'un **profil** dans la table des comptes : comportement
  conservé (repli neutre pour `suspended`, `draft`), relevé pour plus tard.
- Reproduction : la garde rejouée sur `types/booking.ts` et `lib/enums/property.ts` d'avant
  TCK-1266 et TCK-1268 → 4 erreurs (`late`, `partially_paid`, `failed` absents ; onze cas absents).
- Ablations : `published` retiré de `PROPERTY_STATUS_TONE` et `deleted` de la table de
  `user-detail` → 2 erreurs `TS2741` ; porte du libellé d'`AdminUsersTable` rendue à la présence
  dans la table → `MISSING_MESSAGE` et test rouge. Correctifs remis → tout vert.
