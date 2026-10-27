---
id: TCK-2399
title: "Journal des appels IA : une réponse tronquée ou filtrée n'est plus un succès, et les erreurs portent des codes ai.* au lieu de noms de classe"
status: todo
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

- [ ] Migration `add_stop_reason_to_ai_calls` (`string`, nullable, longueur bornée).
- [ ] `App\Services\Ai\AiErrorCode::fromThrowable(Throwable): string` — table fermée des
      exceptions connues vers `ai.provider_timeout`, `ai.provider_rate_limited`,
      `ai.provider_unavailable`, `ai.provider_auth`, `ai.response_invalid`, repli
      `ai.unexpected`.
- [ ] `AiGateway` : lit la raison de fin, la journalise dans `stop_reason`, applique la règle
      ci-dessus ; emploie `AiErrorCode` aux deux sites de `class_basename`.
- [ ] `RunAiEvaluation` et `AiProviderController` : `AiErrorCode` à la place de `class_basename`.
- [ ] Front `/super-admin/ai` : libellés des codes `ai.*` émis (console, tableau de bord,
      évaluations).
- [ ] Tests : `tests/Feature/Ai/AiGatewayStopReasonTest.php` (`length`, `content_filter`, `stop`,
      bascule) et `tests/Unit/Ai/AiErrorCodeTest.php` (chaque entrée de la table + repli).

## Critères d'acceptation

- [ ] AC1 — Une réponse factice `length` produit une ligne `ai_calls` `outcome = error`,
      `stop_reason = length`, `error_code = ai.response_truncated`, et la passerelle essaie le
      maillon suivant.
- [ ] AC2 — Aucun `class_basename` n'alimente plus un `error_code` dans `app/` (grep consigné).
- [ ] AC3 — Le test de connexion d'un fournisseur en panne rend un `error_code` en `ai.*`, affiché
      traduit dans la console.
- [ ] AC4 — Chaque test rougit sans son correctif (ablation consignée).

## Hors périmètre

- La reprise des lignes `ai_calls` déjà écrites (aucune en production).
- Les refus de la passerelle (`refusal_reason`), déjà codés.

## Notes d'implémentation

_(à remplir par implementing-specs)_
