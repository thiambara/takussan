---
id: TCK-307
title: "Supprimer le DSL `scopeFilter` — mort mais toujours branché sur tous les modèles"
status: todo
phase: P2
family: technique
estimate: S
wave: 39
created: 2026-08-16
updated: 2026-08-16
depends_on: [TCK-279]
blocks: []
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

- [ ] Inventorier tous les usages possibles de `scopeFilter`, y compris les invocations dynamiques,
      sur l'ensemble du dépôt — pas seulement `app/`
- [ ] Si des appelants subsistent : les migrer vers `buildQuery()` d'abord
- [ ] Supprimer `scopeFilter` de `BaseModelTrait`
- [ ] Même inventaire pour `PropertyService` — y compris résolution par conteneur, injection par
      type et références en chaîne de caractères — puis suppression
- [ ] Même inventaire pour `WizardDraftPolicy` — y compris `Gate::allows()`/`Gate::authorize()` qui
      l'atteindraient sans la nommer — puis suppression, ou câblage si la règle doit vivre
- [ ] Supprimer les tests qui ne testaient que le DSL supprimé, et **seulement** ceux-là
- [ ] Garde CI : la réintroduction d'un mécanisme de filtrage hors `HasQueryBuilder` fait échouer
      le build
- [ ] Prouver la garde **par mutation**

## Critères d'acceptation

- [ ] AC1 — `scopeFilter` et `PropertyService` n'existent plus dans le dépôt
- [ ] AC2 — l'inventaire des usages est consigné, et couvre les invocations dynamiques
- [ ] AC3 — la suite backend reste verte, et le nombre de tests n'a baissé que du compte des tests
      qui portaient sur le DSL supprimé — compte donné explicitement
- [ ] AC4 — `docs/spatie-query-builder.md` reste la seule référence de filtrage, et rien ne
      contredit plus ce statut

## Hors périmètre

- Les capacités de filtrage elles-mêmes : ce ticket supprime un mécanisme inutilisé, il n'en retire
  aucune à l'API.
- L'enveloppe de pagination — TCK-304.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
