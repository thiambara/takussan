---
id: TCK-2433
title: "Radar : l'extraction quitte la sortie structurée stricte, dont la grammaire compilée dépasse la limite d'Anthropic, et une garde borne les schémas stricts"
status: doing
phase: P1
family: bug
estimate: S
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2411]
blocks: []
spec_refs:
  features:
    - "docs/features.md#211-socle-ia"
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, radar, ia, socle-ia, garde, adr-0076, adr-0077]
---

## Objectif utilisateur

Un opérateur du Radar qui colle une annonce obtient son extraction. Après TCK-2411, elle échoue
encore, avant d'atteindre le modèle.

## Contexte

L'évaluation payante `radar.extraction`, lancée depuis `dev` après la fusion de TCK-2411 (#1589,
`2d40d466f`), rend un autre HTTP 400 (`request_id` `req_011CgXcoW2oogB57WsCGbQkH`) :

> The compiled grammar is too large, which would cause performance issues. Simplify your tool
> schemas or reduce the number of strict tools.

La limite de 16 paramètres à union est respectée (14), mais la documentation d'Anthropic sur les
sorties structurées décrit, au-delà de ses trois limites explicites (20 outils stricts, 24 paramètres
optionnels, 16 unions), des « limites internes sur la taille de la grammaire compilée » : unions,
objets imbriqués, paramètres optionnels et outils interagissent, sans seuil publié. Le job
`ExtractRadarListing` sert le même schéma : l'extraction de production reste cassée.

## Contrat de données

- Aucune migration, aucun endpoint, aucun changement de forme : `radar_listings.extracted` reste la
  sortie de `ExtractionNormalizer`.
- Ce qui change est le **mode** de la sortie structurée pour l'agent `RadarExtraction` : un outil
  forcé non strict (`output_structured_data`) au lieu de `output_config.format` (grammaire
  compilée). Les autres agents restent stricts.

## Contraintes strictes

- Aucun test n'appelle un vrai modèle ni le réseau (`Http::fake`, `preventStrayRequests`).
- Le schéma, le prompt (`v2`) et le normaliseur de l'extraction ne changent pas : la qualité de
  l'extraction ne dépend pas de ce correctif.
- La décision se défait en une ligne (`SocleAgent::usesStrictSchema()`).

## Delta à produire

- [ ] `SocleAgent::usesStrictSchema()` (vrai par défaut), `RadarExtraction` le passe à faux.
- [ ] `AiGateway` sert un agent non strict par la sortie structurée par outil de laravel/ai
      (`use_native_structured_output = false`), sans changer le fournisseur journalisé.
- [ ] Garde : un schéma strict au-delà de la taille du plus gros schéma dont la compilation est
      attestée par un vrai appel rougit ; ses limites sont écrites.

## Critères d'acceptation

- [ ] AC1 — Une extraction envoie à Anthropic une requête sans `output_config`, avec l'outil
      `output_structured_data` non strict et `tool_choice` forcé sur lui ; la réponse de l'outil est
      relue en sortie structurée et journalisée sous le fournisseur `anthropic`.
- [ ] AC2 — Un agent strict (`radar.verification_accord`) envoie toujours `output_config.format`.
- [ ] AC3 — La garde rougit sur un agent strict plus gros que le plus gros schéma attesté (dont le
      schéma de `RadarExtraction` s'il redevenait strict), et laisse passer les agents livrés.
- [ ] AC4 — Chaque AC rougit sans son correctif (ablation consignée).
