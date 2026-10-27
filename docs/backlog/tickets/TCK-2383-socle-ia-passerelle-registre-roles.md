---
id: TCK-2383
title: "Socle IA : laravel/ai, rôles de modèle affectés en base, registre des usages et passerelle unique journalisée"
status: doing
phase: P1
family: back
estimate: L
wave: 80
created: 2026-10-26
updated: 2026-10-27
depends_on: []
blocks: [TCK-2384, TCK-2385, TCK-2386, TCK-344, TCK-2398, TCK-2399, TCK-2400]
spec_refs:
  features:
    - "docs/features.md#211-socle-ia"
  models: []
tags: [api, ia, socle-ia, laravel-ai, adr-0076]
---

## Objectif utilisateur

Le super-admin peut faire tourner n'importe quelle fonctionnalité IA de la plateforme sur le modèle
de son choix, sous budget, sans qu'aucune ligne de code applicatif ne nomme un modèle.

## Contexte

Lot 0 du [plan Radar et socle IA](../../plans/2026-10-26-radar-et-socle-ia.md), décidé par
[ADR-0076](../../adr/0076-le-socle-ia.md) §1 à §6. Mesuré sur `dev` `ac1ac129` : aucune IA dans le
dépôt, `laravel/ai` absent de `composer.json`. Ce ticket pose la fondation ; les suggestions et les
évaluations sont TCK-2384, la console TCK-2385.

## Contrat de données

- Table `ai_role_assignments` : l'affectation d'un rôle (enum fermé) à une chaîne ordonnée de
  maillons *fournisseur · modèle · plafond de tokens* (`max_tokens` seul : l'API d'Anthropic
  refuse `temperature`, `top_p` et `top_k` depuis le 2026-10-21).
- Table `ai_usage_settings` : par usage, le coupe-circuit (`enabled`), le modèle forcé et le
  plafond journalier réglés depuis la console. **Pas un `FeatureFlag`** : le catalogue `Flag` est
  fermé, et une clé hors catalogue y vaut faux (`FeatureFlagTest::test_unknown_flag_is_fail_closed`).
- Table `ai_calls` : le journal de chaque appel (ADR-0076 §5).
- Aucune route HTTP dans ce ticket : la console (TCK-2385) les ajoute.

## Contraintes strictes (métier)

- **Aucun identifiant de modèle hors de `config/ai.php`** et des jeux d'évaluation.
- **Repli** : sans ligne en base pour un rôle, la chaîne vient de `config/ai.php`. Une base vide
  ne doit jamais rendre le socle inopérant.
- **Les clés des fournisseurs viennent de l'environnement**, jamais de la base.
- **Fournisseurs sélectionnables = liste fermée en configuration** (`ai.providers`). Une garde
  vérifie qu'elle concorde avec les sous-traitants nommés par
  `takussan-web/src/content/legal/privacy.ts` (ADR-0076 §3).
- **Ordre de la passerelle**, non négociable : autorité de l'appelant → coupe-circuit → budget →
  données (refus, masquage) → cache → appel avec bascule → journal. Un appel refusé (autorité,
  coupe-circuit, budget, données) est **journalisé aussi**, avec son motif.
- **Classe de données** : `publique` · `personnelle` · `sensible`. Une charge contenant une donnée
  `sensible` est refusée avant l'appel, quel que soit l'usage.
- Budget par agence : `ai_calls.agency_id` est renseigné quand l'appel agit pour une agence ;
  `null` pour un usage de plateforme (le Radar).
- Coût estimé calculé depuis une table de tarifs en configuration, par modèle ; un modèle sans
  tarif est journalisé avec `cost_estimate` nul **et un avertissement**, jamais un coût inventé.

## Delta à produire

- [ ] `composer require laravel/ai`. Relire les migrations que le paquet publie : ne garder que
      celles qu'un usage exige (les conversations du SDK ne le sont pas au lot 0), le noter.
