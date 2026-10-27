---
id: TCK-2384
title: "Socle IA : suggestions décidées par un humain, prompts versionnés et évaluations à cliquet (ai:eval)"
status: done
phase: P1
family: back
estimate: M
wave: 80
created: 2026-10-26
updated: 2026-10-27
depends_on: [TCK-2383]
blocks: [TCK-2385, TCK-2386, TCK-2398, TCK-2400]
spec_refs:
  features:
    - "docs/features.md#211-socle-ia"
  models: []
tags: [api, ia, socle-ia, evaluations, adr-0076]
---

## Objectif utilisateur

Le super-admin sait si un modèle ou un prompt fait bien son travail, avant de l'adopter (score
d'évaluation) et après (taux d'acceptation en production), et chaque correction humaine rend
l'outil mieux vérifié.

## Contexte

Lot 0 du [plan Radar et socle IA](../../plans/2026-10-26-radar-et-socle-ia.md),
[ADR-0076](../../adr/0076-le-socle-ia.md) §6 à §8. Fait suite à TCK-2383 (passerelle). Le cliquet
reprend l'esprit de celui de la couverture (`bin/coverage-gate.php`).

## Contrat de données

- Table `ai_suggestions` : usage, objet polymorphe, proposition (jsonb), confiance, `ai_call_id`,
  décision (`pending` · `accepted` · `edited` · `rejected`), auteur et date de la décision,
  **différentiel de la correction** (jsonb).
- Prompts : fichiers sous `takussan-api/resources/ai/prompts/<usage>/v<N>.md`.
- Jeux d'évaluation : `takussan-api/resources/ai/evals/<usage>/cases/*.json` (entrée, sortie attendue)
  et le score de référence dans `takussan-api/resources/ai/evals/<usage>/baseline.json`.

## Contraintes strictes (métier)

- **La version du prompt est inscrite à chaque appel** (`ai_calls.prompt_version`) ; un prompt
  modifié est une nouvelle version, jamais une réécriture de l'ancienne.
- **Un cas d'évaluation ne contient aucune donnée personnelle réelle** : téléphones, noms et
  adresses précises sont remplacés avant d'entrer dans le dépôt. La commande d'export (ci-dessous)
  anonymise, et une garde refuse un numéro sénégalais plausible dans `resources/ai/evals/`.
- **`ai:eval` n'est jamais lancé par la suite de tests ni par la CI des PR** : il appelle de vrais
  modèles et coûte. Il se lance à la main et par une tâche planifiée de nuit.
- **Cliquet** : un score inférieur à `baseline.json` fait sortir la commande en échec. Relever la
  référence est un acte explicite (`--update-baseline`), jamais automatique.
- Le score se calcule **par champ** (exactitude), plus un score global et un coût total ; la
  comparaison champ à champ sait traiter les nombres (tolérance déclarée par champ) et les listes.

## Delta à produire

- [x] Migration `create_ai_suggestions_table` · modèle `AiSuggestion` · service
      `App\Services\Ai\SuggestionRecorder` (créer depuis une réponse de la passerelle, décider,
      calculer le différentiel).
- [x] `App\Services\Ai\PromptRepository` : charge `resources/ai/prompts/<usage>/v<N>.md`, rend
      la version ; l'usage déclare sa version courante.
- [x] Commande `ai:eval {usage} {--model=} {--update-baseline}` : joue les cas, écrit le rapport
      (score par champ, global, coût, modèle, version du prompt) sous `storage/ai-evals/`.
- [x] Commande `ai:export-eval-cases {usage} {--since=}` (forme `domaine:verbe`, `check-command-prefixes.mjs`) : transforme les suggestions corrigées
      (`edited`) en cas d'évaluation **anonymisés**.
- [x] Garde `scripts/check-ai-evals-pii.mjs` : aucun numéro sénégalais plausible ni e-mail dans
      `resources/ai/evals/`.
