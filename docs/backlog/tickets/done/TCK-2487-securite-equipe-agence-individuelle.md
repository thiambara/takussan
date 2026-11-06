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

## Revue adverse (2026-11-06)

**Un `1` accepté n'exigeait pas la 2FA de l'équipe** (relevé par l'agent de la fiche, TCK-2486 M2).
`AgencyUpdateRequest` valide `settings.require_team_two_factor` en `boolean` (accepte `1`, `"1"`,
`0`, `"0"`) et `AgencyController::update` stockait la valeur validée telle quelle ;
`TwoFactorRequirement::requiredAtAgency()` lit `settings->require_team_two_factor` en JSON STRICT
(`= true`). Un client autre que la fiche qui envoyait `1` voyait le réglage accepté, lu activé par
`AgencySettings::read()`, et la 2FA de l'équipe NON exigée — défaut de sécurité silencieux.

**Correctif (décision de la session)** : à l'écriture, toute clé de type `bool` au catalogue
`AgencySettings` part en vrai booléen JSON — `AgencySettings::normalize()`, appelée par
`AgencyController::update` sur les `settings` validés, avant la fusion. Sur le catalogue, pas clé par
clé : `watermark_enabled`, `require_team_two_factor`, `late_fee_online_collection`,
`tenant_onboarding_enabled`. `null` (retrait de la clé) passe tel quel. Le lecteur SQL est inchangé.
Les valeurs déjà stockées sont normalisées par une migration de données (ci-dessous).

**Test** `tests/Feature/Api/Agency/AgencySettingsBooleensStockesTest.php` : `PATCH` avec `1` → la
colonne porte `true` et `TwoFactorRequirement` exige la 2FA d'un agent de l'agence ; `"0"` → `false`,
plus exigée ; chaque clé `bool` du catalogue (jeu dérivé des défauts booléens) envoyée à `1`, `"1"`,
`true`, `0`, `"0"`, `false` → `true`/`false` JSON dans la colonne brute. Rouge avant : 5 échecs
(« Failed asserting that 1 is identical to true »).

**Ablations** (`abl-2488-corr2.sh`) : témoin 19/19 · normalisation non appelée par le contrôleur →
5 rouges · normalisation neutralisée (valeur rendue telle quelle) → 5 rouges · restauré 19/19.

**Tests joués** (2026-11-06, 8 cœurs, load 2,2-2,3) : 73 classes qui écrivent l'agence, les
réglages ou la 2FA (`/api/agencies/…`, `/api/admin/settings`, `TwoFactorRequirement`, clés
booléennes) — 632 tests verts, 574 s. Pint propre, gardes du dépôt vertes.

Commit : 2baa3fabf.

**Suite (décision de la session) — l'existant normalisé.** Migration de données
`2026_11_06_100000_normalize_boolean_agency_settings` : pour chaque agence, par lots de 500
(`chunkById`), la décision clé par clé est celle d'`AgencySettings::normalize()` — la fonction de
l'écriture, aucune logique recopiée — et SEULES les clés qu'elle change sont réécrites, par
`jsonb_set` : les autres clés de `settings` ne sont ni relues ni réencodées (un réencodage PHP ferait
d'un objet vide `{}` un tableau `[]` — ablation C4). Idempotente. `down()` délibérément sans effet
(rien ne dit plus quelle clé était `1` ou `"1"`, et `read()` lit les deux comme le booléen) ; il ne
lève pas, le job `migrations-pgsql` rejoue les `down()` au-dessus de la borne TCK-278.

Écart : `normalize()` suit désormais EXACTEMENT `read()` — `FILTER_NULL_ON_FAILURE`, et une valeur non
reconnue (`"oui"`, un tableau) reste telle quelle. La première version convertissait toute valeur non
nulle : sans effet à l'écriture (la règle `boolean` ne laisse passer que des valeurs reconnues), mais
sur l'existant elle aurait changé ce que lit `read()` (`"oui"` sur `tenant_onboarding_enabled`, lu
comme le défaut `true`, devenait `false` — ablation C2).

Test `tests/Feature/Database/NormalizeBooleanAgencySettingsMigrationTest.php` : avant `"1"`, `1`,
`"0"`, `"oui"`, plus des clés hors normalisation (`primary_city`, `hidden_modules`, un objet vide,
une clé `int` en chaîne) ; après `true`/`true`/`false`, `"oui"` intact, autres clés intactes
(l'objet vide reste un objet, `jsonb_typeof`) ; `read()` rend la même valeur clé par clé avant et
après ; la 2FA d'un agent n'est pas exigée avant, l'est après ; une agence sans `settings` et une
déjà propre inchangées ; seconde passe sans effet ; `down()` sans effet. Rouge avant : la migration
n'existait pas.

Ablations (`abl-2488-corr3.sh`) : témoin 14/14 · C2 `normalize()` sans `FILTER_NULL_ON_FAILURE` →
1 rouge · C3 `up()` vide → 1 rouge · C4 réécriture de tout `settings` par `json_encode` → 1 rouge ·
restauré 14/14. Lot ciblé (2026-11-06, 8 cœurs, load 2,1-2,2) : `tests/Feature/Database/*` et toute
classe qui cite `AgencySettings`, `PlatformSettingService`, `/api/admin/settings`,
`require_team_two_factor`, `TwoFactorRequirement` ou une migration — 63 classes, 479 tests verts, 217 s.

Commit : b2e6d6536.

