---
id: TCK-2462
title: "Dette : les usages IA de classe personnelle partent en clair vers tout fournisseur"
status: todo
phase: P1
family: technique
estimate: S
wave: 64
created: 2026-11-01
updated: 2026-11-01
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [dette, ia, radar, donnees-personnelles]
---

## Constat

Les usages dont `maxDataClass()` rend `AiDataClass::Personnelle` (par exemple `RadarConsentMessageUsage`, qui transmet le
nom de l'annonceur, et `RadarConsentVerificationUsage`, qui lit son numéro) envoient ces données sans masquage à tout
fournisseur sélectionnable. `AiDataClass::Sensible` reste refusé. `takussan-web/src/content/legal/privacy.ts` § 5 décrit
ces transferts.

Risque le plus net avec OpenRouter, dont les fournisseurs finaux varient. Aujourd'hui, seule une clé Anthropic est posée
en préproduction, et aucun environnement de production n'existe.

## Décision du porteur

Le 2026-11-01, le porteur a choisi de traiter ce point comme une dette, sans rien changer pour l'instant. La limitation
de ces usages à Anthropic, proposée en revue, n'est ni retenue ni écartée.

## Critère d'acceptation

- [ ] Le porteur a tranché entre garder ce comportement et restreindre les fournisseurs de ces usages, et la décision est
      écrite dans un ADR amendant ADR-0076.
