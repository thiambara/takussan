---
id: TCK-307
title: "Supprimer le DSL `scopeFilter` — mort mais toujours branché sur tous les modèles"
status: done
phase: P2
family: technique
estimate: S
wave: 39
created: 2026-08-16
updated: 2026-08-17
depends_on: [TCK-279]
blocks: [TCK-326]
spec_refs:
  features:
    - docs/features.md#24-recherche--filtres
  models: []
tags: [back, code-mort, filtrage, convention, refactor, dette]
---

## Objectif utilisateur

Qu'un développeur qui cherche comment filtrer une liste trouve une réponse, et une seule — au lieu
de trouver deux mécanismes également disponibles dont un n'est plus utilisé nulle part.

## Contrat de données

Aucun modèle nouveau. Mesuré le 2026-08-16 :

- `AbstractModel` (`app/Models/Bases/AbstractModel.php:11`) compose `BaseModelTrait, HasQueryBuilder`
  — donc **les deux** mécanismes sont montés sur tous les modèles.
- `scopeFilter` vit dans `app/Models/Bases/Traits/BaseModelTrait.php`.
- **0** appelant : `grep -E '->filter\('` sur `app/Http/Controllers` et `app/Services` rend zéro.
- **46** appels à `buildQuery()` dans les contrôleurs.

**Second code mort, même famille (ardoise D-26).** `app/Services/Model/PropertyService.php` existe
toujours et n'a **aucun appelant** dans `app/` — vérifié le 2026-08-16. La correction de D-26 du
2026-08-15 l'avait déjà établi (« 0/19 lignes exécutées ») et concluait : *« il fallait le supprimer,
pas le tester »*. Personne ne l'a supprimé. Il est traité ici parce que c'est la même opération —
retirer du code qui n'est appelé de nulle part — et que la même prudence s'y applique.

**Troisième, même famille (ardoise D-27).** `WizardDraftPolicy` est enregistrée par auto-discovery
mais `WizardDraftController` ne l'appelle **jamais** : il filtre par `where('user_id', …)`. C'est
une policy morte, pas une policy non testée — la correction de D-27 le dit explicitement : *« lui
écrire un test serait écrire un test qui ne garde rien »*. Attention toutefois : une policy
enregistrée par auto-discovery peut être atteinte par un `Gate::allows()` ailleurs sans être nommée.
L'inventaire s'impose ici aussi.

> **Requalification.** L'ardoise D-34 décrivait « deux mécanismes de filtrage concurrents sur les
> mêmes modèles », c'est-à-dire une convention en concurrence avec une autre. La re-mesure du
> 2026-08-16 dit autre chose : le DSL maison n'est plus une convention concurrente, c'est **du code
> mort toujours branché**. La dette n'est pas « choisir » — le choix est fait, et
> `spatie/laravel-query-builder` a gagné 46 à 0. La dette est de supprimer le perdant.

## Contraintes strictes (métier)

- **Zéro appelant en `app/` ne veut pas dire zéro appelant.** Vérifier `tests/`,
  `database/seeders/`, `app/Console/`, `routes/` et toute construction dynamique de nom de scope
  (`$model->{"scope$x"}`) avant de supprimer. Un scope Eloquent s'invoque par un nom de méthode
  magique : `grep` sur `->filter(` ne prouve pas l'absence d'usage.
- Le principe de lecture du dépôt est écrit : sparse fieldsets, `filter[…]` côté serveur,
  `include=`, via `spatie/laravel-query-builder` (`docs/spatie-query-builder.md`). La suppression
  va dans ce sens, elle ne l'invente pas.
- La suppression se fait en une opération séparée et lisible dans l'historique.

## Delta à produire

- [x] Inventorier tous les usages possibles de `scopeFilter`, y compris les invocations dynamiques,
      sur l'ensemble du dépôt — pas seulement `app/`
- [x] Si des appelants subsistent : les migrer vers `buildQuery()` d'abord
- [x] Supprimer `scopeFilter` de `BaseModelTrait`
- [x] Même inventaire pour `PropertyService` — y compris résolution par conteneur, injection par
      type et références en chaîne de caractères — puis suppression
- [x] Même inventaire pour `WizardDraftPolicy` — y compris `Gate::allows()`/`Gate::authorize()` qui
      l'atteindraient sans la nommer — puis suppression, ou câblage si la règle doit vivre
- [x] Supprimer les tests qui ne testaient que le DSL supprimé, et **seulement** ceux-là
- [x] Garde CI : la réintroduction d'un mécanisme de filtrage hors `HasQueryBuilder` fait échouer
      le build
- [x] Prouver la garde **par mutation**

## Critères d'acceptation