- [ ] `config/ai.php` : fournisseurs (liste fermée), rôles et chaînes par défaut, tarifs, budgets
      par défaut, taux de conversion USD → XOF. Clés `.env.example` et `.env.docker` (vides) :
      `ANTHROPIC_API_KEY`, `AI_DAILY_BUDGET_XOF`, `AI_USD_TO_XOF`.
- [ ] Enum `App\Models\Enums\AiModelRole` (`extraction`, `redaction`, `raisonnement`, `vision`,
      `embedding`) et `App\Models\Enums\AiDataClass`.
- [ ] Migration `create_ai_role_assignments_table` · modèle `AiRoleAssignment`.
- [ ] Migration `create_ai_usage_settings_table` · modèle `AiUsageSetting`.
- [ ] Migration `create_ai_calls_table` (usage, rôle, fournisseur, modèle, version du prompt,
      tokens entrée/sortie/cache, `cost_estimate`, durée, issue, motif de refus, `agency_id`,
      objet polymorphe) · modèle `AiCall`.
- [ ] `App\Services\Ai\AiUsage` (contrat) et `App\Services\Ai\AiUsageRegistry` : déclaration
      d'un usage (clé, rôle, prompt, budget, autorité requise — `Capability` ou
      `PlatformAbility` —, classe de données).
- [ ] `App\Services\Ai\ModelResolver` : rôle → chaîne (base, sinon configuration), modèle forcé
      d'usage prioritaire.
- [ ] `App\Services\Ai\AiGateway` : l'unique point d'appel, dans l'ordre des contraintes.
- [ ] `App\Services\Ai\AiBudget` (global journalier, par usage, par agence, en XOF).
- [ ] Coupe-circuit par usage : `ai_usage_settings.enabled` (faux ⇒ refus `kill_switch`).
- [ ] Garde `scripts/check-ai-usages.mjs` : tout agent `laravel/ai` sous `app/Ai/Agents/` est
      déclaré au registre ; aucun identifiant de modèle hors de `config/ai.php`.
- [ ] Garde `scripts/check-ai-providers-privacy.mjs` : `ai.providers` ⊆ sous-traitants de
      `privacy.ts`.
- [ ] `takussan-web/src/content/legal/privacy.ts` § 4.3 (`fr` et `en`) : une puce « Intelligence
      artificielle » qui nomme chaque fournisseur de `ai.providers`, en termes génériques (des
      contenus que certaines fonctionnalités lui soumettent ; jamais de donnée sensible) ;
      `VERSION_DOCUMENTS` avance. C'est la PR qui ajoute un fournisseur qui le déclare : la garde
      ci-dessus l'impose.
- [ ] Sections `docs/models-spec.md` pour `AiRoleAssignment`, `AiUsageSetting` et `AiCall`.
- [ ] Tests : `AiGatewayTest` (ordre, refus journalisés, bascule sur panne du premier maillon,
      cache par empreinte), `AiBudgetTest`, `ModelResolverTest` (base, repli, modèle forcé),
      `AiSensitiveDataTest`. **Tous sur les faux modèles du SDK** : aucun appel réseau.

## Critères d'acceptation

- [x] AC1 — Un usage déclaré appelle le modèle affecté à son rôle en base ; sans ligne en base,
      celui de `config/ai.php` ; avec un modèle forcé, celui-là.
