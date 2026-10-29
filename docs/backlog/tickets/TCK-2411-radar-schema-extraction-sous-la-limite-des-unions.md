---
id: TCK-2411
title: "Radar : le schéma de l'extraction repasse sous la limite d'Anthropic (16 paramètres à union), et une garde compte les unions de chaque agent"
status: doing
phase: P1
family: bug
estimate: S
wave: 80
created: 2026-10-29
updated: 2026-10-29
depends_on: [TCK-2386]
blocks: []
spec_refs:
  features:
    - "docs/features.md#211-socle-ia"
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, radar, ia, socle-ia, garde, adr-0076, adr-0077]
---

## Objectif utilisateur

Un opérateur du Radar qui colle une annonce obtient son extraction : aujourd'hui, **toute extraction
réelle échoue** avant même d'atteindre le modèle.

## Contexte

Mesuré le 2026-10-29 par un vrai appel, `php artisan ai:eval radar.extraction` échoue au premier cas.
Anthropic rend un HTTP 400 `invalid_request_error` (`request_id` `req_011CgXPV7kM7D6kUwuGFTWZa`) :

> Schemas contains too many parameters with union types (29 parameters with type arrays or anyOf).
> This causes exponential compilation cost. Reduce the number of nullable or union-typed parameters
> (limit: 16 parameters with unions).

Le même schéma sert le job de production `ExtractRadarListing` : chaque extraction réelle finit en
`ai.request_rejected`. Aucun test ne le voit, parce qu'aucun n'appelle le vrai modèle (et c'est voulu).

Les 29 unions viennent de `App\Ai\Agents\RadarExtraction::schema()` : les 13 `PROPERTY_FIELDS` et
`advertiser_name`, chacun en `{value (nullable), confidence, evidence (nullable)}` — 14 `value` et
14 `evidence` —, plus l'`evidence` de `advertiser_nature`. `RadarConsentVerification` (5 unions) et
`RadarConsentMessage` (0) passent, et `radar.verification_accord` vient de réussir réellement.

## Contrat de données

- Aucune migration, aucun endpoint. La forme **stockée** (`radar_listings.extracted`, relue par
  `ExtractionNormalizer`) ne change pas : `evidence` y reste `null` sans passage.
- Ce qui change est la forme **demandée au modèle** : `evidence` n'est plus nullable, la chaîne vide
  `""` y dit « aucun passage ». Prompt `radar.extraction` en `v2` (une version publiée ne se réécrit
  pas, ADR-0076 §6).

## Contraintes strictes

- Aucun test n'appelle un vrai modèle ni le réseau.
- `""` et l'absence de passage sont une seule et même chose pour tout lecteur : un champ présent avec
  `evidence: ""` porte `evidence_missing` et tombe à `low`, avec ou sans texte source.
- La garde couvre un agent neuf sans qu'on l'inscrive à la main, et compte les unions **sous la forme
  exacte que laravel/ai envoie** au fournisseur `anthropic`.

## Delta à produire

- [ ] `RadarExtraction::field()` : `evidence` en `string` non nullable, description qui dit `""`.
- [ ] Prompt `resources/ai/prompts/radar.extraction/v2.md` (le passage absent s'écrit `""`), inscrit
      dans `versions.lock.json` ; `RadarExtractionUsage::promptVersion()` à 2.
- [ ] Lecteurs de `evidence` re-mesurés ; `""` lu comme l'absence de passage, à l'entrée du normaliseur.
- [ ] Garde de test : chaque agent à sortie structurée de `app/Ai/Agents/` compte au plus 16 paramètres
      à union dans son schéma sérialisé pour Anthropic.

## Critères d'acceptation

- [ ] AC1 — Le schéma de `RadarExtraction`, sérialisé comme laravel/ai l'envoie à Anthropic, compte au
      plus 16 paramètres à union ; le même décompte rend **29** sur le code d'origine (celui de l'API).
- [ ] AC2 — La garde découvre seule les agents de `app/Ai/Agents/` ; remettre `evidence` nullable la
      fait rougir (ablation).
- [ ] AC3 — Un champ présent rendu avec `evidence: ""` est relu en `evidence: null`, drapeau
      `evidence_missing`, confiance `low` — avec un texte source et sans (captures).
- [ ] AC4 — Le prompt joué dit que le passage absent s'écrit `""`, et la version publiée `v1` reste
      intacte.

## Hors périmètre

- Le passage `--update-baseline` de `radar.extraction`, qui appelle le vrai modèle : la session le
  lance après la fusion.
- Les schémas des outils (`input_schema`) : aucun agent du socle n'a d'outil (ADR-0076 §10,
  `ExternalContentPolicy`).
