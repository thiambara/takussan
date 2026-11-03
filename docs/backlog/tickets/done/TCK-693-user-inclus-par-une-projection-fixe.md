---
id: TCK-693
title: "Le User chargé par include=user sort par une projection fixe : id, noms, e-mail, téléphone, avatar"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#112-agence--équipe
  models:
    - docs/models-spec.md#1-user
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-21--données-personnelles-dun-user-sorties-par-include
tags: [api, privacy, include, user, pistes]
---

## Objectif utilisateur

Un agent ou un gérant d'agence qui liste les bailleurs, l'équipe, les prestataires ou les
locataires en retard d'accueil ne reçoit du compte inclus que ce que l'écran affiche : l'identité
et le moyen de contact, jamais les identifiants OAuth, les métadonnées ni le second numéro.

Réf : P21.01 (`docs/plans/2026-10-15-pistes-d-amelioration.md`, angle 21).

## Décision du porteur

> projection fixe du User inclus : id, noms, e-mail, téléphone, avatar

Critère accordé : V3 (le choix des données personnelles qui sortent d'un `User` inclus).

## Contrat de données

Aucun changement de schéma ni de route. Quatre réponses changent, pour la seule clé `user` des
lignes quand `include=user` est demandé :

- `GET /api/owners` (via `OwnerProfileResource`) ;
- `GET /api/agencies/{agency}/team` ;
- `GET /api/agencies/{agency}/service-providers` ;
- `GET /api/agencies/{agency}/tenant-onboarding-pending` (paginateur brut, forme conservée).

Clés de `user` : `id`, `first_name`, `last_name`, `full_name`, `email`, `phone`, `avatar_url`.

## Contraintes strictes (métier)

- Aucune autre clé du `User` ne sort par ces quatre réponses, quel que soit `fields[users]`.
- `fields[users]` peut restreindre la projection, jamais l'élargir : une clé dont la colonne n'a pas
  été sélectionnée est omise, pas rendue à `null`.
- Les champs du profil parent (sparse fieldsets `fields[owner_profiles]`…, `two_factor_enabled`
  calculé de l'équipe, les `*_masked` du bailleur) ne changent pas.

## Delta à produire

- [x] Ressource : `App\Http\Resources\IncludedUserResource` (projection, `inParent()`, `preload()`
      des médias pour `avatar_url`).
- [x] `OwnerProfileResource`, `TeamController::index`, `ServiceProviderProfileController::index`,
      `TenantOnboardingPendingController::index` passent le `user` inclus par elle.
- [x] Tests : `tests/Feature/Api/IncludedUserProjectionTest` (5 scénarios).

## Critères d'acceptation

- [x] AC1 — sur chacune des quatre routes, `include=user` sans `fields[users]` rend exactement les
      sept clés de la projection : ni `google_id`, ni `metadata`, ni `secondary_phone`.
- [x] AC2 — `fields[users]=id,first_name,last_name,email` ne rend que ces colonnes et les clés qui
      en dérivent (`full_name`, `avatar_url`).
- [x] AC3 — `two_factor_enabled` reste sur la ligne de l'équipe ; la forme du paginateur de
      `tenant-onboarding-pending` est inchangée.

## Reste à faire

Aucun reste dans la décision du porteur.

## Hors périmètre

- `GET /api/users` (`UserAdminController::index`) : piste P21.02, à part.
- Un `User` inclus par une autre relation (`include=agencyCollaborations…`, `include=visitor`…) :
  P21.03 et P21.05.

## Notes d'implémentation

- Hypothèses (mode sans humain) : « noms » = `first_name`, `last_name` et `full_name` (dérivé, déjà
  dans `UserResource`) ; « avatar » = `avatar_url`, la première URL de la collection `avatar`, comme
  `UserResource`.
- `avatar_url` lit les médias : `preload()` les charge pour la page, sans requête par ligne.
- `LengthAwarePaginator::through()` passe `($valeur, $clé)` : `inParent(...)` en callable de
  première classe y recevait la clé comme second argument, d'où la fermeture.
- Ablation : les cinq fichiers de `app/` remis à l'origine (la ressource neuve laissée, sans
  appelant) → 5 rouges sur 5 (38 clés, `google_id` et `secondary_phone*` présents) ; correctif
  remis → 5 verts (33 assertions).
