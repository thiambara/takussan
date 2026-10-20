---
id: TCK-1048
title: "`/api/me/owner-profiles/{id}/properties` rend ses lignes par `PropertyResource`"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  models:
    - "docs/models-spec.md#3-property"
    - "docs/models-spec.md#34-ownerprofile-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-61--modèles-rendus-bruts-par-un-contrôleur-au-delà-de-user"
tags: [api, ressource, rgpd, bailleur, pistes]
---

## Contexte

Réf : **P61.03** du fichier de pistes, `validé` par le porteur (V3). `OwnerProfileController::properties`
rendait `$paginator->items()` de `Property::buildQuery()` : sans `fields[properties]`, spatie fait
un `select *` et seul `$hidden` filtrait, si bien que le bailleur recevait `platform_hold_at`,
`platform_hold_by_id` (le super-admin qui a masqué le bien), `admin_monitored`, `is_test`,
`metadata` et `deleted_at`. Re-mesuré le 2026-10-20 sur `pre-dev` 96392a9cb par le test ci-dessous,
rouge avant correctif sur `platform_hold_at`.

## Décision du porteur

> validé — rendre la liste par `PropertyResource` ; test sans `fields` : ni `platform_hold_by_id` ni `admin_monitored` (porteur, 2026-10-20)

## Objectif

La liste des biens d'un profil bailleur ne rend que ce que `PropertyResource` émet.

## Delta à produire

- [x] `OwnerProfileController::properties` : `PropertyResource::collection()` par
      `$this->paginated()`, médias préchargés (`main_photo_url`).
- [x] Test dans `tests/Feature/Onboarding/OwnerOnboardingTest.php`.

## Critères d'acceptation

- [x] AC1 — Sans `fields`, une ligne ne porte ni `platform_hold_at`, ni `platform_hold_by_id`, ni
      `platform_hold_reason`, ni `admin_monitored`, ni `is_test`, ni `metadata`, ni `deleted_at`.
- [x] AC2 — L'appel du front (`fields[properties]=id,title,price,status,type`) et le compte de
      `meta.total` restent inchangés (test existant `…properties` vert).

## Hypothèses (mode sans humain)

- `price` sort en nombre par la ressource (chaîne `decimal:2` avant) : le type du front
  l'admet (`OwnerPropertyEntry.price: number | string | null`).

## Hors périmètre

- Le reste de l'angle 61 hors du lot (P61.04).

## Notes d'implémentation

- La ressource rend aussi l'agence d'un `include=agency` par sa projection publique
  (`buildAgency`) : c'est ce qui ferme le versant bailleur de P61.02 (TCK-1049).
- Ablation : `$paginator->items()` remis → rouge sur `platform_hold_at` ; remis → 9 verts.
