---
id: TCK-1372
title: "Le front n'envoie plus `landlord_id`, `provider` en édition, ni la ville de la création automatique"
status: done
phase: P3
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-966]
blocks: []
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#petites-améliorations--clés-envoyées-pour-rien"
tags: [front, nettoyage, pistes]
---

## Objectif utilisateur

Aucun changement visible : trois clés que l'API ne lit pas cessent de partir, et ne trompent plus
celui qui lit le corps d'une requête.

## Contexte

Réf : **P114.05** du fichier de pistes, `validé (délégué)` (critère V7 cité par le classement,
accordé).

Re-mesuré sur `45fd976b2`, rouge par les tests ci-dessous :

- `POST /api/leases` : `createLeaseSchema` déclare et rend `landlord_id` (posé à `user.id` par un
  effet et un champ caché), que `StoreLeaseRequest` ne lit pas.
- `PATCH /api/integrations/{id}` : `normaliseIntegrationForm(…, 'edit')` porte `provider`, que
  `UpdateIntegrationRequest` ne lit pas.
- `POST /api/host/individual/auto-onboard` : `/publish` passe la ville des préférences, que
  l'action envoie en `primary_city` ; le contrôleur ne lit pas le corps (TCK-966).

## Décision du porteur (déléguée)

> retirer du corps les clés que l'API ne lit pas : `landlord_id` de la création de bail (`CreateLeaseForm.tsx`), `provider` de l'édition d'intégration (`setting.ts`) et le `primary_city` de la création automatique (`auto-onboard.ts`), sans changer les règles de l'API ; garder à l'écran, obligatoires, `agency.primary_city` et `preferences.primary_property_type` de l'assistant hôte, comme le porteur l'a décidé pour TCK-966 (2026-10-18)

## Hypothèses (mode sans humain)

- La clé de message `lease.landlordRequired` n'a plus de lecteur ; elle reste dans les trois
  langues (wolof en pause : pas de retrait de texte `wo` hors décision).
- `autoOnboardAction()` perd son paramètre ; `/publish` ne lit plus `useAuth()`, qui ne servait
  qu'à la ville.

## Delta à produire

- [x] `createLeaseSchema`, `CreateLeasePayload`, `CreateLeaseForm` : `landlord_id` retiré (valeur
  par défaut, effet, champ caché).
- [x] `normaliseIntegrationForm` : `provider` retiré en édition, gardé en création.
- [x] `autoOnboardAction()` : corps vide ; `/publish` l'appelle sans argument.
- [x] Tests : `cles-sans-lecteur.tck-1372.test.ts` (bail, intégration en édition et en création) ;
  `page.auto-space.test.tsx` attend un appel sans argument.

## Critères d'acceptation

- [x] AC1 — le schéma de création de bail ne rend pas `landlord_id`.
- [x] AC2 — la charge d'édition d'une intégration ne porte pas `provider` ; celle de création, si.
- [x] AC3 — `/publish` appelle la création automatique sans ville.
- [x] AC4 — l'assistant hôte garde `agency.primary_city` et `preferences.primary_property_type` :
  non touchés.

## Hors périmètre

- Les règles de l'API, inchangées.

## Notes d'implémentation

- Ablation : les six fichiers sources remis à `45fd976b2` → 3 rouges (AC1, AC2, AC3) ; remis →
  verts, ainsi que `CreateLeaseForm*.test.tsx`, `schemas.test.ts` et `admin-schemas.test.ts`.
- Un test de l'action seule (corps vide sans argument) a été écrit puis retiré : il restait vert
  sans le correctif, l'ancien code n'envoyant déjà rien sans argument. La garde est l'appel de
  `/publish`.
