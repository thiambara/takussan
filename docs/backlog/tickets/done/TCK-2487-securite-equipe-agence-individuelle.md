---
id: TCK-2487
title: Agence individuelle — plus de « Sécurité de l'équipe » sur la fiche, et l'API refuse l'interrupteur sans effet
status: done
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

- [x] Mesure (lecture du code + test qui la fige) : effet de `require_team_two_factor` pour l'hôte
      et pour tout autre compte d'une agence `individual`.
- [x] Selon la branche : `AgencyUpdateRequest` (`settings.require_team_two_factor` → `prohibited`
      pour une `individual`) et le formulaire (section masquée, clé jamais envoyée) — OU libellés
      dédiés en `individual`.
- [x] Tests : `tests/Feature/Api/Agency/AgencyTeamTwoFactorIndividualTest.php` (API) ; test du
      formulaire (front).

## Critères d'acceptation

- [x] AC1 — La mesure est écrite (notes d'implémentation) et figée par un test : il rougit si
      l'interrupteur se met à changer l'exigence de 2FA de l'hôte d'une agence `individual`.
- [x] AC2 — (branche « aucun effet ») `PATCH` d'une agence `individual` avec
      `settings.require_team_two_factor: true` ou `false` → 422 sur la clé, rien n'est écrit ;
      `null` → 200. Une agence `standard` l'écrit toujours.
- [x] AC3 — (branche « aucun effet ») La fiche d'une agence `individual` n'a pas la section
      « Sécurité de l'équipe » et n'envoie jamais la clé, même si `settings` la porte à `true` ;
      celle d'une `standard` la garde.
- [x] AC4 — Chaque test neuf est prouvé par ablation.
- [ ] AC5 — Suites front et API vertes par la CI.

## Hors périmètre

- Une valeur `true` déjà enregistrée sur une agence `individual` : sans effet tant qu'elle reste
  `individual`, et visible (case cochée) sur la fiche dès son passage en `standard`. Pas de
  migration de données.
- La 2FA de l'hôte lui-même (exigée en tant qu'admin d'agence, TCK-589) : inchangée.
- La mise à jour de `docs/models-spec.md` (« refusée pour une `individual` ») : `/sync-specs` après
  fusion.

## Notes d'implémentation

Commits `a9327a64c` (API) et `67f4f632c` (front), 2026-11-06.

**La mesure (lecture du code, 2026-11-06) — branche retenue : « aucun effet ».**

- Seul lecteur de la clé : `TwoFactorRequirement::requiredAtAgency()`, appelé par `RequireTwoFactor` et, via
  `isMandatory()`, par `TwoFactorController::disable`. `ProtectedActions` ne la nomme qu'en commentaire.
- `requiredAtAgency()` rend `true` pour tout compte qui porte un `AgencyAdminProfile` AVANT de lire l'interrupteur.
  L'hôte d'une `individual` en porte toujours un (`HostIndividualOnboardingService::createAgencyAdminProfile()`) :
  sa 2FA est exigée sur les familles protégées, case cochée ou non.
- Le personnel que vise l'interrupteur (`isStaffAt` : agent actif, délégation `agent`/`agency_admin` en vigueur)
  n'existe pas dans une `individual` : invitations d'agents et de bailleurs refusées (`AgencyKindGuard::ensureCanFormTeam`),
  rattachement direct retiré (TCK-2365), désignation d'un bailleur tiers refusée (`TitulaireALaSaisie`), et une
  délégation exige un délégataire agent ou bailleur de l'agence autre que soi (`RoleDelegationService::create`).
- Figée par `test_mesure_l_interrupteur_ne_change_rien_pour_l_hote_d_une_agence_individuelle` : hôte sans 2FA,
  `requiredAtAgency` et `isMandatory` vrais avec et sans l'interrupteur, et `canFormTeam` faux.

**Implémentation.** `AgencyUpdateRequest` : `settings.require_team_two_factor` → `['prohibited']` pour une
`individual` (remplace la règle du catalogue, comme `hidden_modules`) — `true` et `false` rendent 422 sur la clé,
`null` passe et retire une valeur ancienne (la fusion du contrôleur écarte les `null`). Pour une `standard`, la
règle reste celle du catalogue (`null` y est toujours refusé, inchangé). Front : la section est masquée en
`individual`, et `normaliseAgencyForm` n'émet jamais la clé pour une `individual` (s'ajoute à TCK-2486).

**Coordination.** `AgencyUpdateRequest` était le seul fichier partagé avec `suites-api` (TCK-2488) : une ligne
ajoutée par Edit ciblé, message préalable à l'agent, commit par chemin ; son commit `be3de102c` ne touche pas ce fichier.

**Ablations** (`abl-2487.sh`, 2026-11-06, toutes restaurées, témoins verts) : B1 la clé part pour une `individual`
→ 1 rouge (unitaire) ; B2 la section reste → 1 rouge (composant) ; B3 la règle `prohibited` retirée → 3 rouges API ;
B4 `requiredAtAgency` ne court-circuite plus l'admin d'agence → le test de mesure rougit.

**Tests joués** : `AgencyTeamTwoFactorIndividualTest` (6) ; les 22 classes que `tests/impact-map.json` associe à
`AgencyUpdateRequest.php`, plus `TwoFactorDisableTest` et `AgencyModulesSettingsTest` : **283 verts** (120 s,
arbre partagé avec le travail en cours de TCK-2488). Front : `admin-schemas` + `admin-agency/__tests__` 87/87.

**Suite** : `docs/models-spec.md` (ligne de `require_team_two_factor`) dira « refusée (`prohibited`) pour une
agence `individual` » — `/sync-specs` après fusion. Une valeur `true` déjà enregistrée sur une `individual` reste
sans effet, et redevient visible (case cochée) au passage en `standard`.