- [x] Tâche planifiée nocturne `ai:eval --all`, inscrite au suivi des tâches planifiées, qui ne
      fait rien si aucun fournisseur n'a de clé.
- [x] Taux d'acceptation par usage : requête de lecture prête pour la console (TCK-2385).
- [x] Section `docs/models-spec.md` pour `AiSuggestion`.
- [x] Tests : `SuggestionRecorderTest` (différentiel), `PromptRepositoryTest`, `AiEvalCommandTest`
      (sur faux modèles : score, cliquet, `--update-baseline`), `AiEvalExportTest` (anonymisation).

## Critères d'acceptation

- [x] AC1 — Une suggestion corrigée enregistre le différentiel exact entre la proposition et la
      valeur retenue, et passe en `edited`.
- [x] AC2 — Un appel inscrit dans `ai_calls` la version du prompt réellement chargé.
- [x] AC3 — `ai:eval` sur un jeu de cas avec un faux modèle qui se trompe sur un champ rend un
      score par champ qui le montre, et sort en échec sous la référence.
- [x] AC4 — `--update-baseline` est le seul chemin qui modifie `baseline.json`.
- [x] AC5 — `ai:export-eval-cases` produit des cas sans le téléphone ni le nom d'origine (vérifié sur une
      suggestion qui en contient).
- [x] AC6 — Un numéro `77 123 45 67` déposé dans `resources/ai/evals/` fait rougir la garde.
- [x] AC7 — Aucun test de la suite n'ouvre de connexion réseau vers un fournisseur.

## Hors périmètre

- Les écrans (TCK-2385).
- Les jeux de cas du Radar (TCK-2386 écrit le premier).

## Notes d'implémentation

Livré sur `feat/socle-ia-lot-0` (non fusionné : `doing`), 2026-10-27.

- `ai_suggestions` + `SuggestionRecorder` : décision prise une seule fois par un `UPDATE`
  conditionnel en base, différentiel canonique (clés triées, entier et flottant unifiés, chaînes
  numériques non converties) ; `acceptanceRates($since, $until)`.
- `FieldScorer` (listes de scalaires et d'objets, ces derniers comparés par leur JSON canonique),
  `EvaluationRunner` (un cas en échec vaut 0 sur tous ses champs ; `verdict()` rend
  `ai.eval.failures`, `ai.eval.baseline_stale`, `ai.eval.below_baseline` ou rien), commande
  `ai:eval` (refuse `--update-baseline` sur un échec ; `--all` sans aucun jeu sort en succès),
  planifiée chaque nuit à 02:30.
- Jeux d'évaluation sous `resources/ai/evals/<usage>/` (cas, `fields.json`, `baseline.json`) — **et
  non `tests/AiEvals/`**, que l'image de l'API n'embarque pas (`.dockerignore`) ; les rapports de
  passage vont sous `storage/ai-evals`.
- `ai:export-eval-cases` + `EvalCaseAnonymizer` : noms partiels, en majuscules, sans accents, coupés
  par une espace insécable ou un caractère invisible, noms de deux lettres (Ba, Ly, Sy) et à
  apostrophe (N'Diaye ⇄ Ndiaye), courriels et téléphones ; clés personnelles en camelCase, au pluriel,
  en liste ou numériques. Garde `scripts/check-ai-evals-pii.mjs` : elle décode le JSON (valeurs,
  clés, nombres) et lit aussi le texte brut (clés en double).
- AC7 tient par les faux modèles du SDK et `ANTHROPIC_API_KEY` vidée dans `phpunit.xml` ; un
  `Http::preventStrayRequests()` le rendrait structurel (suite proposée).
- Restes acceptés, relevés en revue : sur-masquage de clés comme `phone_count` ou `type_name` ;
  un prix à 9 chiffres en 70/75/76/77/78/33 fait rougir la garde (à corriger à la main) ;
  `AwaDiop` collé et double obfuscation par caractères invisibles non couverts.
