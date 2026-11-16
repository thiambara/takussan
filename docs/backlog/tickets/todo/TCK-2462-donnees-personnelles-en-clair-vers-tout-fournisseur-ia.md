---
id: TCK-2462
title: "Dette : les usages IA de classe personnelle partent en clair vers tout fournisseur"
status: todo
phase: P1
family: technique
estimate: S
wave: 64
created: 2026-11-01
updated: 2026-11-16
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [dette, ia, radar, donnees-personnelles]
---

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : bloqué sur une décision du porteur — défaut toujours vrai dans le code, non exposé
aujourd'hui** (préproduction : `ANTHROPIC_API_KEY` seule, `docs/infra/hebergement.md:111`).

- Trois usages de classe `Personnelle` sur sept, pas deux : `RadarExtractionUsage` s'ajoute (c'est
  celui qui tourne réellement en préproduction).
- `AiDataGuard` (`app/Services/Ai/AiDataGuard.php:17-34`) refuse `Sensible` et masque les numéros pour
  un usage `Publique` seulement ; aucune restriction de fournisseur par classe, et `AiUsage` n'a pas de
  liste de fournisseurs permis.
- Deux garde-fous bornent le risque sans le fermer : `data_collection: deny` sur OpenRouter
  (`config/ai.php:60`, gardé par `check-ai-providers-privacy.mjs`) et la consigne
  `hebergement.md:293` (aucune clé OpenAI ni OpenRouter avant le contrat de sous-traitance et le geste CDP).
- Le geste à surveiller : la pose d'une clé `OPENAI_API_KEY` / `OPENROUTER_API_KEY` dans Dokploy.

**Décision attendue du porteur** : **(a)** garder (le contrat de sous-traitance et la déclaration CDP
par fournisseur suffisent), ou **(b)** restreindre les usages `Personnelle` à une liste de fournisseurs
(ex. Anthropic), par une méthode `allowedProviders()` de l'usage ou une règle par classe dans
`AiDataGuard` / `AiGateway` ? Dans les deux cas, un ADR amende ADR-0076 ; (b) ajoute l'implémentation
et un test de refus par fournisseur (S).

## Constat

Les usages dont `maxDataClass()` rend `AiDataClass::Personnelle` (par exemple `RadarConsentMessageUsage`, qui transmet le
nom de l'annonceur, `RadarConsentVerificationUsage`, qui lit son numéro, et `RadarExtractionUsage` — ajouté le 2026-11-16,
`app/Ai/Usages/RadarExtractionUsage.php:52-55`) envoient ces données sans masquage à tout
fournisseur sélectionnable. `AiDataClass::Sensible` reste refusé. `takussan-web/src/content/legal/privacy.ts` § 5 décrit
ces transferts.

Risque le plus net avec OpenRouter, dont les fournisseurs finaux varient. Aujourd'hui, seule une clé Anthropic est posée
en préproduction, et aucun environnement de production n'existe.

Deux garde-fous existants bornent ce risque sans le fermer (relevé 2026-11-16) : OpenRouter est appelé avec
`'provider' => ['data_collection' => 'deny', …]` (`config/ai.php:60`, gardé par `check-ai-providers-privacy.mjs`),
et `docs/infra/hebergement.md:293` interdit toute clé OpenAI ou OpenRouter avant le contrat de sous-traitance et le
geste CDP.

## Décision du porteur

Le 2026-11-01, le porteur a choisi de traiter ce point comme une dette, sans rien changer pour l'instant. La limitation
de ces usages à Anthropic, proposée en revue, n'est ni retenue ni écartée.

## Critère d'acceptation

- [ ] Le porteur a tranché entre garder ce comportement et restreindre les fournisseurs de ces usages, et la décision est
      écrite dans un ADR amendant ADR-0076.
