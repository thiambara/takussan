---
id: TCK-2450
title: "Socle IA : déclarer OpenAI, OpenRouter et les points d'accès compatibles OpenAI — clé et adresse dans l'environnement, hôtes acceptés en configuration (ADR-0085)"
status: todo
phase: P1
family: full
estimate: M
wave: 80
created: 2026-10-30
updated: 2026-10-31
depends_on: [TCK-2448, TCK-2449]
blocks: []
spec_refs:
  features:
    - "docs/features.md#211-socle-ia"
tags: [api, front, ai, legal, infra, adr-0085, adr-0076]
---

## Objectif utilisateur

Le porteur peut utiliser un modèle d'OpenAI, un modèle acheminé par OpenRouter, ou un point d'accès compatible OpenAI
qu'il a nommé. Il pose la clé dans Dokploy, puis ajoute le modèle et l'affecte dans la console, sans autre
changement de code.

## Contrat de données

- Le bloc `providers` de `takussan-api/config/ai.php` reçoit deux entrées :
  - `openai`, pilote `openai`, clé `OPENAI_API_KEY`, adresse `OPENAI_URL` ;
  - `openrouter`, pilote `openrouter`, clé `OPENROUTER_API_KEY`, adresse `OPENROUTER_URL`.

  Chacune porte son `legal_name` et une liste `allowed_hosts`, écrite en configuration et non lue de
  l'environnement.
- **Un point d'accès compatible OpenAI** est une entrée nommée par point d'accès, sur le pilote `openai-compatible`,
  avec son `legal_name` et ses `allowed_hosts` en configuration. **Aucune n'est ajoutée par ce ticket** : on n'en
  connaît aucune aujourd'hui. Le ticket livre le mécanisme, et le runbook dit comment en déclarer une. Pas d'entrée
  générique dont l'adresse suffirait à changer le destinataire.
- `openrouter` porte `provider.data_collection`, réglable en configuration, `deny` par défaut. Il est posé sur
  chaque requête. Source : documentation d'OpenRouter « Provider Routing », relevée le 2026-10-30 ; à re-vérifier
  avant d'écrire.
- **`AiProviderCatalogue::describe()`** rend, pour chaque fournisseur, `selectable` et la raison quand il ne l'est
  pas :
  - `key_missing` ;
  - `host_not_allowed`.

  La console l'affiche. `UpdateAiRoleRequest`, `UpdateAiUsageRequest`, `StoreAiEvaluationRequest`, `AiModelController`
  (TCK-2448) et `ai:eval` refusent un fournisseur non sélectionnable.
- **La sonde de santé** (`HealthcheckService`) signale un fournisseur dont la clé est posée mais l'adresse hors de ses
  hôtes. Le motif s'ajoute aux concordances de `HealthcheckMotifsConcordanceTest`.

## Direction UX / Artistique

Carte des fournisseurs de la console IA existante : pour chaque fournisseur, un état sobre (prêt, clé absente, adresse
non acceptée) en texte, jamais la clé ni l'adresse complète. L'hôte seul peut s'afficher.

## Contraintes strictes (métier)

- **Aucune clé, aucune adresse dans la base ni dans la console** (ADR-0076 §3, ADR-0085). Aucune route ne les rend.
- **Un fournisseur n'est sélectionnable que s'il est complet** : déclaré, nommé par `privacy.ts`, avec une clé
  présente et l'hôte de son adresse dans `allowed_hosts` (ADR-0085 §4). La comparaison d'hôte est exacte, sans
  joker. `https` est seul accepté hors `local` et `testing`.
- **La politique de confidentialité nomme OpenAI et OpenRouter** dans la puce « Intelligence artificielle » de
  `privacy.ts` § 4.3, en fr et en en, et dit qu'OpenRouter achemine vers le fournisseur du modèle choisi. Le
  marqueur ⚠ « à vérifier » existant est conservé : la formulation est à relire par l'avocat. La garde
  `check-ai-providers-privacy.mjs` doit passer.
- **`check-ai-providers-privacy.mjs` est étendue** : chaque entrée de `providers` déclare `allowed_hosts`, non vide.
  Ajouter un cas d'épreuve (`CAS_EPREUVE`).
- **Parité des environnements** : les clés neuves vont dans `.env.example` et `.env.docker`, vides
  (`scripts/check-env-parity.mjs`). Une clé vide ne doit pas écraser un défaut de `config/` (la CI lit
  `.env.example`) : l'adresse par défaut reste celle du fournisseur.
- **`store: false` sur l'entrée `openai`.** Par défaut, l'API Responses conserve les réponses au moins 30 jours (référence
  Responses, relevée le 2026-10-31), et le SDK n'envoie `store: false` que si l'entrée le déclare. À poser avant la
  première clé : le socle lui envoie des données personnelles. Le double de `providerFor()` garde ce réglage.
- **`provider.data_collection` doit valoir pour une entrée renommée.** `SocleAgent::providerOptions()` reçoit le pilote,
  jamais le nom de l'entrée : il ne peut pas lire seul le réglage d'une entrée `openrouter` nommée autrement. La passerelle
  doit le lui donner, par exemple par `configure()`, depuis l'entrée du maillon joué. Relevé par TCK-2449, non prototypé.
