---
id: TCK-2448
title: "Socle IA : catalogue des modèles et de leurs tarifs en base, réglable dans la console (ADR-0085, ADR-0086)"
status: done
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

- [x] Migration `create_ai_models_table`, avec un `down()` juste.
- [x] Migration d'allongement des colonnes de modèle, avec un `down()` juste.
- [x] Migration des coûts et plafonds en `numeric` sans précision, avec un `down()` juste.
- [x] `AiCostCalculator`, `AiBudget`, `AiGateway`, `EvaluationRunner`, `AiDashboardController`, `AiUsageController`,
      `RadarDashboardController` et leurs requêtes en dollars, sans `float`.
- [x] Une garde qui rougit sur un `(float)` ou un cast `decimal:N` de ces montants.
- [x] Front : types, panneaux IA et Radar, formulaire du plafond.
- [x] `.env.example`, `.env.docker`, `docs/infra/hebergement.md` pour `AI_DAILY_BUDGET_USD`.
- [x] Modèle `App\Models\AiModel` et fabrique `AiModelFactory`.
- [x] Service `App\Services\Ai\AiModelCatalogue`, seule source de vérité de « tarifé et affectable », branché à la
      place des lectures directes de `config('ai.pricing')` :
  - [x] `ModelLink::isPriced()` ;
  - [x] `AiProviderCatalogue::describe()` et `cheapestModel()` ;
  - [x] `AiCostCalculator`.
- [x] Contrôleur `App\Http\Controllers\Api\Admin\AiModelController` et FormRequests `StoreAiModelRequest` et
      `UpdateAiModelRequest`.
- [x] Routes dans `routes/api/admin-ai.php`, inscrites dans `NamespaceAccessGuardTest`.
- [x] Console : section « Modèles », et sélecteurs branchés sur le catalogue.
- [x] Textes fr et en ; wo = fr (Wolof en pause).
- [x] Tests :
  - [x] `AiModelCatalogueTest` : union, priorité de la base, retrait d'un modèle de la configuration, tarif nul ;
  - [x] `AiModelControllerTest` : droits, second facteur, refus du retrait d'un modèle employé, journal ;
  - [x] assertions dans les tests existants de `AiRoleController`, `AiUsageController`, `AiEvaluationController`
        et `AiEval` : un modèle ajouté en base devient affectable, un modèle retiré ne l'est plus ;
  - [x] Vitest de la section.
- [x] Texte de spec proposé dans le rapport (features §2.11, models-spec : nouvelle table, et `forced_model` « tarifé
      au catalogue »), pour la PR de spec commune.

## Critères d'acceptation

- [x] **AC1** — Un modèle ajouté dans la console chez `anthropic`, absent de `config('ai.pricing')`, s'affecte à une
      chaîne, se force sur un usage et s'évalue, sans changer la configuration.
- [x] **AC2** — Un modèle de la configuration retiré dans la console ne s'affecte plus (422), et reste affiché comme
      retiré.
- [x] **AC3** — Retirer un modèle employé par une chaîne en base, par un modèle forcé ou par une chaîne de repli de la
      configuration est refusé, et la réponse nomme ces emplois.
- [x] **AC4** — Un tarif corrigé dans la console change le coût des appels suivants. Le `cost_estimate` des
      `ai_calls` antérieurs ne change pas.
- [x] **AC5** — Un tarif nul saisi est accepté, et l'appel coûte 0. Un tarif absent est refusé.
- [x] **AC6** — Sans `platform.ai.manage`, ou sans second facteur récent, toute écriture est refusée. Chaque écriture
      acceptée laisse une ligne `activity('Admin')`.
- [x] **AC7** — Un identifiant de 120 caractères, avec `/` et `:`, s'enregistre, s'affecte et se journalise dans
      `ai_calls` sans troncature.
