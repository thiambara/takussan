---
id: TCK-1023
title: "Retirer le `$requestLoadable` mort d'`AgencySubscription`, et la garde des `include=` ignore les commentaires"
status: done
phase: P3
family: technique
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: [TCK-1022]
blocks: []
spec_refs:
  features: []
  models:
    - "docs/models-spec.md#44-agencysubscription-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-60--include-acceptés-chargés-et-non-émis--show-qui-ignorent-include-et-fields"
tags: [api, query-builder, include, garde, pistes]
---

## Contexte

Réf : **P60.04** du fichier de pistes, `retenu · autonome` (A3, A5). `AgencySubscription` déclarait
`$requestLoadable = ['agency', 'plan']` sans aucun lecteur : aucun `AgencySubscription::buildQuery(`
dans `app/`, et `AgencySubscriptionController` rend une seule souscription. La garde de TCK-807
reconnaissait une relation émise à la présence de `whenLoaded('x')` dans le source brut, commentaires
compris. Re-mesuré le 2026-10-20 sur `pre-dev` c3c65f7a7 : `grep -rn "buildQuery" app | grep -i
subscription` → rien ; le test neuf ci-dessous rougit tant que la garde lit les commentaires.

## Objectif

Aucune déclaration d'`include=` sans lecteur sur `AgencySubscription`, et une mention en
commentaire ne fait plus passer la garde.

## Delta à produire

- [x] `AgencySubscription::$requestLoadable` retiré, et l'exemption posée par TCK-1022 levée.
- [x] `RequestLoadableEmittedTest` : le source de la ressource est lu sans ses `T_COMMENT` ni
      `T_DOC_COMMENT` (`token_get_all`) ; un test épingle les quatre formes de commentaire.

## Critères d'acceptation

- [x] AC1 — Un `whenLoaded('x')` ou `relationLoaded('x')` en commentaire (`//`, `#`, `/* */`,
      `/** */`) ne rend pas `x` émise ; un `whenLoaded('plan')` de code la rend émise.
- [x] AC2 — La garde reste verte sur l'arbre, sans exemption pour `AgencySubscription`.

## Hypothèses (mode sans humain)

- Un `whenLoaded('x')` dans une chaîne littérale compte encore comme émis : la piste ne vise que
  les commentaires.

## Hors périmètre

- Le reste de l'angle 60 (P60.02, P60.03).

## Notes d'implémentation

- Avant correctif : le test des commentaires rougit (les quatre relations commentées comptées
  émises). Filtrage des commentaires remis à `[$source]` (ablation) → rouge ; remis → 3 verts.
- Exemption retirée avec le modèle d'origine → rouge sur `AgencySubscription : agency` ; la
  déclaration retirée → vert. Le filtrage des commentaires n'a fait apparaître aucun autre écart
  sur l'arbre, et aucune exemption n'est devenue inutile.
