---
id: TCK-897
title: "Tests unitaires de la policy du registre des demandes de droits"
status: done
phase: P2
family: back
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
    - "docs/features.md#22-rôles--permissions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-12--tests--zones-non-gardées-tests-verts-sans-leur-code"
tags: [back, tests, rgpd, autorisation, pistes]
---

## Contexte

Réf : **P12.07** du fichier de pistes, `retenu · autonome` (A5). `PrivacyRequestPolicy` (TCK-601,
ADR-0044 §4) refuse tout le monde, le super-admin passant par `Gate::before`. Aucun test ne
l'exécute : le 403 de `PrivacyRequestRegistryTest` vient du middleware `super-admin`, avant la
policy. Re-mesuré le 2026-10-18 : les quatre `return false` passés à `true`,
`PrivacyRequestRegistryTest` reste vert (7 tests).

## Objectif utilisateur

Une policy du registre qui ouvrirait le registre à un admin d'agence rougit un test, même le jour
où la route sort du préfixe `/api/admin/*`.

## Contrat de données

Aucun changement : le test décrit le contrat existant.

## Contraintes strictes

- Aucun code de production modifié ; l'autorisation reste celle d'aujourd'hui.

## Delta à produire

- [x] `tests/Unit/Policies/PrivacyRequestPolicyTest.php`

## Critères d'acceptation

- [x] AC1 — Pour chacune des quatre abilities (`viewAny`, `create`, `update`, `export`), la
  policy refuse un admin d'agence, un agent et un propriétaire, appelée en direct et par la Gate.
- [x] AC2 — Par la Gate, le super-admin est accordé sur les quatre (`Gate::before`).

## Hors périmètre

- Le middleware `super-admin` et les routes du registre, déjà éprouvés par
  `PrivacyRequestRegistryTest`.

## Notes d'implémentation

- Test seul, vert dès l'écriture (7/7) : la reproduction est la mutation de la policy, sous
  laquelle `PrivacyRequestRegistryTest` restait vert (7/7).
- Ablation, méthode par méthode : chaque `return false` passé à `true` à son tour → 6 rouges sur 7
  (les trois rôles, en direct et par la Gate) ; remis → 7 verts.
- La policy n'est liée nulle part à la main : la Gate la trouve par la découverte automatique
  (`App\Models\PrivacyRequest` → `App\Policies\PrivacyRequestPolicy`). Les cas « par la Gate »
  gardent aussi ce lien.