- [x] **AC8** — Un appel à un modèle tarifé 0,00000000004 $ par million de tokens enregistre un coût non nul, exact au
      dernier chiffre, et la somme d'une journée de ces appels atteint le plafond attendu sans erreur d'arrondi. Sans le
      `numeric` ou avec un `float`, le test rougit.
- [x] **AC9** — Changer `AI_USD_TO_XOF` ne change ni un coût enregistré, ni un plafond, ni un blocage : seul l'affichage
      bouge.
- [x] **AC10** — La console affiche le coût en dollars et son équivalent « ≈ » en XOF. Un coût de 0,00000000004 $ ne
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

- **Le catalogue, seule source de « affectable » et du tarif** : `AiModelCatalogue`. `priceOf` lit aussi un modèle
  retiré, car un appel déjà en route se compte toujours ; `isAssignable` exige actif **et** fournisseur
  déclaré.
- **`AiMoney`** porte les quatre opérations d'argent sans `float` : l'échelle se déduit des opérandes, jamais d'une
  constante, pour qu'aucun chiffre ne tombe. `MontantIa` refuse un nombre JSON, entier compris : un nombre a déjà
  traversé un `float` chez l'appelant.
- **Le front ne calcule pas par `Number`** : `lib/format/montant-ia.ts` compare et multiplie sur des chaînes (BigInt
  sans littéral `n`, cible ES2017), et n'arrondit qu'à l'affichage. `Intl.NumberFormat.format(string)` garde
  l'exactitude.
- **`scripts/check-ai-money.mjs`** est la garde demandée : son jeu d'épreuve contient les motifs qu'elle doit
  attraper, et elle a rougi sur un `(float)` dans `AiBudget` et un cast `decimal:2` dans `AiCall` introduits à la main.
- **Le paramètre `{model}` n'est pas lié** (`string`, puis `findOrFail((int))`) : la liaison rendait 404 avant le droit,
  ce que `NamespaceAccessGuardTest` refuse.
- **Le verrou d'évaluation passe par `sha1`** : `cache_locks.key` est à 255, et un identifiant de modèle peut l'être
  aussi.
- **`AiModel` a été exclu de `scripts/check-models-spec.mjs`** jusqu'à la PR de spec commune du lot 5, qui a écrit sa
  section et retiré l'exclusion.
- Plafonds par défaut, XOF actuels divisés par 600 et arrondis : global 5000 → 8.33 ; `radar.extraction` 2000 → 3.33 ;
  vérification d'accord 1500 → 2.50 ; message d'accord 300 → 0.50 ; test de connexion 100 → 0.17.
- **Vérification adverse du même jour** : garde élargie, chaque endpoint éprouvé sur un montant minuscule, retour à la
  configuration, `whereNumber` sur la route. Une règle `bail` et une garde du fournisseur essayées pour le 500 du NUL ont été
  retirées : leurs ablations restaient vertes, `Unique` ne joue pas après l'échec d'une règle du même champ.
- **Abaisser un plafond ne dépend jamais du forçage** : le front n'envoie `forced_*` que si le choix a changé, et l'API
  (`UpdateAiUsageRequest::keepsTheForcing`) ne rejuge ni le tarif ni le fournisseur d'un couple égal à celui en base. Un modèle
  retiré, sorti de `config/ai.php`, ou un fournisseur sorti, n'empêche donc pas de plafonner un usage dont le modèle reste appelé.
- **`IdentifiantDeModele`** s'applique partout où un modèle s'écrit : PDO coupe le paramètre au NUL, `neuf\0junk` trouvait `neuf`.
- **Vérifié au navigateur** (2026-10-31, base isolée) : ajout d'un modèle `fournisseur/essai-navigateur:v1` à
  0,00000000004 $, refus du retrait de `claude-sonnet-5-5` nommant les chaînes de repli, modèle retiré atténué, onglets
  Coûts et Usages, compteur Radar : `$0.00000000004 ≈ 0,000000024 F CFA`. Sans clé de fournisseur : aucun appel réel. À 375 px, dialogues du modèle et de l'usage à 343 px et celui de la chaîne à 375 px avec un identifiant de 255 caractères, page sans débordement ; retour à la configuration de `claude-opus-5-5` de 9 $ à 4 $ ; modèle retiré employé signalé.

