---
id: TCK-326
title: "Supprimer `scopeWithSearch` — le jumeau de `scopeFilter`, et un doublon INFÉRIEUR"
status: todo
phase: P2
family: technique
estimate: S
wave: 39
created: 2026-08-17
updated: 2026-08-17
depends_on: [TCK-307]
blocks: []
spec_refs:
  features:
    - docs/features.md#24-recherche--filtres
  models: []
tags: [back, code-mort, recherche, scout, convention, refactor, dette]
---

## Objectif utilisateur

Qu'un développeur qui cherche comment brancher une recherche sur une liste ne trouve pas deux
chemins également disponibles dont l'un rend un classement dégradé sans le dire à l'appel.

## Contrat de données

Aucun modèle nouveau. **Mesuré le 2026-08-17**, en soldant [TCK-307](TCK-307-supprimer-dsl-scopefilter-mort.md) :

- `BaseModelTrait::scopeWithSearch(Builder, ?string, int $limit = 1000)` vit dans
  `app/Models/Bases/Traits/BaseModelTrait.php`, monté sur les **68 modèles** qui étendent
  `AbstractModel`.
- **5 appelants, tous dans `tests/Feature/Search/ScoutSearchTest.php`** — c'est-à-dire dans le seul
  test qui le teste. **Zéro appelant** en `app/`, `routes/`, `database/`, `bin/`, `config/`.
- `isSearchable()`, déclaré dans le même trait, n'est appelé que par `scopeWithSearch` lui-même.
  `HasQueryBuilder` ne l'emprunte pas : il refait le `in_array(Searchable::class, …)` en ligne
  (`HasQueryBuilder.php`, commentaire TCK-280), **délibérément**, parce qu'il sert aussi des
  modèles sans le trait (`User`). Ce point est à vérifier avant de supprimer `isSearchable` :
  sa portée n'est pas la même que celle de `scopeWithSearch`.

**Ce n'est pas un doublon inerte, c'est un doublon INFÉRIEUR** — et c'est ce qui distingue ce
ticket de TCK-307. Les deux chemins ne se valent pas, `takussan-api/CLAUDE.md` § *Recherche* le
tranche déjà :

| Chemin | Ordre de pertinence Meilisearch |
|---|---|
| `scopeWithSearch()` | **perdu** — `whereIn` sans restitution, son propre docblock l'avertit |
| `HasQueryBuilder` `filter[search]` | **restitué** depuis TCK-281 (`$searchRelevanceIds` → `SearchRelevanceSort`) |

`scopeFilter` était du code mort équivalent au vivant. Celui-ci est du code mort **moins bon** que
le vivant, et il ne le signale que dans un docblock que l'appelant ne lit pas. Un développeur qui le
choisit obtient une recherche tolérante aux fautes mais classée par date — exactement le défaut que
TCK-281 a corrigé ailleurs, et qui cochait un AC sans le tenir.

**Pourquoi ce n'est pas fait dans TCK-307.** Son *Delta à produire* ne nomme que `scopeFilter`, et
son **AC3 bornait explicitement la baisse du compte de tests** au seul DSL nommé — retirer
`scopeWithSearch` aurait supprimé 5 cas de plus que ce que le ticket autorisait à supprimer.
Consigné en **ardoise D-34bis** plutôt que fait en passant.

## Contraintes strictes (métier)

- **Refaire l'inventaire, ne pas le croire.** Le chiffre ci-dessus date du 2026-08-17 ; un scope
  Eloquent s'invoque par méthode magique, donc `grep '->withSearch('` ne prouve rien seul. Couvrir
  le dépôt entier et les invocations dynamiques, comme l'a fait TCK-307.
- **Les 5 tests de `ScoutSearchTest` ne se suppriment pas tous à l'aveugle.** Ce fichier teste
  `scopeWithSearch` ET, potentiellement, des propriétés du harnais Scout qui survivent à la
  suppression. Ne retirer que les cas qui portent sur le scope supprimé, et **dire le compte
  exactement** — même exigence qu'AC3 de TCK-307.
- **Ne pas supprimer `isSearchable()` sans l'avoir inventorié séparément** : sa portée n'est pas
  celle de `scopeWithSearch` (cf. *Contrat de données*).
- Si un appelant réel apparaît, il se **migre vers `filter[search]` / `buildQuery()` d'abord** —
  et la migration doit **restituer la pertinence** via `defaultSortsWithRelevance()`, sinon elle
  reproduit le défaut de TCK-281.

## Delta à produire

- [ ] Ré-inventorier `scopeWithSearch` et `isSearchable` sur le dépôt entier, invocations
      dynamiques comprises
- [ ] Migrer les appelants réels s'il en existe — vers `filter[search]`, pertinence restituée
- [ ] Supprimer `scopeWithSearch` de `BaseModelTrait`, et `isSearchable` si son inventaire propre
      le permet
- [ ] Retirer les seuls cas de `tests/Feature/Search/ScoutSearchTest.php` qui portaient sur le
      scope supprimé — compte donné explicitement
- [ ] Étendre `scripts/check-filtering-single-mechanism.mjs` : elle ne voit **pas** ce scope
      aujourd'hui (il ne prend pas de tableau et ne boucle pas de `where()`), donc son contrôle C
      ne l'attrape pas. Ajouter un contrôle qui refuse un scope de RECHERCHE hors `HasQueryBuilder`
- [ ] **Prouver l'extension de la garde par mutation**, y compris le cas « la garde ne trouve plus
      sa cible » — le contrôle de non-vacuité existant doit couvrir le nouveau contrôle
- [ ] Mettre à jour `takussan-api/CLAUDE.md` § *Recherche* (la ligne du tableau qui décrit le
      chemin supprimé) et solder **D-34bis** dans `docs/ardoise.md`

## Critères d'acceptation

- [ ] AC1 — `scopeWithSearch` n'existe plus dans le dépôt, et `BaseModelTrait` ne porte plus qu'un
      mécanisme (ou disparaît, si son inventaire montre qu'il ne reste rien)
- [ ] AC2 — l'inventaire est consigné et couvre les invocations dynamiques ; le sort de
      `isSearchable` est tranché **par sa propre mesure**, pas par association
- [ ] AC3 — le nombre de tests n'a baissé que du compte des cas portant sur le scope supprimé,
      compte donné explicitement ; aucune assertion assouplie
- [ ] AC4 — la garde CI refuse la réintroduction d'un chemin de recherche hors `HasQueryBuilder`,
      **et la preuve par mutation est écrite avec sa sortie exacte**
- [ ] AC5 — aucun comportement de recherche exposé par l'API n'a changé : la pertinence reste
      restituée sur le chemin `filter[search]` (non-régression de TCK-281)

## Hors périmètre

- Le cap `HasQueryBuilder::SEARCH_ID_CAP` (5000) qui échoue en silence — défaut réel, documenté
  dans `takussan-api/CLAUDE.md` § *Recherche*, mais sans rapport avec ce ticket.
- Les consoles super-admin, qui écrivent leur propre `LIKE` par choix assumé (TCK-281,
  « Hors périmètre »).
- Le filtrage ad hoc en contrôleur, hors de portée de la garde par décision (cf. TCK-307).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