- [x] AC2 — Le premier maillon en erreur fait passer au suivant, et `ai_calls` porte les deux
      lignes (l'échec et la réussite).
- [x] AC3 — Budget épuisé : aucun appel au fournisseur (le faux modèle n'est **pas** sollicité),
      une ligne `ai_calls` au motif `budget`.
- [x] AC4 — Usage coupé (`ai_usage_settings.enabled` à faux) : même chose, au motif
      `kill_switch`, et le coupe-circuit est jugé avant le budget.
- [x] AC5 — Une charge marquée `sensible` est refusée avant l'appel, quel que soit l'usage.
- [x] AC6 — Deux appels au contenu identique : un seul appel au fournisseur, le second journalisé
      `cache_hit`.
- [x] AC7 — Ajouter un agent sous `app/Ai/Agents/` sans le déclarer fait rougir
      `check-ai-usages.mjs` ; écrire un identifiant de modèle dans un service aussi.
- [x] AC8 — Ajouter à `ai.providers` un fournisseur absent de `privacy.ts` fait rougir
      `check-ai-providers-privacy.mjs`.
- [x] AC9 — Chaque test ci-dessus rougit quand on retire la ligne qu'il protège (ablation).

## Hors périmètre

- `ai_suggestions`, prompts versionnés, `ai:eval` (TCK-2384).
- Toute route et tout écran (TCK-2385).
- La table `embeddings` (créée par son premier usager : TCK-2392 ou TCK-344).
- La facturation de l'IA en crédits d'espace.
- Les finalités propres au Radar dans `privacy.ts` et l'article 6.3 de `terms.ts` (TCK-2389).

## Notes d'implémentation

Livré sur `feat/socle-ia-lot-0` (non fusionné : `doing`), 2026-10-27.

- `laravel/ai` v1.3.0 (+ `symfony/yaml`) ; ses migrations publiables n'ont pas été publiées (ADR-0076 §1).
- `config/ai.php` : fournisseur `anthropic` (avec `legal_name`, gardé contre `privacy.ts` par
  `scripts/check-ai-providers-privacy.mjs`), chaînes par rôle, grille de prix, `usd_to_xof`, budgets,
  `timeout_seconds` (300 s, plafonné à `SocleAgent::MAX_TIMEOUT_SECONDS` = 900 ; le SDK en posait 60).
- Registre fermé des usages (`AiUsageRegistry`), `SocleAgent`, prompts versionnés figés par
  `versions.lock.json`, garde `scripts/check-ai-usages.mjs` (agent non déclaré, `extends SocleAgent`
  hors du dossier, identifiant de modèle hors de `config/ai.php` et des jeux d'évaluation).
- `ai_role_assignments`, `ai_usage_settings`, `ModelResolver` (repli sur la configuration),
  `ai_calls` + `AiCostCalculator`, `AiBudget`, `AiDataGuard` + `PhoneMasker` (espaces insécables,
  échec fermé sur erreur PCRE), `AiAuthority` (une capacité sans agence est refusée explicitement).
- `AiGateway` dans l'ordre amendé d'ADR-0076 §5 ; cache réservé aux usages `publique` ; une panne du
  cache ne perd pas une réponse payée ; un rôle sans chaîne est journalisé (`ai.role_unassigned`).
- Écarts au plan, tous relus : température retirée (Anthropic la refuse depuis le 2026-10-21) ;
  coupe-circuit dans `ai_usage_settings` et non un drapeau `Flag`.
- Mesures : suite backend entière 9777 verts sur PostgreSQL (2026-10-27, 3273 s, `load` 2,99 → 2,10,
  8 cœurs) — seuls rouges : 3 cas de `SeedingTextAndDeterminismTest`, **rouges aussi sur la base
  de la branche** (`7dc1b8e6`, rejouée en worktree), donc antérieurs. Ablations faites tâche par
  tâche (rapports de revue).
- Épreuve réelle (base jetable, supprimée ensuite) : test de connexion par la passerelle →
  `claude-haiku-5-5`, `success`, 1036 ms, 55/4 tokens. `cost_estimate` = 0,00 : ≈ 0,005 XOF arrondi à
  deux décimales.
- Suites à ouvrir avant le premier usage réel : aide de délimitation du contenu externe et garde
  contre les outils (ADR-0076 §10) ; `stop_reason` (refus, troncature) journalisé ; `error_code`
  ramené à des codes `ai.*` ; motifs de téléphone non masqués (30/34/71/79, `77 12 34 567`,
  `77/123/45/67`, chiffres pleine chasse).