## Décisions prises en autonomie, à revoir

1. **Identifiant de modèle à 255 caractères** (le ticket : au moins 120), colonnes et requêtes. Le `down()` efface un
   modèle forcé trop long, et tronque le journal à 80.
2. **Retour à la configuration** (décision du porteur après vérification, qui remplace « retrait par `active` seulement ») :
   `DELETE admin/ai/models/{model}` efface la ligne qui remplace un modèle de la configuration, sous le même geste, second
   facteur et journal (`super_admin_ai_model_reverted`), et le tarif de configuration s'applique de nouveau. Le modèle reste
   au catalogue, donc le refus d'emploi ne s'y applique pas. Sans entrée de configuration : 409 `ai.model_not_in_config`,
   le modèle se retire par `active`. La console offre « Revenir à la configuration », sous une confirmation
   qui dit qu'un modèle retiré en est rétabli.
3. **Modèle de configuration corrigé ou retiré : un `POST` crée sa ligne** ; un doublon rend 422 sur `model`.
4. **Refus de retrait en 409 `ai.model_in_use`**, avec `uses`. Une chaîne de repli de la configuration compte même
   quand le rôle a une chaîne en base : si la ligne disparaît, le repli joue.
5. **Montants d'API : chaînes seules**, nombre JSON refusé ; longueur bornée à 200 ; l'ancien maximum de plafond
   (100 000 000) n'est pas conservé.
6. **Identifiant sans espace, sans caractère de contrôle ni invisible** (`/^[^\s\p{C}\p{Z}]+$/u`). Un octet NUL rendait 500.
7. **`isAssignable` exige un fournisseur déclaré** ; une ligne d'un fournisseur retiré de la configuration n'est pas
   listée, et reste en base.
8. **Un tarif de modèle retiré compte toujours au coût.**
9. **`down()` monétaire** : rétablit des colonnes `numeric(14,2)` vides, sans reconversion (le ticket dit qu'il n'y a
   aucune donnée à reprendre).
10. **Affichage** : dollar au format `$1.00` dans toutes les langues, XOF en `F CFA` ; 3 chiffres significatifs sous
    0,01 $ et sous 1 XOF ; tarifs exacts jusqu'à 100 décimales, limite d'`Intl`.
11. **Haiku `cache_read` à 0,01** : le commentaire « non publié » est retiré comme le ticket le demande ; le relevé
    officiel n'a pas été refait ici.

**Limites connues.**

- Un retrait et une affectation simultanés peuvent se croiser : aucun verrou commun, et c'est voulu. Le coût reste compté et
  le budget s'applique. La console signale ce modèle (« Retiré, mais encore employé : … ») et ne l'atténue pas.
- Le test de connexion prend le modèle actif le moins cher, même ajouté avec une faute de frappe : le test échoue alors sur un
  fournisseur sain.
- Le compteur Radar affiche brièvement « ≈ — » et « sans plafond » au chargement.
- Une variable `AI_DAILY_BUDGET_XOF` posée dans Dokploy n'a plus d'effet : Dokploy n'a pas été relu, c'est au porteur de le
  vérifier. Les rapports d'évaluation déjà en base portent `cost_xof` et s'affichent « — ».
- `check-ai-money` ne voit ni `$spent >= $cap` en PHP, ni la somme d'une collection, ni `sprintf('%.2f')`, ni `$usd + 0`, ni
  une échelle `bcmath` figée, ni `::numeric(14,2)` : son en-tête le dit, et
  `AiTinyAmountsInEveryEndpointTest` tient chaque endpoint au dernier chiffre.
