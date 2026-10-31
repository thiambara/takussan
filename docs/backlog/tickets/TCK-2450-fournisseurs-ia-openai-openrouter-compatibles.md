---
id: TCK-2450
title: "Socle IA : déclarer OpenAI, OpenRouter et les points d'accès compatibles OpenAI — clé et adresse dans l'environnement, hôtes acceptés en configuration (ADR-0085)"
status: done
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
  marqueur ⚠ « à vérifier » existant est conservé. La garde
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

- [x] `config/ai.php` : entrées `openai` et `openrouter`, `allowed_hosts` sur chaque entrée, `anthropic` comprise,
      et `provider.data_collection` sur `openrouter`.
- [x] `AiProviderCatalogue` : `selectable` et la raison ; règle de validation commune utilisée par les FormRequests,
      `AiModelController` et `ai:eval`.
- [x] `AiGateway`, ou l'endroit qui joue le maillon : refuser un fournisseur non sélectionnable, avec un code `ai.*`,
      même si une chaîne en base le nomme encore ; options d'acheminement d'OpenRouter dans le corps de la requête.
- [x] `HealthcheckService` : motif d'adresse non acceptée.
- [x] `takussan-web/src/content/legal/privacy.ts` § 4.3, en fr et en en, et l'état du fournisseur dans la console,
      avec ses textes ; wo = fr.
- [x] `scripts/check-ai-providers-privacy.mjs` : `allowed_hosts` exigé, et son cas d'épreuve.
- [x] `.env.example`, `.env.docker` : `OPENAI_API_KEY`, `OPENAI_URL`, `OPENROUTER_API_KEY`, `OPENROUTER_URL`.
- [x] `docs/infra/hebergement.md` : les clés de Dokploy, et la procédure « déclarer un point d'accès compatible OpenAI ».
      Une entrée nommée dans `config/ai.php` avec `legal_name` et `allowed_hosts`, la mention de `privacy.ts`, puis
      déploiement et clé.
