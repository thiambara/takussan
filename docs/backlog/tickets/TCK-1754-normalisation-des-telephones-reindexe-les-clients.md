---
id: TCK-1754
title: "`crm:normalize-customer-phones` réindexe les clients qu'elle modifie"
status: done
phase: P1
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-122--écritures-qui-changent-un-document-indexé-sans-passer-par-lobservateur-scout"
tags: [api, crm, recherche, scout, pistes]
---

## Contexte

Réf : **P122.03** du fichier de pistes, `retenu · autonome` (A1).

La commande écrit `phone` et `emergency_contact_phone` par `toBase()->update()` : aucun événement
de modèle, aucune réindexation. `Customer::toSearchableArray()` indexe `phone` : après son passage,
la base porte la forme E.164 et l'index l'ancienne saisie, et la recherche du numéro normalisé ne
retrouve plus le client.

## Objectif

L'index des clients reflète la table après la commande.

## Delta à produire

- [x] Les clients modifiés d'un lot sont réindexés à la fin du lot
  (`Customer::query()->whereKey($ids)->searchable()`), la première voie de la Piste ; un client
  supprimé ne l'est pas (portée par défaut, et `shouldBeSearchable()`).
- [x] `--dry-run` ne réindexe rien.
- [x] Test : `NormalisationDesTelephonesReindexeTest` (sous `InteractsWithMeilisearch`).

## Critères d'acceptation

- [x] AC1 — Un client indexé avec `77 123 45 67`, la commande, puis `filter[search]=+221771234567`
  le rend.
- [x] AC2 — En essai à blanc, l'index n'est pas touché.

## Notes d'implémentation

- La réindexation est par lot et non par ligne, ce que l'en-tête de la commande écartait.
- Avant correctif : la recherche du numéro normalisé rend 0 résultat (rouge).
- Ablation : commande remise à `HEAD` → 1 rouge ; remise → 2/2.
