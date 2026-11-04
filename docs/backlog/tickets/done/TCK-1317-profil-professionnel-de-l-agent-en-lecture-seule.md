---
id: TCK-1317
title: "Profil professionnel de l'agent : agence, licence et spécialité en lecture seule, plus de champs perdus"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  models:
    - "docs/models-spec.md#35-agentprofile-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-117--clés-de-metadata-des-profils-écrites-par-les-assistants"
tags: [api, web, agent, profil, pistes]
---

## Contexte

Réf : **P117.04** du fichier de pistes, `validé` (V7 accordé).

La section « Profil professionnel » de `/app/profile` portait une bio et un numéro de licence
saisissables sans formulaire ni action, une spécialité « Bientôt disponible » et une agence
toujours « Non affilié ». `GET /api/me/profiles` rendait l'agence, ni la licence ni la spécialité.

## Décision du porteur

> porteur (2026-10-22) : afficher en lecture seule l'agence du profil actif, la licence et la spécialité (ajoutées à `ProfileResource` pour le seul profil d'agent) ; retirer les champs saisissables sans enregistrement

## Objectif

La section affiche, sans champ éditable, l'agence, la licence et la spécialité du profil d'agent.

## Delta à produire

- [x] `ProfileResource` : `license_number` et `specialty` pour le seul `AgentProfile`.
- [x] `ProfileAgentSection` : composant client sur `useMyProfiles`, liste de définitions en
      lecture seule ; bio et licence saisissables retirées ; clé `profile.agent.notProvided`
      (« Non renseigné ») pour une valeur absente ; clés devenues sans lecteur retirées.
- [x] `Profile` (types) et le sparse fieldset de `lib/profiles.ts` nomment les deux champs.

## Critères d'acceptation

- [x] AC1 — `GET /api/me/profiles` rend `license_number` et `specialty` sur le profil d'agent, et
      pas sur les autres.
- [x] AC2 — La section affiche le nom de l'agence du profil, la licence et la spécialité.
- [x] AC3 — La section ne rend aucun `input`, `textarea` ni `select`.

## Hypothèses

- « Le profil actif » : le profil actif s'il est un profil d'agent ; à défaut (compte agent dont
  l'espace actif est un autre profil), le premier profil d'agent de la liste. Choix le plus étroit
  qui affiche toujours une agence juste.

## Hors périmètre

- La section du bailleur (« Type de bailleur : Bientôt disponible ») : P117.05.
- Les zones d'intervention de l'agent : P117.03, sur la page publique.

## Notes d'implémentation

- `mergeWhen` dans `ProfileResource` fait rougir `DateInventoryByValueTest` (clé `0` jamais
  atteinte) : les deux clés s'ajoutent par un `if` après le tableau.
- Ablation API : sans le bloc `if`, `test_agent_profile_carries_license_and_specialty_and_others_do_not`
  rouge (`Undefined array key "license_number"`) ; remis → vert.
- Ablation front : l'ancien composant remis, les 3 tests de `ProfileAgentSection.test.tsx`
  rouges ; le nouveau → verts.
- `wo` : la clé neuve porte le texte français (wolof en pause).
