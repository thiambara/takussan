---
id: TCK-330
title: "Créer une recherche sauvegardée avec une fréquence d'alerte vide rend 500"
status: doing
phase: P1
family: bug
estimate: S
wave: null
created: 2026-08-17
updated: 2026-08-20
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#24-recherche--filtres
  models:
    - docs/models-spec.md#23-savedsearch-
tags: [back, validation, recherche-sauvegardee, bug]
---

## Objectif utilisateur

Qu'un utilisateur qui crée une recherche sauvegardée sans choisir de fréquence d'alerte obtienne
une réponse qu'il peut comprendre et corriger, au lieu d'une erreur serveur.

## Contrat de données

Aucun modèle nouveau. **Trois faits mesurés le 2026-08-17**, tous sur `saved_searches` :

| Requête | Envoi | Réponse mesurée |
|---|---|---|
| `POST /api/saved-searches` | `notification_frequency: ""` | **500** |
| `PUT /api/saved-searches/{id}` | `notification_frequency: ""` | **422** |
| `POST /api/saved-searches` | `notification_frequency: "none"` — *la valeur écrite dans la spec* | **422** |

**La mécanique du 500.** La colonne est `string()->default('daily')`, donc **NOT NULL**
(`database/migrations/2026_04_17_160021_create_saved_searches_table.php:16`), en accord avec
`spec_refs.models`. La règle de création est `['nullable', 'in:off,daily,weekly,instant']`. Le
middleware **global** de Laravel `ConvertEmptyStringsToNull` transforme `""` en `null` avant toute
validation ; `nullable` l'accepte ; `SavedSearch::create()` insère alors un `NULL` explicite, et la
contrainte d'intégrité lève. Le champ est traversant : `SearchService.php:96` retombe sur `'daily'`
quand la clé est absente, mais pas quand elle vaut `null`.

**Les deux requêtes ne s'accordent pas entre elles.** La création dit `nullable`, la mise à jour dit
`sometimes` **sans** `nullable` — d'où 500 d'un côté et 422 de l'autre, pour la même saisie sur le
même champ.

**C'est PRÉEXISTANT.** Vérifié contre `ad007231` (le commit d'avant le déplacement des validations
de TCK-305) : mêmes règles, même `create(array_merge($data, …))`, et le middleware global
convertissait déjà `""` en `null`. TCK-305 n'a pas introduit ce défaut et ne l'a pas aggravé — il
l'a rendu visible en écrivant les tests qui traversent ce chemin.

## Contraintes strictes (métier)

**La question à trancher est un choix produit, et ce ticket ne le tranche pas :**

> **« Pas d'alerte » et « champ non renseigné » sont-ils le même état ?**

Les deux réponses existent déjà dans le dépôt, et elles mènent à des correctifs différents :

- **Si ce sont deux états distincts** — le domaine porte déjà une valeur sentinelle pour « pas
  d'alerte » (`off` en code). Le correctif est alors de **refuser `""` à la validation** : retirer
  `nullable` de la règle de création, pour l'aligner sur la mise à jour qui rend déjà 422. Le client
  qui veut couper l'alerte envoie la sentinelle, pas le vide.
- **Si c'est le même état** — le correctif est de **rendre la colonne nullable** (migration + `down()`
  juste, cf. principe non négociable n°4) et de décider ce que `null` signifie à la lecture, pour
  `SearchService` comme pour `SavedSearchResource`.

⚠️ **Un troisième écart, à ne pas confondre avec le bug, et qui pèse sur la décision.**
`spec_refs.models` documente les valeurs `instant, daily, weekly, **none**`. Le code valide
`off, daily, weekly, instant` — **`none` est rejeté par un 422**, mesuré. La spec et le code ne
nomment donc pas la même sentinelle. Cet écart relève de `/sync-specs` : **ne pas modifier
`docs/models-spec.md` depuis ce ticket**, mais le trancher avant de figer une règle de validation
qui contredirait la source de vérité une seconde fois.

