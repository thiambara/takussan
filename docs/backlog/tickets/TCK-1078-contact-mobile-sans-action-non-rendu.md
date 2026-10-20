---
id: TCK-1078
title: "Le bouton mobile « Contacter » d'une fiche publique ne s'affiche plus quand il n'ouvre aucune action"
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
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-85--ce-que-le-site-public-montre-dune-agence-individual"
tags: [web, public, agence, contact, pistes]
---

## Contexte

Réf : **P85.05** du fichier de pistes, `validé (délégué)` (V7). L'espace `individual` naît sans
courriel ni téléphone (`HostIndividualOnboardingService::createAgency()`), et la fiche d'agence
passe ces deux champs à `ContactSheet` sans `agentSlug`. Sur grand écran, aucun bouton ne
s'affiche ; sur mobile, le déclencheur « Contacter » était rendu sans condition et ouvrait un volet
vide.

## Décision du porteur (déléguée)

> ne pas rendre le déclencheur mobile « Contacter » de `ContactSheet` quand ni courriel, ni téléphone, ni `agentSlug` n'existent, comme sur grand écran ; garde : un test de `ContactSheet` sans les trois, qui n'attend aucun bouton

## Reste à faire

> le formulaire de contact anonyme vers l'admin sur la fiche d'un espace `individual`, qui dépend de la décision de P85.04

## Objectif

Sans aucune action, `ContactSheet` ne rend rien, sur mobile comme sur grand écran.

## Delta à produire

- [x] `ContactSheet` : le bloc mobile (déclencheur et volet) n'est rendu que si `agentSlug`, un
      courriel ou un téléphone existe.
- [x] Test : `src/components/public/profile/__tests__/ContactSheet.tck-1078.test.tsx`.

## Critères d'acceptation

- [x] AC1 : sans courriel, téléphone ni `agentSlug`, aucun bouton ni lien n'est rendu.
- [x] AC2 : un courriel seul, un téléphone seul ou un `agentSlug` seul rendent le déclencheur
      « Contacter ».

## Hypothèses (mode sans humain)

- Aucune : la règle est celle des boutons du grand écran.

## Hors périmètre

- Le reste ci-dessus, au porteur avec P85.04.

## Notes d'implémentation

- Avant correctif : AC1 rouge (1 bouton, le déclencheur mobile). Ablation (`aUneAction = true`) :
  le même rouge.
