---
id: TCK-2488
title: Règles d'élément `.*` — une liste hors de sa borne ne fait pas valider ses éléments un à un
status: doing
phase: P3
family: technique
estimate: S
wave: 82
created: 2026-11-06
updated: 2026-11-06
depends_on: [TCK-2483]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#29-administration--configuration"
  models:
    - "docs/models-spec.md#2-agency"
tags: [back, validation, form-request, robustesse, suite-tck-2483]
---

## Objectif utilisateur

Qu'un appel qui envoie une liste démesurée reçoive son 422 sur la borne de la liste, vite et en
quelques octets, au lieu de faire travailler l'API sur chaque élément d'une liste déjà refusée.

## Contrat de données

Aucun endpoint, aucune colonne, aucun code d'erreur neuf. Ce qui change, pour un corps dont une liste
dépasse sa borne : la réponse 422 ne porte plus que l'erreur de la liste (`x`), et plus celles de ses
éléments (`x.0`, `x.1`… `x.N`). Un corps valide, ou invalide pour une autre raison, rend exactement ce
qu'il rendait.

## Contraintes strictes (métier)

Constat (revue de TCK-2483, M1) : Laravel applique les règles d'élément (`x.*`, `x.*.y`) à chaque
élément reçu, **même après l'échec de `max:N` sur le parent**. Mesuré sur `settings.hidden_modules` :
20 000 éléments → 29 s de CPU et 2 Mo de 422, y compris depuis un hôte. TCK-2483 l'a corrigé pour
cette seule clé (`AgencySettings::rules($input)`) ; la revue relevait 56 autres règles `.*` dans
`app/Http/Requests` qui gardent la forme.

Décision (session, 2026-11-06) :

