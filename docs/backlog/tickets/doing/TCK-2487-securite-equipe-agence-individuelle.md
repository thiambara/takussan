---
id: TCK-2487
title: Agence individuelle — plus de « Sécurité de l'équipe » sur la fiche, et l'API refuse l'interrupteur sans effet
status: doing
phase: P3
family: full
estimate: S
wave: 82
created: 2026-11-06
updated: 2026-11-06
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#2-agency"
tags: [front, back, agence, 2fa, individual]
---

## Objectif utilisateur

L'hôte d'une agence `individual` ne voit plus, sur la fiche de son espace, un réglage « 2FA
obligatoire pour toute l'équipe » qui ne fait rien pour lui : il n'a pas d'équipe.

## Contrat de données

- `PATCH /api/agencies/{id}` (existant) — `AgencyUpdateRequest` ; `settings.require_team_two_factor`
  (bool, défaut `false`, `spec_refs.models`).
- Lecteurs de la clé : `TwoFactorRequirement::requiredAtAgency()`, appelé par `RequireTwoFactor`
  et `TwoFactorController::disable`.

## Direction UX / Artistique

La fiche d'une agence `individual` perd la section « Sécurité de l'équipe », comme elle a déjà perdu
la modération (TCK-686), les mentions légales (TCK-594) et les modules (TCK-2483). Rien ne change
pour une agence `standard`.

## Contraintes strictes (métier)

**Décision de la session : mesurer d'abord ce que fait l'interrupteur pour une `individual`.**

- S'il n'a AUCUN effet : section masquée en `individual`, et l'API refuse la clé (`prohibited`,
  patron de `settings.hidden_modules`) ; test API + test front.
- S'il a un effet sur le compte de l'hôte : la section reste, son libellé ne parle plus d'équipe en
  `individual` (clés i18n dédiées), aucune règle API ne change.

La mesure et la branche retenue s'écrivent dans les notes d'implémentation.

Si la branche « aucun effet » est retenue : `null` reste accepté (`prohibited`), le front n'envoie
jamais la clé pour une `individual` (sinon chaque enregistrement rendrait 422), et seule
`AgencyUpdateRequest` change côté API (aucune autre requête).

## Delta à produire

- [ ] Mesure (lecture du code + test qui la fige) : effet de `require_team_two_factor` pour l'hôte
      et pour tout autre compte d'une agence `individual`.
- [ ] Selon la branche : `AgencyUpdateRequest` (`settings.require_team_two_factor` → `prohibited`
      pour une `individual`) et le formulaire (section masquée, clé jamais envoyée) — OU libellés
      dédiés en `individual`.
- [ ] Tests : `tests/Feature/Api/Agency/AgencyTeamTwoFactorIndividualTest.php` (API) ; test du
      formulaire (front).

## Critères d'acceptation

- [ ] AC1 — La mesure est écrite (notes d'implémentation) et figée par un test : il rougit si
      l'interrupteur se met à changer l'exigence de 2FA de l'hôte d'une agence `individual`.
- [ ] AC2 — (branche « aucun effet ») `PATCH` d'une agence `individual` avec
      `settings.require_team_two_factor: true` ou `false` → 422 sur la clé, rien n'est écrit ;
      `null` → 200. Une agence `standard` l'écrit toujours.
- [ ] AC3 — (branche « aucun effet ») La fiche d'une agence `individual` n'a pas la section
      « Sécurité de l'équipe » et n'envoie jamais la clé, même si `settings` la porte à `true` ;
      celle d'une `standard` la garde.
- [ ] AC4 — Chaque test neuf est prouvé par ablation.
- [ ] AC5 — Suites front et API vertes par la CI.

## Hors périmètre

- Une valeur `true` déjà enregistrée sur une agence `individual` : sans effet tant qu'elle reste
  `individual`, et visible (case cochée) sur la fiche dès son passage en `standard`. Pas de
  migration de données.
- La 2FA de l'hôte lui-même (exigée en tant qu'admin d'agence, TCK-589) : inchangée.
- La mise à jour de `docs/models-spec.md` (« refusée pour une `individual` ») : `/sync-specs` après
  fusion.

## Notes d'implémentation

_(à remplir par implementing-specs)_