- [x] Tests :
  - [x] `AiProviderSelectabilityTest` : clé absente ; hôte hors liste ; hôte accepté ; `http` refusé hors `testing` ;
  - [x] refus par chaque point d'écriture : chaîne, modèle forcé, évaluation, ajout de modèle ;
  - [x] corps de requête OpenRouter capturé portant `provider.data_collection: "deny"`, y compris sur une entrée
        `openrouter` au nom quelconque ;
  - [x] corps de requête OpenAI capturé portant `store: false` ;
  - [x] le double absent de `describe()` et refusé par les règles de validation ;
  - [x] garde de forme des schémas tels qu'envoyés hors d'Anthropic : racine `object`, tout `required`,
        `additionalProperties: false` (TCK-2449 l'a mesurée à la main, aucun test ne la tient) ;
  - [x] passerelle qui refuse une chaîne en base nommant un fournisseur devenu non sélectionnable, et bascule au
        maillon suivant ;
  - [x] Vitest de l'état du fournisseur ;
  - [x] gardes de dictionnaire.
- [x] Texte de spec proposé dans le rapport (features §2.11, règle « seuls les fournisseurs nommés… sélectionnables »).

## Critères d'acceptation

- [x] **AC1** — Avec `OPENAI_API_KEY` posée et l'adresse par défaut, `openai` est sélectionnable : un modèle ajouté
      au catalogue s'affecte et la passerelle l'appelle (faux client HTTP).
- [x] **AC2** — Une adresse dont l'hôte n'est pas dans `allowed_hosts` rend le fournisseur non sélectionnable. Toute
      affectation est refusée, une chaîne en base qui le nomme bascule au maillon suivant, et la sonde de santé le
      signale. L'hôte de l'adresse est le seul détail exposé.
- [x] **AC3** — Sans clé, le fournisseur est affiché comme « clé absente » et ne reçoit aucun appel.
- [x] **AC4** — Chaque requête vers `openrouter` porte `provider.data_collection` à la valeur de la configuration,
      `deny` par défaut.
- [x] **AC5** — `check-ai-providers-privacy.mjs` rougit si une entrée n'a pas d'`allowed_hosts`, ou si un
      `legal_name` manque dans la puce fr ou en.
- [ ] **AC6** — `check-env-parity.mjs` est vert, et la suite (CI, sur `.env.example`) est verte avec les clés vides.

## Hors périmètre

- Poser une clé dans Dokploy ou activer un fournisseur : geste du porteur.
- Attester le mode strict d'un nouveau pilote par un vrai appel (TCK-2449).
- Déclarer un point d'accès compatible précis : à la demande du porteur, avec son nom et sa mention juridique.
- Un plafond de classe de données par fournisseur, et le rôle `embedding`.

## Notes d'implémentation

- Vérifié sur la documentation le 2026-10-31, **jamais éprouvé** : aucune clé n'existe, aucun vrai appel n'a eu lieu.
- `store` et `provider` partent par `SocleAgent::providerOptions()`, que la passerelle remplit depuis l'entrée du maillon :
  le SDK ne donne à l'agent que le pilote.

### Décisions de la session, après la vérification adverse

- **Redirections.** Ni le corps ni la clé ne suivent une redirection, sur tous les pilotes, Anthropic compris
  (`ai.provider_redirected`, panne de maillon qui bascule). Le corps envoyé à Anthropic ne change pas.
- **OpenRouter.** Aucun filtre de pays imposé. `privacy.ts` § 4.3 et § 5 disent plusieurs pays, leurs conditions, et aucune
  protection présumée. `zdr`, `only`, `order` et `ignore` passent depuis l'entrée, sans être imposés.
- **CDP.** `privacy.ts` § 5 dit que les formalités ne sont pas accomplies. Pas de garde de code : geste du porteur, écrit en
  tête du runbook de `docs/infra/hebergement.md`.
- **Masquage.** Pas de changement de code : les usages `Personnelle` partent en clair vers tout pilote, comme déjà vers
  Anthropic, et `privacy.ts` § 4.3 le dit. `Sensible` est refusé sans requête, sur chaque pilote.
- **Coût.** Une réponse sans `usage` écrit `warning: usage_missing`, et le tableau de bord la compte dans
  `provider_rejections`, renommée « Défauts du fournisseur » à l'écran. **Le budget n'en est pas informé** : elle y vaut zéro.
- **AC6 reste décoché** : sa moitié CI n'a pas tourné. La session le coche sur la CI verte.

- **Fusion avec TCK-2423.** Les redirections couvrent aussi `embed()`, et une réponse d'embeddings sans `usage` écrit aussi
  `usage_missing`. `privacy.ts` § 4.3 porte les deux textes ; la phrase ⚠ sur l'entraînement ne nomme plus qu'Anthropic, OpenAI et
  OpenRouter, Voyage AI ayant la sienne.

### Limites écrites

- **La cause d'un 400 derrière un dernier maillon sans clé se perd** : l'exception est `ai.providers_unavailable`, avec pour
  cause `ai.provider_key_missing`, et la ligne du journal garde `ai.request_rejected`.
- **`check-ai-providers-privacy.mjs` ne voit pas `'provider' => [...$x]`**, et la table hôte → pilote ne voit que les hôtes écrits
  en toutes lettres. La passerelle complète par `deny` si la clé manque : seul un `allow` étalé passerait.
- **Rien ne vérifie le contrat de sous-traitance ni le geste CDP** avant la pose d'une clé : c'est l'ordre du runbook.

### Décisions prises en autonomie, à revoir

- **`selectable` et `reachable` n'ont plus qu'une réponse.** Une clé Voyage sans `training_opt_out` n'est plus sélectionnable, et
  ne s'affecte plus dans la console (`training_opt_out_undeclared`). Écarté : deux vérités, où la console disait « prêt » pour un
  fournisseur à qui rien ne part. **Conséquence : affecter Voyage à la chaîne `embedding` exige désormais la clé et la déclaration**,
  ce que TCK-2423 ne demandait pas.
- **Une redirection écrit aussi `warning: provider_rejected`, Anthropic compris**, pour se voir au tableau de bord. Écarté : la
  seule colonne des bascules, où elle se confond avec une panne ordinaire.
- **Une réponse sans `usage` sur un modèle sans tarif écrit `usage_missing`**, pas `model_unpriced` : le tarif absent reste dans
  le journal applicatif (`ai.model_unpriced`), et le tableau de bord ne compte que le premier.
- **La phrase « aucune donnée sensible » de `privacy.ts` devient « aucune demande que nous classons comme portant une donnée
  sensible »** : le code refuse une classe déclarée, il ne lit pas le contenu.
- **Le port se compare, et un port hors du schéma s'écrit dans `allowed_hosts`** (`hote:8443`). Le port du schéma, écrit ou non,
  vaut l'hôte seul.
- **La sonde `ai_providers` ne rend que son motif.** L'hôte reste lisible dans la console des fournisseurs, sous `platform.ai.view`.

- **`provider.require_parameters` : `true`, réglable sur l'entrée.** Écarté : `false`, où un point d'accès qui ignore le
  format de sortie rendrait de la prose. La documentation ne dit pas ce que rend une absence de point d'accès.
- **`store: false` forcé sur tout le pilote `openai`, sans réglage.** Écarté : suivre l'entrée, qui perdrait la promesse
  sur un oubli. Lever ce choix demanderait de changer `privacy.ts`.
- **Une entrée `openrouter` sans bloc `provider` vaut `deny`.** Écarté : ne rien envoyer, ce qui vaut `allow` chez OpenRouter.
- **Corriger ou retirer un modèle de la configuration reste permis sans clé.** Écarté : le refus, qui empêcherait de
  corriger un tarif avant la clé. Aucun modèle neuf n'entre ainsi, et la passerelle ne l'appelle pas.
- **Un forçage en base devenu non sélectionnable peut être gardé**, comme le permet déjà `keepsTheForcing()` : il
  n'empêche pas d'abaisser un plafond, et la passerelle ne l'appelle pas.
- **La phrase ⚠ sur l'entraînement reste telle quelle**, comme le demande ce ticket.
- **`TERMS_VERSION` avance avec la date des documents** (`check-terms-version.mjs` l'exige) : une preuve d'acceptation en
  cours sous l'ancienne date se redemande. Écarté : laisser l'ancienne date, que la garde refuse.
- **Nouvelle sonde `ai_providers`, `degraded`.** Écarté : `failed`, car les autres fournisseurs continuent de répondre.