1. **UN mécanisme commun aux FormRequest**, pas un correctif par requête : pour une clé `x.*…` dont le
   parent `x` porte `array` et `max:N`, les règles d'élément ne sont pas appliquées quand la valeur
   reçue dépasse N ; le parent rend alors son 422 seul. Deux autres refus d'office du parent, relevés
   au recensement, suivent la même règle (écart écrit au brief) : `array:k1,…,kN` reçu avec une clé
   hors liste (`UpdateMeRequest`, `navigation.personas` : sinon des milliers de personas inconnues
   font juger chacune) et `prohibited` reçu non vide (`hidden_modules` d'une agence `individual`,
   qu'exige le point 3).
2. Ne retirer une règle d'élément **que lorsque le parent échoue de toute façon** : la réponse reste
   un 422, et `validated()` d'un corps valide est inchangé. Un parent qui porte un `exclude*` n'entre
   pas dans le mécanisme (il peut ne pas être jugé).
3. Le cas particulier `AgencySettings::rules($input)` passe sur ce mécanisme s'il le couvre — y
   compris l'agence `individual`, où `settings.hidden_modules` est `prohibited`.
4. **Aucune borne métier inventée** : un parent `.*` sans `max:` est listé ici, pas borné. Les bornes
   se proposent en suite.

## Delta à produire

- [ ] `App\Support\ReglesDElementBornees::retirer(array $rules, array $data): array` — fonction pure :
      pour chaque préfixe générique d'une clé (`a.*.b.*.c` → `a`, `a.*.b`), lit les instances du
      parent dans `$data` ; si l'une est refusée d'office par les règles du parent, la clé est retirée.
- [ ] `App\Http\Requests\Concerns\BorneLesReglesDElement` — trait qui surcharge `validationRules()`
      du FormRequest et passe ses règles par la fonction, sur `validationData()`.
- [ ] `BaseFormRequest` porte le trait ; les FormRequest qui étendent encore `FormRequest` en direct
      (TCK-730) et portent une règle `.*` bornée le portent aussi.
- [ ] `AgencySettings::rules()` perd son paramètre `$input` et sa condition ;
      `AgencyUpdateRequest` cesse de lui passer les `settings` reçus.
- [ ] Tests : `tests/Unit/Support/ReglesDElementBorneesTest.php` (la fonction) ;
      `tests/Feature/Validation/ReglesDElementBorneesTest.php` (un échantillon par HTTP, et le
      recensement de toutes les FormRequest).

## Critères d'acceptation

- [ ] AC1 — Fonction : une clé `x.*` est retirée quand `x` porte `max:N` et reçoit N+1 éléments, et
      gardée à N éléments, à `null`, absente ou non tableau. Même chose pour chaque préfixe d'une clé
      à plusieurs `.*`, et pour les clés `x.*.y`. Idem pour `array:k…` reçu avec une clé hors liste,
      et `prohibited` reçu non vide. Un parent sans borne, ou qui porte un `exclude*`, ne retire rien.
- [ ] AC2 — Échantillon HTTP, une requête par famille (base / directe ; liste de scalaires ; liste
      d'objets `x.*.y` ; `.*` imbriqué) : N+1 éléments invalides → 422 dont `errors` n'a QUE la clé du
      parent ; N éléments dont un invalide → l'erreur d'élément est encore rendue.
- [ ] AC3 — `settings.hidden_modules` : les deux tests de TCK-2483 (`test_une_liste_hors_borne_ne_valide_pas_ses_elements`,
      standard ET `individual`, et `test_une_liste_dans_sa_borne_valide_encore_ses_elements`) restent
      verts une fois `AgencySettings::rules($input)` retiré.
- [ ] AC4 — Recensement : un test parcourt toutes les FormRequest concrètes de `app/Http/Requests`,
      joue leurs `rules()`, et pour chaque clé `.*` dont tous les préfixes sont bornés, vérifie PAR LA
      REQUÊTE ELLE-MÊME (son `validationRules()` sur un corps hors borne) que la clé tombe. Une clé
      `.*` à parent non borné qui n'est pas dans la liste figée rougit ; une entrée de la liste qui
      n'a plus la forme rougit (liste expirante). Une requête dont `rules()` ne se joue pas hors
      contexte est listée nommément, et sa source ne porte aucune clé `.*`.
- [ ] AC5 — Ablations : retirer le trait de `BaseFormRequest`, puis d'une requête directe, puis
      neutraliser la fonction → les tests ci-dessus rougissent ; restauré → verts.
- [ ] AC6 — Suites par la CI.

## Hors périmètre

- **Les parents `.*` sans borne** (relevé du 2026-11-06, 29 clés, 22 parents) — à borner en suite, une
  borne métier chacun : `StoreAgentHandoverRequest` `successors` (+ `exists` par élément) ;
  `SyncCapabilitiesRequest` `capabilities` ; `Store/UpdateAlertRuleRequest` `channels`,
  `recipients.emails`, `recipients.webhooks` ; `Store/UpdateAnnouncementRequest` `segment.roles`,
  `segment.agency_ids` (+ `exists` par élément) ; `UpdateFeatureFlagRequest` `segments.roles`,
  `segments.agency_ids` ; `UpdateRadarCrawlSourceRequest` `start_urls` ; `IndexCalendarRequest`
  `property_ids`, `types` ; `UpdateAvailabilityServiceProviderProfileRequest` `available_slots` ;
  `UpdateSpecializationAgentProfileRequest` `intervention_zones` ;
  `UpdateTradesServiceProviderProfileRequest` et `InviteServiceProviderRequest` `trades`,
  `intervention_zones` ; `ReorderPropertyMediaRequest` `order` ; `SyncPropertyTagRequest` `tag_ids` ;
  `AttachCustomerTagsRequest` `tags` ; `RefundDepositRequest` `attachments`.
- Les validateurs ad hoc hors FormRequest (`JugeLaLigneDeReglageDAgence`,
  `PlatformSettingService`) qui écrivent `value.*`.
- Passer les FormRequest directes sur `BaseFormRequest` (TCK-730).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