Le comportement de la mise à jour (422) est le comportement de référence : quelle que soit la
réponse retenue, **les deux requêtes doivent finir d'accord**.

## Décision produite (2026-08-20)

> **« Pas d'alerte » et « champ non renseigné » sont DEUX états distincts.**

C'est la première branche du ticket : le vide est **refusé à la validation**, la colonne reste
`NOT NULL`, aucune migration. Trois raisons **mesurées**, pas trois préférences :

1. **La sentinelle existe déjà, et elle est déjà employée par le front.** `off` est écrit dans
   `takussan-web/src/lib/schemas/search.ts:57`, `SaveSearchButton.tsx:110` et
   `SearchPreferencesForm.tsx` — le client qui veut couper l'alerte envoie déjà `off`, il n'a
   jamais eu besoin du vide pour le dire. Rendre la colonne nullable créerait un **second** état
   « pas d'alerte » à côté du premier, donc deux lectures à écrire partout.
2. **Le comportement de référence est le 422**, comme le ticket le pose : la mise à jour rendait
   déjà 422 pour cette saisie. Aligner la création sur la mise à jour ne change le contrat
   d'aucun appel qui fonctionnait ; l'inverse aurait changé celui de `PUT`.
3. **L'absence, elle, reste valide** — la colonne retombe sur son défaut `daily`. Les trois cas
   sont donc bien distincts et tous couverts : *absent* → 201 + `daily`, *vide ou `null`* → 422,
   *sentinelle `off`* → 201 + `off`.

## Delta à produire

- [x] Trancher la question produit ci-dessus, et l'écrire dans ce ticket avant de coder
- [x] Trancher `off` vs `none` avec `/sync-specs` — la valeur retenue doit exister des deux côtés
      → **tranché en faveur de `off`**, et **le document est corrigé depuis le 2026-08-20** :
      `docs/models-spec.md:1141` porte désormais `off` (plus la mention **NOT NULL** et le renvoi
      à ce ticket). L'arbitrage n'a pas été repris sur parole — il a été **re-mesuré avant
      l'écriture** :
      ```
      $ grep -rn "notification_frequency" takussan-api/app takussan-web/src | grep -c "'off'"
      … 'in:off,daily,weekly,instant' × 2 (Store + Update), z.enum(['off','daily','weekly','instant'])
        .default('off'), SaveSearchButton.tsx:110 'off' as const
      $ grep -rn "none" --include='*.php' takussan-api/app | grep notification_frequency
      (aucun résultat — les seuls 'none' de app/ vivent dans PublicPropertyController
       (éligibilité d'avis) et DepositRefundService (état de restitution), autres domaines)
      ```
      `none` n'existait donc **que** dans cette cellule de tableau, et nulle part dans le code.
- [x] Aligner `StoreSavedSearchRequest` et `UpdateSavedSearchRequest` sur la décision : les deux
      règles doivent produire le **même** code de réponse pour la même saisie
- [x] ~~Si la colonne devient nullable~~ — **sans objet** : la décision garde la colonne `NOT NULL`,
      donc aucune migration, et la lecture de `null` n'a pas à être définie puisque `null`
      n'atteint plus la base.
- [x] Tests : le cas `""` sur les DEUX requêtes, et le cas de la sentinelle retenue

## Critères d'acceptation

- [x] AC1 — `POST /api/saved-searches` avec `notification_frequency: ""` ne rend plus **500**
      → **422**, mesuré (`SavedSearchTest::test_creating_a_saved_search_with_an_empty_notification_frequency_is_rejected_not_a_server_error`)
- [x] AC2 — `POST` et `PUT` rendent le **même** code de réponse pour la même saisie vide
      → les deux statuts sont comparés **entre eux** par
      `test_store_and_update_agree_on_the_same_empty_notification_frequency` : 422 = 422
