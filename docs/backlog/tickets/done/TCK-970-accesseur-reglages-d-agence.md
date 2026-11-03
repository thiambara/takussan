---
id: TCK-970
title: "`Agency::setting()` lit `agencies.settings` sur la liste unique que lit aussi `AgencyUpdateRequest`"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: [TCK-963]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#2-agency"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#petites-améliorations-26"
tags: [back, agency, settings, pistes]
---

## Objectif utilisateur

Un réglage qu'un admin d'agence écrit par `PATCH /api/agencies/{id}` produit l'effet attendu, quelle
que soit la forme que la règle de validation a laissée passer (`0` comme `false`).

## Contexte

Réf : **P47.08** du fichier de pistes, `validé` (critère V7 accordé), après P47.03 (TCK-963) et
P47.02 (TCK-962).

`agencies.settings` se lisait à cinq endroits, chacun avec sa coercition et son défaut. Le plus
visible : `TenantOnboardingService` ne coupait la checklist d'entrée que sur `=== false`, alors que
la règle `boolean` de TCK-963 accepte `0`. Mesuré avant correctif : `PATCH` avec
`tenant_onboarding_enabled: 0` → 200, puis la checklist se crée quand même.

## Décision du porteur

> après P47.03, un accesseur `Agency::setting()` qui porte le défaut et le type de chaque clé validée par `AgencyUpdateRequest`, sur une liste unique que lisent la règle et l'accesseur ; `tenant_onboarding_enabled` y est un booléen (`false` comme `0` coupent la checklist) ; le docblock « spec alignment » d'`agency.ts` se corrige avec P47.02 (porteur, 2026-10-18, sur la recommandation du délégué)

## Hypothèses (mode sans humain)

- La liste unique vit dans `App\Domain\Settings\AgencySettings`, à côté d'`EditablePlatformSettings`
  (`app/Domain/` est l'espace des catalogues définis en code). Elle porte, par clé, le type, le
  défaut et la règle ; `AgencyUpdateRequest` en tire ses règles `settings.*`.
- Les défauts sont ceux des anciens lecteurs, inchangés : filigrane actif, position par défaut,
  opacité 60, 2FA d'équipe non exigée, pénalité en ligne non, 48 h, checklist active.
- Une valeur absente, `null` ou illisible dans son type rend le défaut. Lire une clé que la liste
  ne déclare pas lève : un réglage lu sans règle d'écriture ne se règle pas.
- Le docblock « spec alignment » d'`agency.ts` n'existe plus sur l'arbre (`grep` vide dans
  `takussan-web/src`) : TCK-962 l'a retiré avec P47.02. Rien à faire côté front.
- `TwoFactorRequirement` lit `require_team_two_factor` par une requête SQL (`settings->… = true`),
  pas par le modèle : il ne passe pas par l'accesseur (voir Hors périmètre).

## Delta à produire

- [x] `App\Domain\Settings\AgencySettings` : `keys()`, `rules()`, `default()`, `read()`.
- [x] `Agency::setting(string $key)` ; `collectsLateFeesOnline()` le lit.
- [x] `AgencyUpdateRequest` : les sept règles `settings.*` viennent de `AgencySettings::rules()`.
- [x] `BookingExpirationService`, `TenantOnboardingService`, `AgencyWatermarkContext` lisent par
  l'accesseur ; `AgencyWatermarkContext::defaults()`, devenu sans appelant, est retiré.
- [x] `AgencySettingsWritableTest` : le balayage des lecteurs reconnaît `->setting('clé'` et
  `AgencySettings::read(…, 'clé'`.
- [x] Test : `AgencySettingAccessorTest`.

## Critères d'acceptation

- [x] AC1 — `PATCH` avec `tenant_onboarding_enabled: 0` → 200, et aucune checklist ne se crée.
- [x] AC2 — `false`, `0` et `"0"` coupent la checklist ; `true`, `1` et l'absence la laissent.
- [x] AC3 — sur une agence sans `settings`, `setting()` rend les défauts des anciens lecteurs.
- [x] AC4 — les clés `settings.*` d'`AgencyUpdateRequest` sont exactement celles d'`AgencySettings`,
  et une clé inconnue (`timezone`) lève.

## Hors périmètre

- `TwoFactorRequirement` filtre `settings->require_team_two_factor = true` en SQL : une agence dont
  la clé vaut `1` (la règle `boolean` l'accepte) n'exige pas la 2FA. Non mesuré par un test, à
  vérifier ; touche l'authentification (V2), donc rapporté, pas corrigé.
- Le champ d'écran des deux réglages de TCK-963 (reste du porteur sur P47.03).

## Notes d'implémentation

- Piège : `filter_var(null, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE)` rend `false`, pas
  `null` : sans le retour anticipé sur une valeur non scalaire, une clé absente vaudrait faux.
  Retiré → 3 rouges (dont « absent » et les défauts).
- Ablation : ancienne lecture `data_get(…) === false` remise dans `TenantOnboardingService` → 3
  rouges (AC1, `0`, `"0"`) ; coercition booléenne retirée de l'accesseur → 5 rouges ; remis → 12
  verts.
