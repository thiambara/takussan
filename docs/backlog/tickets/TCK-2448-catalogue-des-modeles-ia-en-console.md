---
id: TCK-2448
title: "Socle IA : catalogue des modèles et de leurs tarifs en base, réglable dans la console (ADR-0085, ADR-0086)"
status: doing
phase: P1
family: full
estimate: L
wave: 80
created: 2026-10-30
updated: 2026-10-31
depends_on: []
blocks: [TCK-2450]
spec_refs:
  features:
    - "docs/features.md#211-socle-ia"
  models:
    - "docs/models-spec.md#102-airoleassignment-"
    - "docs/models-spec.md#103-aiusagesetting-"
tags: [api, front, ai, console, adr-0085, adr-0086, adr-0076]
---

## Objectif utilisateur

Le super-admin ajoute un modèle d'un fournisseur déjà déclaré, corrige son tarif ou le retire depuis la console IA,
sans attendre un déploiement, puis l'affecte à un rôle après l'avoir évalué.

Il lit et règle coûts et plafonds en dollars, avec leur équivalent approximatif en XOF, et un modèle aussi peu cher
soit-il continue d'être compté (ADR-0086).

## Contrat de données

- **Aujourd'hui** (`dev` `20c2538a4`), un modèle n'est affectable que s'il est tarifé dans `config('ai.pricing')`.
  Ce contrôle est fait par `ModelLink::isPriced()`, lu par `AiRoleController`, `AiUsageController`,
  `AiEvaluationController` et `ai:eval --model`, et par `AiProviderCatalogue::describe()` (`models`) et
  `cheapestModel()` (test de connexion). Le coût d'un appel est calculé par `AiCostCalculator::estimate()`.
- **Nouvelle table** `ai_models`, nouveau modèle `App\Models\AiModel` :
  - `provider` (clé du bloc `providers` de `config/ai.php`) ;
  - `model` : identifiant exact du fournisseur, y compris `éditeur/modèle` (OpenRouter) et un suffixe `:…` ;
  - `input`, `output`, `cache_read`, `cache_write` : `numeric` sans précision (ADR-0086), dollars US par million de
    tokens, ≥ 0, non nuls ;
  - `active` (booléen) ;
  - `updated_by_id`, nullable, `nullOnDelete` ;
  - horodatages ;
  - unique sur `(provider, model)`.
- **Le catalogue est l'union** des lignes `ai_models` et des couples de `config('ai.pricing')`. Une ligne l'emporte
  sur la configuration pour le même couple, y compris pour retirer un modèle de la configuration.
- **Nouvelles routes** sous `routes/api/admin-ai.php` :
  - lecture `platform.ai.view` : `GET admin/ai/models` ;
  - écriture `platform.ai.manage` sous `ProtectedActions::STEP_UP` : `POST admin/ai/models`,
    `PATCH admin/ai/models/{model}` (tarifs, actif), et `DELETE`, ou un retrait par `active`, au choix de
    l'implémentation.
- **La longueur des identifiants de modèle** passe de 80 à au moins 120 caractères :
  - colonnes `ai_usage_settings.forced_model` et `ai_calls.model`, et toute colonne qui stocke un modèle ;
  - règles `max:80` de `UpdateAiRoleRequest`, `UpdateAiUsageRequest` et `StoreAiEvaluationRequest`.
- **Coûts et plafonds en dollars (ADR-0086)**. Aucune donnée à reprendre : `origin/preview` n'a pas `ai_calls`, et
  l'API n'a jamais servi en production.
  - `ai_calls.cost_estimate` (`decimal(14,2)`, XOF) est remplacée par `cost_estimate_usd`, `numeric` sans précision ;
  - `ai_usage_settings.daily_budget_xof` est remplacée par `daily_budget_usd`, `numeric` sans précision ;
  - `ai.budgets.daily_global_xof`, `daily_per_agency_xof` et `AI_DAILY_BUDGET_XOF` deviennent `…_usd` et
    `AI_DAILY_BUDGET_USD` ; `dailyBudgetXof()` devient `dailyBudgetUsd()`. Les défauts sont les valeurs XOF actuelles
    divisées par 600, arrondies et citées dans le rapport ;
  - les champs d'API `cost_xof`, `spent_today_xof`, `daily_budget_xof`, `default_daily_budget_xof`,
    `global_spent_today_xof`, `global_daily_budget_xof`, `spent_xof` deviennent `…_usd`, en chaînes décimales. L'API rend
    aussi le taux `usd_to_xof`, pour l'équivalent affiché ;
  - les tarifs de `config('ai.pricing')` s'écrivent en chaînes. `claude-sonnet-5-5.cache_read` passe de 0,20 à 0,10
    (tarif officiel relevé le 2026-10-31), et le commentaire de Haiku, qui le dit non publié, est corrigé.