- [x] AC3 — la sentinelle « pas d'alerte » est acceptée, et c'est la **même** chaîne dans
      `docs/models-spec.md` et dans les règles de validation
      → **TENU le 2026-08-20, et sur les deux moitiés.** *Moitié code* : `off` est accepté et
      stocké — re-exécuté ce jour-là, pas relu :
      ```
      $ php artisan test tests/Feature/Api/SavedSearchTest.php
        ✓ the off sentinel is accepted and stored
        Tests: 7 passed (16 assertions)   Duration: 1.59s
      ```
      *Moitié document* : `docs/models-spec.md:1141` écrit `off` (correction portée hors de cette
      branche déléguée, cf. delta ci-dessus). Les deux chaînes sont désormais la même —
      `in:off,daily,weekly,instant` dans les deux FormRequests, `off` dans la cellule.
- [x] AC4 — `BaseFormRequestNormalizationTest::test_a_nullable_rule_over_a_not_null_column_still_fails_and_it_predates_this_ticket`
      **rougit** et est mis à jour dans la même PR
      → rouge **constaté** avant remplacement (`Failed asserting that 500 is identical to 422`,
      cf. Notes d'implémentation), puis remplacé — pas supprimé — par
      `test_a_normalized_empty_string_over_a_not_null_column_is_refused_at_the_door`, qui garde le
      même trou du bon côté et ajoute qu'aucune ligne n'est écrite lors du refus.
- [ ] AC5 — la suite backend reste verte, sans assertion assouplie
      → **non vérifiable depuis cette branche déléguée** : la règle du dépôt interdit à un agent
      délégué de lancer la suite entière. 40 tests verts sur les 4 classes qui touchent
      `saved-searches` (détail ci-dessous). La suite entière appartient au rituel de fin de
      branche. Aucune assertion existante n'a été assouplie : la seule modifiée est celle d'AC4,
      qui passe de `assertStatus(500)` à `assertStatus(422)` **plus** une assertion de base
      supplémentaire.

## Hors périmètre

- Toute autre colonne `NOT NULL` dont la règle serait `nullable` : ce ticket ne traite que
  `saved_searches.notification_frequency`. Un balayage systématique est un ticket à part.
- La convergence spec↔code sur d'autres champs de `SavedSearch` — `/sync-specs`.
- Le déclenchement réel des alertes (job planifié, cadence) : non touché ici.

## Notes d'implémentation

**Le correctif tient en une règle** — `app/Http/Requests/Api/StoreSavedSearchRequest.php` :

```diff
- 'notification_frequency' => ['nullable', 'in:off,daily,weekly,instant'],
+ 'notification_frequency' => ['sometimes', 'in:off,daily,weekly,instant'],
```

C'est désormais **la chaîne exacte** de `UpdateSavedSearchRequest`, et un docblock de chaque côté
dit que les deux ne doivent plus diverger. `sometimes` laisse passer l'ABSENCE (rule sautée) et
soumet la valeur PRÉSENTE — `null` compris — au `in:`, qui la refuse. Aucun autre fichier
applicatif touché : ni migration, ni modèle, ni contrôleur, ni ressource.

### Prémisse re-mesurée avant de coder — elle tenait

`php artisan test tests/Feature/Api/SavedSearchTest.php` avec les nouveaux tests et **sans** le
correctif :

```
SQLSTATE[23000]: Integrity constraint violation: 19 NOT NULL constraint failed:
saved_searches.notification_frequency (Connection: sqlite, …)
Tests:  3 failed, 4 passed (12 assertions)
```

Le 500 est donc bien l'erreur d'intégrité annoncée, et il frappe **par deux chemins** : la chaîne
vide normalisée en `null`, *et* le `null` JSON explicite. Le second n'était pas dans le ticket ; il
a son propre test.

### ⚠️ Une affirmation du ticket est FAUSSE, et il faut le dire

> *« `SearchService.php:96` retombe sur `'daily'` quand la clé est absente, mais pas quand elle
> vaut `null`. »*

Non. `??` a la sémantique d'`isset()` : il retombe **aussi** sur `'daily'` pour un `null`.
Mesuré :

```
$ php -r 'var_dump(["x"=>null]["x"] ?? "daily", ["x"=>""]["x"] ?? "daily");'
string(5) "daily"
string(0) ""
```

`SearchService::saveSearch()` n'a donc jamais été un chemin vers ce 500 pour `null` — il en serait
un pour `""`, qui écrirait une chaîne vide en base. Le point est théorique : `grep -rn "saveSearch("
app routes tests` ne trouve **aucun appelant** hors de la déclaration. Rien n'est modifié là-bas ;
c'est du ressort d'un ticket sur le code mort, pas de celui-ci.

### Preuve par ablation (protocole complet)

Correctif sauvegardé, retiré (`sometimes` → `nullable`), tests relancés, correctif restauré :

| état | commande | sortie |
|---|---|---|
| **avec** le correctif | `php artisan test tests/Feature/Api/SavedSearchTest.php tests/Feature/Validation/BaseFormRequestNormalizationTest.php tests/Feature/Validation/AccountAndProfileValidationTest.php tests/Feature/Validation/AuthorizationPrecedesValidationTest.php` | `Tests: 40 passed (130 assertions)` |
| **sans** (ablation) | idem | `Tests: 4 failed, 36 passed (123 assertions)` |
| **restauré** | idem | `Tests: 40 passed (130 assertions)` |

Les 4 rouges de l'ablation, tous sur `Failed asserting that 500 is identical to 422` :
`…empty_notification_frequency_is_rejected_not_a_server_error`,
`…explicitly_null_notification_frequency_is_rejected`,
`…store_and_update_agree_on_the_same_empty_notification_frequency`,
`BaseFormRequestNormalizationTest::…refused_at_the_door`. Les 2 autres tests ajoutés (`off` accepté,
champ absent → `daily`) restent verts sous ablation : **c'est attendu**, ils gardent contre le
sur-serrage de la règle, pas contre le bug.

Machine : 8 cœurs, `load average` 3,52 au départ, services natifs.

### Le rouge d'AC4, constaté et non déduit

Avant modification, `BaseFormRequestNormalizationTest` était **vert** (4/4) — il figeait le 500.
Après le correctif seul, sans toucher au test :

```
Tests:  1 failed, 3 passed (11 assertions)
➜ 100▕         ])->assertStatus(500);
```

C'est le signal que le ticket attendait. Le test a ensuite été **remplacé**, pas supprimé.

### Un défaut d'outillage rencontré en chemin (à ne pas traiter ici)

`tests/impact-map.json` ne connaît **ni** `StoreSavedSearchRequest.php` **ni**
`UpdateSavedSearchRequest.php` (vérifié : `k in m['files']` → `False` pour les deux, `True` pour
`BaseFormRequest.php`). `php bin/impacted-tests.php --run` n'aurait donc sélectionné **aucun** test
pour ce correctif. La carte date du commit `eafab606` (2026-08-17). Cela relève de l'outillage
(TCK-331), pas de ce ticket — noté ici pour que la constatation ne se perde pas.

### Fichiers touchés

- `takussan-api/app/Http/Requests/Api/StoreSavedSearchRequest.php` — la règle + le docblock qui
  porte la décision
- `takussan-api/app/Http/Requests/Api/UpdateSavedSearchRequest.php` — docblock seul : « cette
  règle et celle de la création doivent rester identiques »
- `takussan-api/tests/Feature/Api/SavedSearchTest.php` — +5 tests (vide, `null` explicite, accord
  POST/PUT, sentinelle `off`, champ absent)
- `takussan-api/tests/Feature/Validation/BaseFormRequestNormalizationTest.php` — le test figé d'AC4
  remplacé par son contraire, docblock réécrit

`./vendor/bin/pint` sur ces quatre fichiers : `{"tool":"pint","result":"passed"}`.
