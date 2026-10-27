---
id: TCK-2399
title: "Journal des appels IA : une réponse tronquée ou filtrée n'est plus un succès, et les erreurs portent des codes ai.* au lieu de noms de classe"
status: done
phase: P1
family: back
estimate: S
wave: 80
created: 2026-10-27
updated: 2026-10-27
depends_on: [TCK-2383, TCK-2385]
blocks: []
spec_refs:
  features:
    - "docs/features.md#211-socle-ia"
  models:
    - "docs/models-spec.md#104-aicall-"
    - "docs/models-spec.md#106-aievaluationrun-"
tags: [api, front, ia, socle-ia, journal, adr-0076]
---

## Objectif utilisateur

Le super-admin lit dans la console pourquoi un appel IA a échoué, dans sa langue, et une réponse
coupée en plein milieu ne compte pas comme un succès dans le tableau de bord.

## Contexte

Relevé par la revue finale du lot 0 (2026-10-27), à corriger avant le premier usage réel.

- **Fin de réponse.** `AiGateway` journalise `outcome = success` pour toute réponse HTTP 200, sans
  lire la raison de fin. `laravel/ai` l'expose (`Laravel\Ai\Responses\Data\FinishReason` : `stop`,
  `length`, `content_filter`, `error`…) : une sortie tronquée (`length`) ou filtrée
  (`content_filter`) passe donc pour réussie, et sa sortie structurée est inexploitable.
