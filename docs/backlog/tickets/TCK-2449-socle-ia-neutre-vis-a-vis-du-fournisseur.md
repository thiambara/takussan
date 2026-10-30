---
id: TCK-2449
title: "Socle IA : aucun réglage propre à Anthropic — outil de sortie jamais forcé et mode strict déclaré par pilote (ADR-0085)"
status: todo
phase: P1
family: back
estimate: M
wave: 80
created: 2026-10-30
updated: 2026-10-30
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

- [ ] `SocleAgent` :
  - [ ] `usesStrictSchema(string $driver)`, ou un équivalent déclaratif par pilote ;
  - [ ] `providerOptions()` pose `auto` pour tout pilote quand l'agent n'est pas strict pour ce pilote, dans la
        forme de ce pilote ;
  - [ ] docblocks mis à jour.
- [ ] `RadarExtraction` et chaque agent concret : déclaration par pilote, non strict hors des pilotes attestés.
- [ ] `AiGateway` :
  - [ ] `providerFor()` et le contrôle de la ligne ~138 lisent la déclaration pour le pilote du maillon joué ;
  - [ ] vérifier que `use_native_structured_output` est honoré par les pilotes OpenAI, OpenRouter et
        OpenAI-compatible du SDK, et sinon trouver l'équivalent.
- [ ] Tests :
  - [ ] `SocleAgentProviderOptionsTest` : pour chaque pilote déclarable (`anthropic`, `openai`, `openrouter`,
        `openai-compatible`), aucune requête d'un agent non strict ne porte un `tool_choice` forcé, corps capturé
        par `Http::fake` ;
  - [ ] la déclaration stricte dépend du pilote, pas du nom de l'entrée ;
  - [ ] `AnthropicSchemas` généralisé, ou doublé, pour mesurer un schéma tel que chaque pilote l'envoie ; les deux
        gardes de schéma vérifient chaque pilote attesté.
- [ ] Rapport : liste des pilotes attestés en strict et ce qui l'a attesté, et texte de spec proposé (features §2.11,
      la règle « Le schéma de sortie d'un usage tient sous les limites publiées du fournisseur »).

## Critères d'acceptation

- [ ] **AC1** — Pour un agent non strict, la requête construite par chacun des pilotes `anthropic`, `openai`,
      `openrouter` et `openai-compatible` ne force pas l'outil de sortie. Le corps capturé le montre.
- [ ] **AC2** — Une entrée de configuration au nom quelconque, sur le pilote `anthropic`, reçoit le même
      `tool_choice` que l'entrée `anthropic`. Ce critère est faux sur `dev` aujourd'hui, et doit rougir sans le
      correctif.
- [ ] **AC3** — Un agent strict sur `anthropic` reste strict sur `anthropic`, sans outil dans la requête, et est non
      strict sur un pilote non attesté.
- [ ] **AC4** — Sur un pilote non strict, une réponse sans sortie structurée est un échec du maillon
      (`ai.response_invalid`), et la chaîne bascule.
- [ ] **AC5** — `ai_calls.provider` porte le nom réel de l'entrée, jamais le double, pour chaque pilote.

## Hors périmètre

- Déclarer les fournisseurs OpenAI, OpenRouter ou un point d'accès compatible : TCK-2450. Ce ticket les éprouve sur
  des entrées de configuration posées par les tests.
- Attester le mode strict sur un nouveau pilote par un vrai appel : geste du porteur, une fois une clé posée. Le
  ticket laisse ces pilotes non stricts.
- Le catalogue des modèles : TCK-2448.

## Notes d'implémentation

_(à remplir par implementing-specs)_