## Direction UX / Artistique

Console IA existante (`/super-admin/ai`) : une section « Modèles » sobre, sous les fournisseurs.

- **Liste par fournisseur**, avec les quatre tarifs lisibles en dollars par million de tokens.
- **Origine de chaque modèle** : réglé dans la console, ou venu de la configuration.
- **Un modèle retiré reste visible**, atténué.
- **Le formulaire d'ajout dit clairement** que l'identifiant doit être celui du fournisseur, et qu'un tarif nul
  signifie « gratuit au token », pas « inconnu ».
- **Un retrait refusé nomme** les rôles et les usages qui emploient encore le modèle.
- Le choix d'un modèle dans `AiChainDialog`, dans le modèle forcé d'un usage et dans l'évaluation ne propose que les
  modèles actifs du catalogue.
- **Montants** : le dollar d'abord, l'équivalent XOF à côté, marqué « ≈ ». Un montant minuscule garde assez de chiffres
  significatifs pour ne pas se lire 0. Le plafond se saisit en dollars.

## Contraintes strictes (métier)

- **Seul un modèle actif du catalogue s'affecte** : maillon de chaîne, modèle forcé, évaluation, `ai:eval --model`.
  Sinon, `ai.model_unpriced` est conservé, ou un code `ai.*` plus précis si l'implémentation en crée un.
- **Retirer, ou passer inactif, un modèle employé** par une chaîne en base ou un modèle forcé est refusé, en
  nommant ces emplois. Une chaîne de repli de la configuration qui l'emploie compte aussi : sinon le repli se
  casserait.
- **Un tarif absent est refusé, un tarif nul est accepté.**
- Un `provider` absent du bloc `providers` est refusé.
- Toute écriture est journalisée par `activity('Admin')`, comme `AiRoleController`, avec l'avant et l'après du tarif.
- **Le coût de l'appel lit le catalogue** : `AiCostCalculator` prend le tarif de la ligne en base si elle existe.
  Les `ai_calls` passés ne sont jamais recalculés.
- **Aucun identifiant de modèle n'est écrit dans le code applicatif** (`scripts/check-ai-usages.mjs`) : les
  fabriques et les tests en prennent un dans `config('ai.pricing')` ou en créent un fictif.
- **Aucun `float` PHP ne porte un coût, un tarif ou un plafond IA** (ADR-0086) : chaînes décimales, `bcmath`, `bccomp`
  ou SQL, sans cast `decimal:N`. Les plafonds SMS et les prix XOF du reste de la plateforme ne changent pas.
- Le taux `usd_to_xof` ne décide d'aucun blocage.
- Pas de `lower()` sur l'identifiant : la comparaison est exacte (sensible à la casse).

## Delta à produire

- [ ] Migration `create_ai_models_table`, avec un `down()` juste.
- [ ] Migration d'allongement des colonnes de modèle, avec un `down()` juste.
- [ ] Migration des coûts et plafonds en `numeric` sans précision, avec un `down()` juste.
- [ ] `AiCostCalculator`, `AiBudget`, `AiGateway`, `EvaluationRunner`, `AiDashboardController`, `AiUsageController`,
      `RadarDashboardController` et leurs requêtes en dollars, sans `float`.
