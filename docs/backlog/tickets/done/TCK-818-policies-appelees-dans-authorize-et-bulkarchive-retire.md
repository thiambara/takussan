---
id: TCK-818
title: "Quatre FormRequests « Policy handles authorization » et la duplication d'un bien invoquent leur policy dans `authorize()`"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: [TCK-817]
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#22-rôles--permissions"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-22--formrequests-sans-autorisation-propre-et-règles-dautorisation-dans-les-services"
tags: [back, api, autorisation, validation, pistes]
---

## Contexte

Réf : **P22.04** du fichier de pistes, `validé` par le porteur.

`MatchBankStatementLineRequest`, `StoreBankStatementRequest`, `UpdateBankCsvMappingRequest` et
`StoreRoleDelegationRequest` rendent `true` avec un commentaire qui renvoie à la policy du
contrôleur ; `PropertyDuplicateRequest` rend `$this->user() !== null`. La policy n'est jugée
qu'après la validation : un compte sans lien reçoit 422 et les noms des champs.

**Décision du porteur** (recopiée mot pour mot) :

> autorisations déplacées dans `authorize()`, et `bulkArchive` sort de la policy

`bulkArchive` est sorti de `PropertyPolicy` par TCK-817 (P22.02, même cause) : la route entre
désormais par `bulkUpdate`, une capacité réelle. Ce ticket n'y revient pas.

**Hypothèse notée (mode sans humain)** : « déplacées » s'entend comme TCK-305 l'a fait pour 35
méthodes, par **délégation** : `authorize()` invoque l'ability que le contrôleur juge, et la règle
reste dans sa policy. L'appel du contrôleur reste, redondant et inoffensif.

## Objectif utilisateur

Aucun changement pour un appelant autorisé. Un appelant sans droit reçoit 403, quel que soit le
corps envoyé.

## Delta à produire

- `authorize()` des cinq FormRequests : `duplicate` sur le bien, `create` de `BankStatement` sur
  l'agence (import et correspondance CSV), `match` sur la ligne, `create` de `RoleDelegation` sur
  l'agence.
- `AuthorizationPrecedesValidationTest` : un cas par route, avec son versant « autorisé → 422 ».

## Critères d'acceptation

- [x] AC1 — Compte membre d'une autre agence, corps invalide : les cinq routes rendent 403, sans
      `errors`.
- [x] AC2 — Super-admin, même corps : les cinq routes rendent 422 et nomment les champs.

## Hors périmètre

- Renommer `Api/Admin/UpdateIntegrationRequest` (`AdminUpdateIntegrationRequest`), que la `Piste`
  propose et que la décision ne reprend pas : laissé en reste.

## Notes d'implémentation

- **Reproduction** : avant correctif, les cinq cas « intrus » rendaient 422 (`title_suffix`, `file`,
  `has_header`, `payment_type`, `user_id`) ; les cinq versants « super-admin → 422 » étaient déjà
  verts.
- **Ablation** : les cinq `authorize()` remis à l'ancien → 5 rouges (« Expected response status code
  [403] but received 422 »), 35 verts ; correctif remis → 40 verts.
- Tests existants des cinq routes (duplication, relevés, correspondance CSV, rapprochement,
  délégations) : 141 verts.
