---
id: TCK-2449
title: "Socle IA : aucun réglage propre à Anthropic — outil de sortie jamais forcé et mode strict déclaré par pilote (ADR-0085)"
status: done
phase: P1
family: back
estimate: M
wave: 80
created: 2026-10-30
updated: 2026-10-31
depends_on: []
blocks: [TCK-2450]
spec_refs:
  features:
    - "docs/features.md#211-socle-ia"
tags: [api, ai, adr-0085, adr-0076]
---

## Objectif utilisateur

Le super-admin peut affecter à un rôle un modèle servi par un autre pilote qu'Anthropic, par exemple `openai`,
`openrouter` ou `openai-compatible`, sans qu'un réglage propre à Anthropic fasse échouer l'appel ou sa sortie
structurée.

## Contrat de données

État sur `dev` `20c2538a4` :

- `SocleAgent::providerOptions()` pose `tool_choice: {type: auto}` seulement quand le fournisseur vaut `anthropic` et
  que l'agent n'est pas strict.
- `SocleAgent::usesStrictSchema()` ne prend pas d'argument.
- `AiGateway::providerFor()` crée, pour un agent non strict, un double du fournisseur avec
  `use_native_structured_output` faux.
- `AiGateway` (ligne ~138) tient une réponse non stricte sans sortie pour un échec.
- Les gardes de schéma (`AgentSchemasStayUnderTheUnionLimitTest`, `StrictSchemasStayWithinTheAttestedSizeTest`)
  lisent les schémas tels qu'Anthropic les reçoit (`Tests\Support\Ai\AnthropicSchemas`).

Côté SDK, les pilotes OpenAI, OpenRouter et OpenAI-compatible construisent leur propre `tool_choice` et leur propre
`strict` (`vendor/laravel/ai/src/Gateway/{OpenAi,OpenRouter,OpenAiCompatible}/Concerns/BuildsTextRequests.php`).
OpenAI passe par l'API Responses, dont la forme de `tool_choice` diffère de celle de Chat Completions.

Aucune table ni route n'est créée.

## Contraintes strictes (métier)

- **Aucun appel ne force l'outil de sortie, chez aucun pilote** (ADR-0085 §2). La forme de `auto` suit le **pilote**
  (`config("ai.providers.{p}.driver")`), jamais le nom du fournisseur. Une entrée nommée `openrouter-claude` sur le
  pilote `openrouter` suit la règle d'OpenRouter.
- **Le mode strict se déclare par agent et par pilote.** Il n'est vrai que pour un pilote où une taille de schéma a
  été attestée par un vrai appel ; aujourd'hui, `anthropic` seulement. Pour tout autre pilote, l'agent est non strict
  jusqu'à attestation. **Jamais de repli à l'exécution** : un 400 du mode strict reste un échec du maillon, et la
  bascule de la chaîne fait le reste.
- **La sortie non stricte reste validée de la même façon** sur tous les pilotes : normaliseur de l'usage, et réponse
  sans sortie = `ai.response_invalid`.
- **Le double de fournisseur de `providerFor()`** garde le nom réel dans le journal, le coût et la chaîne, quel que
  soit le pilote, et conserve les réglages de l'entrée (adresse, en-têtes, options d'acheminement de TCK-2450).
- **Aucun test ne joint un vrai modèle.** Les requêtes se vérifient sur un faux client HTTP (`Http::fake`) qui capture
  le corps envoyé par chaque pilote du SDK.
- **Aucun identifiant de modèle dans le code** (`scripts/check-ai-usages.mjs`).
- **Vérifier dans la documentation de chaque fournisseur, avant d'écrire, la forme de `tool_choice: auto` et les
  limites de schéma publiées.** Citer la page et la date de lecture dans le rapport. Un pilote sans limite publiée est
  non strict.

## Delta à produire

- [x] `SocleAgent` :
  - [x] `usesStrictSchema(string $driver)`, ou un équivalent déclaratif par pilote ;
  - [x] `providerOptions()` ne laisse forcer l'outil de sortie sur aucun pilote : `auto` n'est posé que sur `anthropic`,
        seul pilote qui a un outil de sortie (ADR-0085, amendement du 2026-10-31) ;
  - [x] docblocks mis à jour.
- [x] `RadarExtraction` et chaque agent concret : déclaration par pilote, non strict hors des pilotes attestés.
- [x] `AiGateway` :
  - [x] `providerFor()` et le contrôle de la ligne ~138 lisent la déclaration pour le pilote du maillon joué ;
  - [x] vérifier que `use_native_structured_output` est honoré par les pilotes OpenAI, OpenRouter et
        OpenAI-compatible du SDK, et sinon trouver l'équivalent.
- [x] Tests :
  - [x] `SocleAgentProviderOptionsTest` : pour chaque pilote déclarable (`anthropic`, `openai`, `openrouter`,
        `openai-compatible`), aucune requête d'un agent non strict ne porte un `tool_choice` forcé, corps capturé
        par `Http::fake` ;
  - [x] la déclaration stricte dépend du pilote, pas du nom de l'entrée ;
  - [x] `AnthropicSchemas` généralisé, ou doublé, pour mesurer un schéma tel que chaque pilote l'envoie ; les deux
        gardes de schéma vérifient chaque pilote attesté.