- **`provider.require_parameters` est à trancher et à écrire.** Sans lui, OpenRouter peut acheminer vers un point d'accès
  qui ignore le format de sortie, et rendre de la prose (`ai.response_invalid`). Avec lui, l'absence de point d'accès rend
  une erreur, que la bascule d'ADR-0085 (amendement du 2026-10-31) absorbe s'il reste un maillon.
- **Le double ne doit pas apparaître comme un fournisseur.** Il reste dans `config('ai.providers')` jusqu'à la fin du
  processus : `describe()` et les règles de validation doivent l'écarter (suffixe `AiGateway::TOOL_OUTPUT_SUFFIX`).
- **Aucun test ne joint un vrai fournisseur** (`Http::fake`).
- **Les chaînes de repli de `config('ai.roles')` restent sur Anthropic.** Aucun tarif OpenAI ou OpenRouter n'est
  écrit en configuration : les modèles s'ajoutent dans la console (TCK-2448).

## Delta à produire

- [ ] `config/ai.php` : entrées `openai` et `openrouter`, `allowed_hosts` sur chaque entrée, `anthropic` comprise,
      et `provider.data_collection` sur `openrouter`.
- [ ] `AiProviderCatalogue` : `selectable` et la raison ; règle de validation commune utilisée par les FormRequests,
      `AiModelController` et `ai:eval`.
- [ ] `AiGateway`, ou l'endroit qui joue le maillon : refuser un fournisseur non sélectionnable, avec un code `ai.*`,
      même si une chaîne en base le nomme encore ; options d'acheminement d'OpenRouter dans le corps de la requête.
- [ ] `HealthcheckService` : motif d'adresse non acceptée.
- [ ] `takussan-web/src/content/legal/privacy.ts` § 4.3, en fr et en en, et l'état du fournisseur dans la console,
      avec ses textes ; wo = fr.
- [ ] `scripts/check-ai-providers-privacy.mjs` : `allowed_hosts` exigé, et son cas d'épreuve.
- [ ] `.env.example`, `.env.docker` : `OPENAI_API_KEY`, `OPENAI_URL`, `OPENROUTER_API_KEY`, `OPENROUTER_URL`.
- [ ] `docs/infra/hebergement.md` : les clés de Dokploy, et la procédure « déclarer un point d'accès compatible OpenAI ».
      Une entrée nommée dans `config/ai.php` avec `legal_name` et `allowed_hosts`, la mention de `privacy.ts`, puis
      déploiement et clé.
- [ ] Tests :
  - [ ] `AiProviderSelectabilityTest` : clé absente ; hôte hors liste ; hôte accepté ; `http` refusé hors `testing` ;
  - [ ] refus par chaque point d'écriture : chaîne, modèle forcé, évaluation, ajout de modèle ;
  - [ ] corps de requête OpenRouter capturé portant `provider.data_collection: "deny"`, y compris sur une entrée
        `openrouter` au nom quelconque ;
  - [ ] corps de requête OpenAI capturé portant `store: false` ;
  - [ ] le double absent de `describe()` et refusé par les règles de validation ;
  - [ ] garde de forme des schémas tels qu'envoyés hors d'Anthropic : racine `object`, tout `required`,
        `additionalProperties: false` (TCK-2449 l'a mesurée à la main, aucun test ne la tient) ;
  - [ ] passerelle qui refuse une chaîne en base nommant un fournisseur devenu non sélectionnable, et bascule au
        maillon suivant ;
  - [ ] Vitest de l'état du fournisseur ;
  - [ ] gardes de dictionnaire.
- [ ] Texte de spec proposé dans le rapport (features §2.11, règle « seuls les fournisseurs nommés… sélectionnables »).

## Critères d'acceptation

- [ ] **AC1** — Avec `OPENAI_API_KEY` posée et l'adresse par défaut, `openai` est sélectionnable : un modèle ajouté
      au catalogue s'affecte et la passerelle l'appelle (faux client HTTP).
- [ ] **AC2** — Une adresse dont l'hôte n'est pas dans `allowed_hosts` rend le fournisseur non sélectionnable. Toute
      affectation est refusée, une chaîne en base qui le nomme bascule au maillon suivant, et la sonde de santé le
      signale. L'hôte de l'adresse est le seul détail exposé.
- [ ] **AC3** — Sans clé, le fournisseur est affiché comme « clé absente » et ne reçoit aucun appel.
- [ ] **AC4** — Chaque requête vers `openrouter` porte `provider.data_collection` à la valeur de la configuration,
      `deny` par défaut.
- [ ] **AC5** — `check-ai-providers-privacy.mjs` rougit si une entrée n'a pas d'`allowed_hosts`, ou si un
      `legal_name` manque dans la puce fr ou en.
- [ ] **AC6** — `check-env-parity.mjs` est vert, et la suite (CI, sur `.env.example`) est verte avec les clés vides.

## Hors périmètre

- Poser une clé dans Dokploy ou activer un fournisseur : geste du porteur.
- Attester le mode strict d'un nouveau pilote par un vrai appel (TCK-2449).
- Déclarer un point d'accès compatible précis : à la demande du porteur, avec son nom et sa mention juridique.
- Un plafond de classe de données par fournisseur, et le rôle `embedding`.

## Notes d'implémentation

_(à remplir par implementing-specs)_
