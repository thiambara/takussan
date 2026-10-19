---
id: TCK-966
title: "Les clés d'assistant sans lecteur ne s'écrivent plus dans agencies.settings"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#clés-écrites-dans-agenciessettings-à-la-création-dun-espace-que-rien-ne-lit"
tags: [back, onboarding, agency, pistes]
---

## Contexte

Réf : **P47.07** du fichier de pistes, `validé` (critère accordé : V7).

`HostIndividualOnboardingService::createAgency` écrivait dans `agencies.settings`
`primary_city`, `primary_property_type`, `onboarding_source` et `payment.preferred_provider`, à
l'assistant comme à la création automatique d'un espace. Rien ne les lit, côté API comme côté
front ; `AgencyResource` rendait `settings` brut, donc ces clés sortaient à chaque lecture.

## Décision du porteur

> ne plus écrire `primary_city`, `primary_property_type`, `onboarding_source` ni `payment.preferred_provider` dans `agencies.settings`, et ne plus les rendre dans `AgencyResource` ; l'assistant peut garder ses champs sans les enregistrer (porteur, 2026-10-18)

## Reste à faire

> la purge des valeurs déjà enregistrées

## Objectif

Une agence créée par l'assistant ou automatiquement naît sans ces quatre clés, et aucune agence ne
les rend par `AgencyResource`.

## Hypothèses (mode sans humain)

- Les champs de requête (`agency.primary_city`, `preferences.primary_property_type`,
  `payment_setting.preferred_provider`, `primary_city` de la création automatique) restent acceptés
  et validés : le front les envoie encore.
- La ville par défaut de la création automatique (`Dakar`) n'avait pas d'autre usage que cette clé :
  elle disparaît avec elle, et `autoOnboard` ne prend plus la ville.
- Un `payment` que le retrait de `preferred_provider` laisse vide ne sort pas en `[]`.

## Delta à produire

- [x] `HostIndividualOnboardingService` : l'agence se crée sans `settings` ; `autoOnboard` sans ville.
- [x] `HostAutoOnboardController` : ne passe plus la ville.
- [x] `AgencyResource` : `settings` sans les quatre clés.
- [x] Tests : `AgencyResourceOnboardingKeysTest` (neuf), `HostAutoOnboardTest` et
  `HostIndividualOnboardingTest` attendent l'absence des clés.

## Critères d'acceptation

- [x] AC1 — l'assistant crée l'agence sans aucune des quatre clés, opérateur de paiement fourni ou non.
- [x] AC2 — la création automatique crée l'agence sans ville, type ni source.
- [x] AC3 — une agence qui porte encore ces clés ne les rend pas par `AgencyResource` ; ses autres
  réglages sortent tels quels, et `settings` nul reste nul.

## Hors périmètre

- La purge des valeurs déjà enregistrées (reste du porteur, V4).
- Les champs de l'assistant côté front.

## Notes d'implémentation

- Avant correctif : 6 rouges (les clés écrites, et rendues par la ressource).
- Ablation : `app/` retiré → les 6 mêmes rouges ; remis → 23 verts. `tests/Feature/Onboarding`,
  `AgencyKindTest`, `SelectActiveProfileTest` et `OnboardingFixedCodeRemovedTest` verts (69).
- Piège : `Arr::except($s, 'payment.preferred_provider')` laisse `payment => []` ; la ressource le retire.