- [x] AC1 — `scopeFilter` et `PropertyService` n'existent plus dans le dépôt
- [x] AC2 — l'inventaire des usages est consigné, et couvre les invocations dynamiques
- [x] AC3 — **−1 test**, et un seul : `Tests\Unit\BaseModelTraitTest::test_scope_filter`, unique
      méthode de son fichier, dont la classe d'appui `DummyModel` n'était utilisée nulle part
      ailleurs. Le fichier entier est supprimé. Aucun autre test retiré ni assoupli.
      *(La suite ENTIÈRE est jouée par la session déléguante, pas ici — cf. CLAUDE.md § « Qui
      lance quoi ». Vérifié ici : 1055 tests sur la sélection `impacted-tests --base=dev`,
      0 échec, plus 83 sur ressources/policies/wizard-drafts.)*
- [x] AC4 — `docs/spatie-query-builder.md` reste la seule référence de filtrage, et rien ne
      contredit plus ce statut

## Hors périmètre

- Les capacités de filtrage elles-mêmes : ce ticket supprime un mécanisme inutilisé, il n'en retire
  aucune à l'API.
- L'enveloppe de pagination — TCK-304.

## Notes d'implémentation

**L'inventaire a confirmé le ticket, et a trouvé un quatrième cas qu'il ne nommait pas.**
Balayage du dépôt entier — `app/`, `routes/`, `database/`, `bin/`, `config/`, `bootstrap/`,
`tests/`, et hors PHP — plus les invocations dynamiques (`$m->{$x}()`, `call_user_func`,
`method_exists`, chaînes `'filter'`, résolution par conteneur, `Gate::` non nommant) :

| Cible | Appelants trouvés |
|---|---|
| `scopeFilter` | **1**, `tests/Unit/BaseModelTraitTest.php` — le test qui le testait |
| `PropertyService` | **0** — la classe n'est nommée nulle part sauf dans sa propre déclaration |
| `WizardDraftPolicy` | **0**, y compris zéro `Gate::allows()`/`authorize()`/`can()` sur `WizardDraft` |
| `scopeWithSearch` *(hors périmètre)* | **5**, tous dans `tests/Feature/Search/ScoutSearchTest.php` |

Les 44 occurrences de `->filter(` dans `app/` sont toutes `Collection::filter`, pas le scope. Un
second chemin confirme les deux zéros : ni `PropertyService` ni `WizardDraftPolicy` n'apparaissent
dans `tests/impact-map.json`, donc **aucun test ne les a jamais traversées**.

**`WizardDraftPolicy` — supprimée, et le choix n'est pas « c'était redondant ».** Câbler la policy
aurait **affaibli** la règle : `Gate::before(… isSuperAdmin() ? true : null)` est un bypass global,
donc un super-admin aurait franchi la policy et lu le brouillon d'un autre utilisateur, là où la
clause `where('user_id', …)` du contrôleur ne le laisse pas passer. Une « mise en conformité »
aurait été un changement de comportement. S'ajoute un obstacle mécanique : les routes lient un
`{key}` (chaîne), pas un modèle — il n'y a aucun brouillon d'autrui à passer à `authorize()`. Le
raisonnement est écrit dans le docblock de `WizardDraftController`, là où le prochain lecteur
cherchera la policy absente.

**`scopeWithSearch` n'a PAS été supprimé** — le *Delta à produire* ne nomme que `scopeFilter`, et
le retirer aurait fait baisser le compte de tests au-delà de ce qu'AC3 autorise. Il est pourtant du
même bois, et un cran pire : son docblock avertit que la pertinence Scout est **perdue** sur ce
chemin, alors que `HasQueryBuilder` la restitue depuis TCK-281 — ce n'est donc pas un doublon
inerte, c'est un doublon **inférieur**. Consigné en **ardoise D-34bis**, à ticketer.

**La garde ne cherche pas qu'un nom.** `scripts/check-filtering-single-mechanism.mjs` a trois
contrôles : la non-vacuité (elle rougit si elle ne trouve plus sa cible — le mode de défaillance
qui rend une garde muette), le NOM (un cliquet, dette D-23), et la **FORME** — un scope à paramètre
`array` qui déroule des `where()` en boucle, qui survit à un renommage. Elle ne couvre pas le
filtrage ad hoc en contrôleur : il y en a par choix assumé (TCK-281, « Hors périmètre »), et une
garde qu'on ne peut pas rendre verte n'est pas une garde.

## Reste sur dev

Le code est sur la branche `wave2/back-conventions-a`, **non mergée** : le statut reste `review`
tant qu'elle ne l'est pas (règle 4 du `CLAUDE.md` racine).

Ce qui n'est **pas** couvert par ce ticket et n'attend rien de lui :

- **`scopeWithSearch`** — même famille, laissé en place parce que le *Delta à produire* ne le nomme
  pas. Consigné en **ardoise D-34bis** avec sa mesure ; à ticketer.
- **`tests/impact-map.json`** — la carte cite encore `Tests\Unit\BaseModelTraitTest`, supprimé
  ici. Elle est **dérivée, jamais éditée à la main** : elle se régénère depuis un rapport de
  couverture, ce qui dépasse le budget d'un agent délégué (~890 s). `check-impact-map.mjs` traite la
  péremption en **avertissement**, pas en échec, et reste verte — c'est le comportement voulu.
- **La suite backend entière** — jouée une fois par la session déléguante, avant le merge.
