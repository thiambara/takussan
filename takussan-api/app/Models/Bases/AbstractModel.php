<?php

namespace App\Models\Bases;

use App\Models\Concerns\HasQueryBuilder;
use Illuminate\Database\Eloquent\Model;

/**
 * Base de 68 des 70 modèles du dépôt. Les deux exceptions sont justifiées par leur classe
 * parente : `User` (extends `Authenticatable`) et `ConversationParticipant` (extends `Pivot`).
 *
 * **Il n'y a qu'UN mécanisme de lecture d'API ici, et c'est délibéré.** `AbstractModel` a composé
 * pendant longtemps un second trait, `App\Models\Bases\Traits\BaseModelTrait`, qui portait un
 * DSL maison :
 *
 *   · `scopeFilter(Builder, array)` — supprimé par **TCK-307**. Mesuré le 2026-08-17 : zéro
 *     appelant dans tout le dépôt (`app/`, `routes/`, `database/`, `bin/`, `config/`), contre
 *     46 `buildQuery()` dans les seuls contrôleurs. Son unique usage était le test qui le testait.
 *   · `scopeWithSearch(Builder, ?string, int)` et son helper `isSearchable()` — supprimés par
 *     **TCK-326**, avec le trait lui-même, devenu vide. Même inventaire, même verdict : zéro
 *     appelant hors de `tests/Feature/Search/ScoutSearchTest.php`, c'est-à-dire hors du test qui
 *     les testait.
 *
 * Ce qui coûtait n'était pas les lignes, c'était l'AMBIGUÏTÉ : deux mécanismes également
 * disponibles sur le même modèle ne se lisent pas « un vivant, un mort », ils se lisent « deux
 * conventions, choisis ». Et `scopeWithSearch` était pire qu'un doublon inerte — c'était un
 * doublon INFÉRIEUR : il composait Scout et Eloquent par un `whereIn` qui **perd l'ordre de
 * pertinence**, là où `HasQueryBuilder::buildQuery()` le RESTITUE depuis TCK-281
 * (`$searchRelevanceIds` → `App\Sorts\SearchRelevanceSort`). Son docblock l'avouait ; l'appelant
 * ne lit pas le docblock, il lit la liste des méthodes disponibles.
 *
 * Filtrage, tri, includes, sparse fieldsets ET recherche plein-texte passent donc par
 * `HasQueryBuilder::buildQuery()` — voir `docs/spatie-query-builder.md`.
 * `scripts/check-filtering-single-mechanism.mjs` (Repo CI) garde les deux suppressions **y
 * compris sous un autre nom** : contrôle C pour le DSL de filtrage, contrôle D pour la recherche.
 */
abstract class AbstractModel extends Model
{
    use HasQueryBuilder;
}
