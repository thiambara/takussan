---
id: TCK-1852
title: "La console des comptes sert le filtre « Locataire » et ne propose plus « Client », qui valait « Tous »"
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
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-186--paramètres-du-front-lus-par-une-liste-écrite-à-la-main"
tags: [api, front, super-admin, baux, pistes]
---

## Contexte

Réf : **P186.01** du fichier de pistes, `validé (délégué)` (V7 accordé). Le sélecteur de rôle de
`/super-admin/users` propose `customer` et `tenant`, envoyés en `filter[role]`.
`Admin\UserDetailController::index` ne connaît que les cinq profils : toute autre valeur tombe sur
`whereRaw('1 = 0')`, et l'opérateur voit « aucun compte ». Les deux rôles sont pourtant dérivés par
`HasProfiles::profileTypes()` (TCK-492) : `customer` pour toute identité, `tenant` pour qui occupe
un bail en cours.

## Décision du porteur (déléguée)

> servir `filter[role]=tenant` dans `UserDetailController::index` par la règle de `hasActiveTenantLease()` (un `whereHas('tenantLeases')` sur `HasProfiles::ACTIVE_TENANT_LEASE_STATUSES`), et retirer l'option `customer` du sélecteur de `/super-admin/users` (par TCK-492 chaque compte est client, le filtre vaudrait « Tous ») ; une autre valeur inconnue rend toujours une liste vide ; test : un compte locataire d'un bail en cours, un compte au bail terminé et un compte sans bail, `filter[role]=tenant` → le seul locataire en cours

## Objectif utilisateur

L'opérateur qui filtre sur « Locataire » voit les comptes qui occupent un bail en cours ; l'option
« Client », qui ne triait rien, n'est plus proposée.

## Contrat de données

Aucun changement de forme. `GET /api/admin/users?filter[role]=tenant` rend les comptes dont un
bail (par leur fiche client) est d'un statut de `Lease::ONGOING_STATUSES` (`active`,
`terminating`). Toute valeur inconnue, `customer` compris, rend toujours une liste vide.

## Contraintes strictes (métier)

- `leases.status` qualifié, comme dans `hasActiveTenantLease()` : `customers` porte aussi un
  `status` (piège n° 7).
- La clé i18n `roles.customer` reste : la colonne des rôles l'affiche (`page.tsx`, `tPage.has`).

## Delta à produire

- [x] `UserDetailController::index` : branche `tenant` du `match`.
- [x] `super-admin/users/page.tsx` : option `customer` retirée de `ROLE_OPTIONS`.
- [x] Tests : `UserDetailTest::test_le_filtre_locataire_ne_rend_que_les_baux_en_cours` ;
  `page.test.tsx` : le sélecteur ne propose pas « Client », et `?role=customer` retombe sur « tous ».

## Critères d'acceptation

- [x] AC1 — Un compte au bail `active`, un au bail `terminating`, un au bail `terminated` et un
  sans bail : `filter[role]=tenant` → les deux premiers seuls.
- [x] AC2 — `filter[role]=customer` et `filter[role]=nawak` → liste vide.
- [x] AC3 — Le sélecteur de rôle ne propose pas `customer` ; `?role=customer` n'envoie pas de
  `filter[role]`.

## Hors périmètre

- Garde générique « chaque option du sélecteur rend au moins une ligne » (suggérée par la `Piste`).

## Notes d'implémentation

- Reproduction : `UserDetailTest::test_le_filtre_locataire_ne_rend_que_les_baux_en_cours` rouge
  avant correctif (`filter[role]=tenant` → `[]` au lieu des comptes aux baux `active` et
  `terminating`) ; `page.test.tsx`, cas `?role=customer` rouge (`filter[role]=customer` envoyé).
- Ablation : branche `tenant` renommée → 1 rouge API ; option `customer` remise (`git apply -R`)
  → 1 rouge front ; remis → 9/9 API, 27/27 front.
- Le préavis (`terminating`) compte comme bail en cours, comme dans `hasActiveTenantLease()`.
