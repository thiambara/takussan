---
id: TCK-456
title: "Trois définitions divergentes de la fenêtre d'activité d'une délégation, qu'aucune garde ne lie"
status: todo
phase: P2
family: back
estimate: S
wave: 49
created: 2026-08-28
updated: 2026-08-28
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#112-agence--équipe
  models:
    - docs/models-spec.md#2-agency
tags: [back, autorisation, delegation, dette, garde]
---

## Objectif utilisateur

Aucun — c'est une dette de cohérence interne. Elle ne se voit pas depuis le produit, et c'est
précisément ce qui la rend coûteuse le jour où l'une des trois définitions bouge.

## Contexte

Relevé pendant la revue adverse de [TCK-395](TCK-395-delegation-role-delegue-sans-rapport-avec-les-capacites.md). La « fenêtre
d'activité » d'une délégation de rôle est définie **trois fois**, à trois endroits, et rien ne
garantit que les trois disent la même chose :

- `scopeActive`
- `hasActiveAgencyDelegation`
- `delegationAllows`

**Aucune garde ne les lie.**

⚠️ **Aucune urgence, et la raison est mesurée** : la seule des trois qui **autorise** est
`delegationAllows`, et elle est gardée par les bornes de TCK-395 ; `scopeActive` n'a **aucun
appelant**. Le risque n'est donc pas aujourd'hui — il est le jour où quelqu'un corrige l'une des
trois en croyant les corriger toutes, ou branche `scopeActive` sur un chemin d'autorisation.

*Trois définitions d'une même règle ne divergent pas le jour où on les écrit : elles divergent le
jour où on en modifie une.*

## Critères d'acceptation

1. Les trois définitions sont **rapprochées et comparées terme à terme** — bornes incluses ou
   exclues, traitement de `NULL`, fuseau — et l'écart, s'il existe, est **écrit** avant d'être
   corrigé.
2. Soit elles convergent vers une source unique, soit un test lie les trois et **rougit** quand
   l'une diverge. ⚠ Un test qui ne ferait qu'appeler les trois sur le même cas nominal ne garde
   rien : il faut le cas **aux bornes**, celui où une inclusion stricte et une inclusion large ne
   répondent pas pareil.
3. Le sort de `scopeActive` est tranché : branché, ou **supprimé**. Un scope sans appelant est
   une définition qui attend d'être choisie par erreur.
4. Ablation prouvée dans les deux sens, avec preuve d'application avant lecture du résultat.

## Notes

À traiter avec [TCK-457](TCK-457-resolution-des-delegations-en-n-plus-un.md), relevé dans la même
revue et sur le même mécanisme.