- **Codes d'erreur.** `error_code` reçoit `class_basename($e)` dans `AiGateway` (bascule et erreur),
  `Jobs\Ai\RunAiEvaluation` (échec et `failed()`) et `Admin\AiProviderController` (test de
  connexion) : un nom de classe PHP, instable d'une version du SDK à l'autre, que le front ne peut
  pas traduire (principe non négociable n°5 : l'API émet des codes).

## Contrat de données

- `ai_calls` : colonne `stop_reason` (cf. `docs/models-spec.md#104-aicall-`, à compléter par
  `/sync-specs` après fusion).
- `ai_calls.error_code`, `ai_evaluation_runs.error_code`, et `error_code` de
  `POST /api/admin/ai/providers/{provider}/test` : désormais des codes `ai.*`.

## Contraintes strictes (métier)

- `length` et `content_filter` sont des **échecs** du maillon : `outcome = error` (ou
  `failed_over` si un maillon suivant existe), codes `ai.response_truncated` et
  `ai.response_filtered`, et la passerelle bascule sur le maillon suivant comme pour toute erreur.
- Aucun nom de classe ni message de SDK ne sort par l'API (le message peut recopier la requête).
  Le nom de classe reste au journal Laravel pour le diagnostic.
- Tout code émis a son libellé `fr`/`en` côté front ; `wo` copie le français (pause du wolof).

## Delta à produire

- [x] Migration `add_stop_reason_to_ai_calls` (`string`, nullable, longueur bornée).
- [x] `App\Services\Ai\AiErrorCode::fromThrowable(Throwable): string` — table fermée des
      exceptions connues vers `ai.provider_timeout`, `ai.provider_rate_limited`,
      `ai.provider_unavailable`, `ai.provider_auth`, `ai.response_invalid`, repli
      `ai.unexpected`.
- [x] `AiGateway` : lit la raison de fin, la journalise dans `stop_reason`, applique la règle
      ci-dessus ; emploie `AiErrorCode` aux deux sites de `class_basename`.
- [x] `RunAiEvaluation` et `AiProviderController` : `AiErrorCode` à la place de `class_basename`.
- [x] Front `/super-admin/ai` : libellés des codes `ai.*` émis (console, tableau de bord,
      évaluations).
- [x] Tests : `tests/Feature/Ai/AiGatewayStopReasonTest.php` (`length`, `content_filter`, `stop`,
      bascule) et `tests/Unit/Ai/AiErrorCodeTest.php` (chaque entrée de la table + repli).

## Critères d'acceptation

- [x] AC1 — Une réponse factice `length` produit une ligne `ai_calls` `outcome = failed_over`
      (amendé, cf. notes), `stop_reason = length`, `error_code = ai.response_truncated`, et la
      passerelle essaie le maillon suivant.
- [x] AC2 — Aucun `class_basename` n'alimente plus un `error_code` dans `app/` (grep consigné).
- [x] AC3 — Le test de connexion d'un fournisseur en panne rend un `error_code` en `ai.*`, affiché
      traduit dans la console.
- [x] AC4 — Chaque test rougit sans son correctif (ablation consignée).

## Hors périmètre

- La reprise des lignes `ai_calls` déjà écrites (aucune en production).
- Les refus de la passerelle (`refusal_reason`), déjà codés.

## Notes d'implémentation

2026-10-27, sur `feat/socle-ia-lot-0`.

- **Écart à la contrainte « `outcome = error` au dernier maillon », AC1 amendé.** La passerelle
  journalise déjà `failed_over` pour toute erreur basculable, **même au dernier maillon**
  (`FailoverableException`), et `error` pour une erreur qui interrompt la chaîne. Une réponse
  `length`/`content_filter` suit la même règle : `failed_over` à chaque maillon, puis
  `AiUnavailable('ai.providers_unavailable')` dont la cause (`getPrevious()`) porte
  `ai.response_truncated` ou `ai.response_filtered`. Écrire `error` au dernier maillon pour ce seul
  cas aurait donné deux sens à `failed_over` dans le même tableau de bord.
- **Le maillon tronqué est payé** : ses jetons et son coût sont journalisés (ils comptent au
  budget), et sa réponse n'entre pas dans le cache.
- **`laravel/ai` ne sait pas simuler `length`** : `Agent::fake()` passe par `FakeTextGateway`, qui
  rend toujours `FinishReason::Stop`. Le test lie au conteneur `Tests\Support\Ai\AgentFinDEssai`,
  dont `prompt()` rend une réponse structurée avec un `Step` de la raison voulue, par modèle.
- **`AiErrorCode`** couvre aussi `InsufficientCreditsException` (`ai.provider_credits`) et les
  erreurs HTTP non basculables du SDK (`RequestException` 400 et autres → `ai.request_rejected`),
  que le ticket ne listait pas : un 401 ou un 400 n'est pas converti par `HandlesFailoverErrors` et
  arrive brut. `AiUnavailable`/`AiRefused` rendent leur propre code.
- **Test de connexion** : un seul maillon y est joué, donc le contrôleur rend la **cause** de
  `ai.providers_unavailable` (`ai.provider_auth`, `ai.provider_timeout`…) plutôt que ce code
  générique. `AdminAiProvidersTest` attend désormais `ai.provider_rate_limited`.
- **AC2, grep consigné** : `grep -rn class_basename app/Services/Ai app/Jobs/Ai
  app/Http/Controllers/Api/Admin` ne rend plus que les deux `Log::warning('ai.cache_unavailable')`
  d'`AiGateway` — le journal Laravel, jamais un `error_code`.
- **Front** : une table commune `codes-erreur-appel.ts` (libellés
  `superAdmin.pages.ai.callErrors`, `wo` = français) sert la console des fournisseurs et le
  dialogue d'évaluation. Le tableau de bord n'affiche aucun `error_code` (il compte des issues) :
  rien à y traduire. Un code inconnu s'affiche brut, en retrait.
- **AC4, ablations** (chacune annulée ensuite) : sans la branche `length`/`content_filter` →
  4 rouges sur 6 (`AiGatewayStopReasonTest`) ; `stop_reason` non journalisé → 3 rouges ;
  `class_basename` dans la bascule → 1 rouge (`AiGatewayTest`) ; dans le job → 3 rouges
  (`AdminAiEvaluationsTest`) ; contrôleur sans la cause → 1 rouge (`AdminAiProvidersTest`) ;
  front, deux codes retirés de la table → 2 rouges.
- **Vérifié** : tests IA du back (`tests/Unit/Ai`, `tests/Feature/Ai`, `AdminAi*Test`,
  `LongJobsConnectionTest`) 258 verts ; front `src/components/admin/super/ai` 24 verts, ESLint,
  `tsc --noEmit`, `check-i18n` et `check:*` propres ; gardes du dépôt et `check-backlog` verts.
- **À faire par `/sync-specs` après fusion** : `docs/models-spec.md#104-aicall-` — colonne
  `stop_reason`, et `error_code` = code `ai.*` (la spec dit encore « nom de l'exception »).