- [x] Bascule hors d'Anthropic, écrite au journal et lisible dans la console (ADR-0085, amendement du 2026-10-31).
- [x] Rapport : liste des pilotes attestés en strict et ce qui l'a attesté, et texte de spec proposé (features §2.11,
      la règle « Le schéma de sortie d'un usage tient sous les limites publiées du fournisseur »).

## Critères d'acceptation

- [x] **AC1** — Pour un agent non strict, la requête construite par chacun des pilotes `anthropic`, `openai`,
      `openrouter` et `openai-compatible` ne force pas l'outil de sortie. Le corps capturé le montre.
- [x] **AC2** — Une entrée de configuration au nom quelconque, sur le pilote `anthropic`, reçoit le même
      `tool_choice` que l'entrée `anthropic`. Ce critère est faux sur `dev` aujourd'hui, et doit rougir sans le
      correctif.
- [x] **AC3** — Un agent strict sur `anthropic` reste strict sur `anthropic`, sans outil dans la requête, et est non
      strict sur un pilote non attesté.
- [x] **AC4** — Sur un pilote non strict, une réponse sans sortie structurée est un échec du maillon
      (`ai.response_invalid`), et la chaîne bascule.
- [x] **AC5** — `ai_calls.provider` porte le nom réel de l'entrée, jamais le double, pour chaque pilote.

## Hors périmètre

- Déclarer les fournisseurs OpenAI, OpenRouter ou un point d'accès compatible : TCK-2450. Ce ticket les éprouve sur
  des entrées de configuration posées par les tests.
- Attester le mode strict sur un nouveau pilote par un vrai appel : geste du porteur, une fois une clé posée. Le
  ticket laisse ces pilotes non stricts.
- Le catalogue des modèles : TCK-2448.

## Notes d'implémentation

Rien de ce ticket n'a joint un vrai fournisseur : tout est vérifié sur un faux client HTTP et sur la documentation
relevée le 2026-10-31. Le rapport de la branche cite les pages.

- **Le SDK n'a d'outil de sortie que sur `anthropic`.** `openai`, `openrouter` et `openai-compatible` demandent la
  sortie par `text.format` ou `response_format`, sans `tools`. Ils ignorent `use_native_structured_output` ; leur
  `strict` suit l'attribut `#[Strict]` du SDK, qu'aucun agent ne porte (un test le tient).
- **AC2 était déjà vrai sur `dev`**, contrairement à ce que dit le contrat : mesuré sur `941e52fb0`, le SDK passe le
  pilote à `providerOptions()`. Le test rougit par ablation (le nom à la place du pilote), pas sur `dev`.
- **Le défaut réel était AC4** : sur un pilote non attesté, un agent déclaré strict rendait une réponse vide en succès.
- **Le double reste utile sur chaque pilote** : `openai-compatible` passe le nom de l'entrée aux options, et une entrée
  nommée `anthropic` recevrait sans lui le `tool_choice` d'Anthropic (ablation A11).
- **La bascule suit l'amendement du 2026-10-31 d'ADR-0085** : hors d'Anthropic, un refus bascule s'il reste un maillon ;
  sur `anthropic` et sur le dernier maillon, l'exception part telle quelle. La contrainte « un 400 […] la bascule de la
  chaîne fait le reste » n'est donc vraie que hors d'Anthropic.
- **Un 408 vaut `ai.provider_timeout` sur tout pilote** : c'est le seul changement d'issue sur Anthropic (le code du
  journal et la reprise par les jobs). Aucun corps envoyé ne change.

### Limites connues

- **Sur Anthropic strict, une réponse sans sortie reste un succès à `[]`**, y compris comme secours après un autre pilote.
  Inchangé, et figé par un test. Les lecteurs des jobs l'arrêtent ; `EvaluationRunner` ne compte pas le cas en échec, seuls
  ses scores le pénalisent.
- **Rien ne garde la forme des schémas hors d'Anthropic** : racine, `required`, `additionalProperties`. Mesurée à la main
  sur les 3 agents, elle attend TCK-2450.
- **Les gardes des agents lisent ce qu'ils déclarent.** Un agent qui ne forcerait un outil que sous une condition d'état
  échapperait au test de ses options. Un agent hors du dossier et d'aucun usage n'est vu que par
  `scripts/check-ai-usages.mjs` (C), qui ne lit que le motif `extends SocleAgent`.
- **Aucune alerte sur `provider_rejected`** : le tableau de bord le compte, sans nommer le fournisseur. Le nom se lit dans
  `ai_calls`.

### Décisions prises en autonomie, à revoir

- **`auto` seulement sur `anthropic`**, inscrit dans ADR-0085 (amendement du 2026-10-31). Écarté : le poser sur les trois
  autres pilotes. Il n'y a aucun outil à y choisir, et leur documentation ne dit pas qu'un `tool_choice` seul est accepté.
- **Les agents héritent de `anthropic` comme pilote strict, `RadarExtraction` déclare aucun pilote.** Écarté : une
  déclaration obligatoire par agent, plus de code pour le même résultat ; un test parcourt chaque agent et chaque pilote.

