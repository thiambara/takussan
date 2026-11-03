---
id: TCK-2002
title: "Le `roles` de /api/auth/me ne compte que les profils actifs de l'agence du profil actif"
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
    - "docs/features.md#22-rôles--permissions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-176--rôles-lus-toutes-agences-confondues-par-profiletypes"
  adr:
    - "docs/adr/0005-contrat-http-conserve-roles.md"
tags: [api, profils, auth, pistes]
---

## Objectif utilisateur

Un agent de l'agence A, admin de l'agence B, qui travaille dans A, et un admin suspendu ne voient
plus s'ouvrir la section d'agence que l'API leur refuse ensuite : `roles` ne nomme que ce qu'ils
tiennent, actif, dans l'agence où ils travaillent.

## Contexte

Réfs : **P176.02** et **P176.03** du fichier de pistes (même correctif, un seul ticket).

Décision du porteur (P176.02) : validé — validation du porteur (2026-10-23) : ADR-0005, amendement du 2026-10-23 : `roles` = types des profils actifs dans l'agence du profil actif, plus les types globaux (`service_provider` actif, `tenant`), `customer` et `super_admin`

Décision du porteur (P176.03) : validé — validation du porteur (2026-10-23) : ADR-0005, amendement du 2026-10-23 : une variante « actifs seulement » de `profileTypes()` lue par `UserResource` et le ciblage ; les vues super-admin gardent les profils suspendus

Mesuré avant correctif sur `5fcadf598` (`AuthMeRolesAgenceActiveTest`, 7 rouges sur 8) : agent de
A, admin et bailleur de B, `X-Profile-Id: agent:<A>` → `roles` contenait `agency_admin` et `owner` ;
seul profil `AgencyAdminProfile` `suspended` → `["agency_admin","customer"]`.

## Hypothèses (mode sans humain)

- « L'agence du profil actif » est celle que rend `agency_id` dans la même réponse
  (`User::getAgencyIdAttribute()`) : le profil résolu par le middleware, sinon l'auto-bascule d'un
  compte dont les profils actifs sont tous dans une agence. Les réponses de connexion
  (`UserResource::pourSoi`) en héritent : un compte d'une seule agence y garde son type d'agence,
  un compte de plusieurs agences n'en a aucun (ADR-0005, point 1).
- « Actif » suit `ActiveProfileResolver::isActiveProfile()` (statut `active`) : un bailleur
  `blocked`, un profil `draft`, `inactive`, `suspended` ou `archived` ne donne pas de rôle.

## Delta à produire

- [x] `HasProfiles::activeProfileTypesAt(?int $agencyId)` : la variante « actifs seulement »,
  bornée à une agence (nulle = types globaux seulement).
- [x] `UserResource` : `roles` = `activeProfileTypesAt($this->agency_id)`.
- [x] Garde : `tests/Feature/Auth/AuthMeRolesAgenceActiveTest.php`.

## Critères d'acceptation

- [x] AC1 — agent de A, admin de B, profil actif dans A : `roles = ["agent","customer"]`.
- [x] AC2 — admin suspendu, agent inactif, admin archivé, prestataire suspendu : aucun de ces types.
- [x] AC3 — compte de deux agences sans profil résolu, prestataire actif et locataire d'un bail en
  cours : `["service_provider","customer","tenant"]`, sans type d'agence.
- [x] AC4 — compte d'une seule agence sans en-tête : son type reste (auto-bascule).

## Hors périmètre

- Les listes de membres (P176.04, TCK-2004) et le ciblage des annonces et drapeaux (P176.05,
  TCK-2006).
- `UserDetailResource` et `Admin\AgencyDetailController::team` gardent `profileTypes()` (ADR-0005,
  point 3).
- Le front n'est pas touché : ses gardes lisent `roles`, qui devient juste.

## Notes d'implémentation

- Ablation : `UserResource` remis sur `profileTypes()` → 7 rouges sur 8 (seul le compte d'une
  agence, sans en-tête, reste vert) ; rétabli → 8 verts.
- `listMembers` rend encore `UserResource` à ce stade : chaque membre y est jugé dans son agence
  auto-basculée, jusqu'à TCK-2004 qui rapporte `roles` à l'agence de la route.