- [ ] Une garde qui rougit sur un `(float)` ou un cast `decimal:N` de ces montants.
- [ ] Front : types, panneaux IA et Radar, formulaire du plafond.
- [ ] `.env.example`, `.env.docker`, `docs/infra/hebergement.md` pour `AI_DAILY_BUDGET_USD`.
- [ ] Modèle `App\Models\AiModel` et fabrique `AiModelFactory`.
- [ ] Service `App\Services\Ai\AiModelCatalogue`, seule source de vérité de « tarifé et affectable », branché à la
      place des lectures directes de `config('ai.pricing')` :
  - [ ] `ModelLink::isPriced()` ;
  - [ ] `AiProviderCatalogue::describe()` et `cheapestModel()` ;
  - [ ] `AiCostCalculator`.
- [ ] Contrôleur `App\Http\Controllers\Api\Admin\AiModelController` et FormRequests `StoreAiModelRequest` et
      `UpdateAiModelRequest`.
- [ ] Routes dans `routes/api/admin-ai.php`, inscrites dans `NamespaceAccessGuardTest`.
- [ ] Console : section « Modèles », et sélecteurs branchés sur le catalogue.
- [ ] Textes fr et en ; wo = fr (Wolof en pause).
- [ ] Tests :
  - [ ] `AiModelCatalogueTest` : union, priorité de la base, retrait d'un modèle de la configuration, tarif nul ;
  - [ ] `AiModelControllerTest` : droits, second facteur, refus du retrait d'un modèle employé, journal ;
  - [ ] assertions dans les tests existants de `AiRoleController`, `AiUsageController`, `AiEvaluationController`
        et `AiEval` : un modèle ajouté en base devient affectable, un modèle retiré ne l'est plus ;
  - [ ] Vitest de la section.
- [ ] Texte de spec proposé dans le rapport (features §2.11, models-spec : nouvelle table, et `forced_model` « tarifé
      au catalogue »), pour la PR de spec commune.

## Critères d'acceptation

- [ ] **AC1** — Un modèle ajouté dans la console chez `anthropic`, absent de `config('ai.pricing')`, s'affecte à une
      chaîne, se force sur un usage et s'évalue, sans changer la configuration.
- [ ] **AC2** — Un modèle de la configuration retiré dans la console ne s'affecte plus (422), et reste affiché comme
      retiré.
- [ ] **AC3** — Retirer un modèle employé par une chaîne en base, par un modèle forcé ou par une chaîne de repli de la
      configuration est refusé, et la réponse nomme ces emplois.
- [ ] **AC4** — Un tarif corrigé dans la console change le coût des appels suivants. Le `cost_estimate` des
      `ai_calls` antérieurs ne change pas.
- [ ] **AC5** — Un tarif nul saisi est accepté, et l'appel coûte 0. Un tarif absent est refusé.
- [ ] **AC6** — Sans `platform.ai.manage`, ou sans second facteur récent, toute écriture est refusée. Chaque écriture
      acceptée laisse une ligne `activity('Admin')`.
- [ ] **AC7** — Un identifiant de 120 caractères, avec `/` et `:`, s'enregistre, s'affecte et se journalise dans
      `ai_calls` sans troncature.
- [ ] **AC8** — Un appel à un modèle tarifé 0,00000000004 $ par million de tokens enregistre un coût non nul, exact au
      dernier chiffre, et la somme d'une journée de ces appels atteint le plafond attendu sans erreur d'arrondi. Sans le
      `numeric` ou avec un `float`, le test rougit.
- [ ] **AC9** — Changer `AI_USD_TO_XOF` ne change ni un coût enregistré, ni un plafond, ni un blocage : seul l'affichage
      bouge.
- [ ] **AC10** — La console affiche le coût en dollars et son équivalent « ≈ » en XOF. Un coût de 0,00000000004 $ ne
      s'y lit pas 0.

## Hors périmètre

- Déclarer un fournisseur, poser sa clé ou son adresse : configuration du déploiement (ADR-0085), TCK-2450.
- Lire les tarifs depuis l'API d'un fournisseur.
- Détecter qu'un fournisseur a changé ses prix, ou comparer les coûts à sa facture : le porteur y reviendra.
- Le tarif de Haiku au-delà de 100 000 tokens d'entrée.
- Le prompt caching : il reste éteint.
- La neutralité de `SocleAgent` : TCK-2449.
- Le rôle `embedding`.

## Notes d'implémentation

_(à remplir par implementing-specs)_
