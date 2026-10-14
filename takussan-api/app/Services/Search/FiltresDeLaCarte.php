<?php

namespace App\Services\Search;

use App\Models\Property;
use App\Support\CaseInsensitive;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;

/**
 * TCK-633 (lot E, AC6) — les filtres du panneau, traduits en SQL pour `/map`.
 *
 * `/map` interroge PostgreSQL (ADR-0023 : GeoJSON plafonné, cadrage `bounds`), la liste interroge
 * Meilisearch (`PropertySearchService::buildFilter()`). Ce sont deux traductions du MÊME
 * vocabulaire, et chaque règle ci-dessous reprend celle de `buildFilter()` :
 *
 * - chambres, salles de bain, étage : des MINIMUMS ; une valeur nulle ne satisfait aucun seuil ;
 * - `featured` : unilatéral, `featured=false` ne filtre rien ;
 * - `type`, `condition` : OU entre les valeurs d'une même clé ;
 * - `tags` : un ET — le bien offre TOUS les équipements demandés (décision 4 du porteur) ;
 * - `available_from` : un bien sans date est disponible ;
 * - ville, quartier et équipements : égalité sur le texte, qui porte le nom canonique du
 *   référentiel (ADR-0062 §4), repliée comme Meilisearch replie la casse (`CaseInsensitive`,
 *   ADR-0025 — accents NON repliés).
 *
 * Ce qu'elle ne fait PAS : `q` (plein-texte), le tri, la pagination — propres à la liste
 * (`MapPublicPropertyRequest::CLES_PROPRES_A_LA_LISTE`). Le point et le rayon restent dans le
 * contrôleur, qui les compose au cadrage.
 *
 * L'accord est GARDÉ, pas supposé : `MapFiltersParityTest` pose deux biens qui ne diffèrent que
 * par une clé et exige le même résultat des deux côtés, pour chaque clé que la carte accepte.
 */
final class FiltresDeLaCarte
{
    /** Clé de la requête → colonne de `properties`, comparée en « au moins ». */
    private const MINIMUMS = [
        'bedrooms' => 'bedrooms',
        'bathrooms' => 'bathrooms',
        'floor_number' => 'floor_number',
    ];

    /**
     * @param  Builder<Property>  $query
     * @param  array<string, mixed>  $p  les paramètres VALIDÉS par `MapPublicPropertyRequest`
     */
    public function appliquer(Builder $query, array $p): void
    {
        if (! empty($p['location'])) {
            $this->adresseEgale($query, 'neighborhood', (string) $p['location']);
        }
        if (! empty($p['city'])) {
            $this->adresseEgale($query, 'city', (string) $p['city']);
        }
        if (! empty($p['region'])) {
            $this->adresseEgale($query, 'region', (string) $p['region']);
        }
        if (isset($p['price_min']) && is_numeric($p['price_min'])) {
            $query->where($query->qualifyColumn('price'), '>=', (float) $p['price_min']);
        }
        if (isset($p['price_max']) && is_numeric($p['price_max'])) {
            $query->where($query->qualifyColumn('price'), '<=', (float) $p['price_max']);
        }
        foreach (self::MINIMUMS as $cle => $colonne) {
            if (isset($p[$cle]) && is_numeric($p[$cle])) {
                $query->where($query->qualifyColumn($colonne), '>=', (int) $p[$cle]);
            }
        }
        if (isset($p['area_min']) && is_numeric($p['area_min'])) {
            $query->where($query->qualifyColumn('area'), '>=', (float) $p['area_min']);
        }
        if (isset($p['area_max']) && is_numeric($p['area_max'])) {
            $query->where($query->qualifyColumn('area'), '<=', (float) $p['area_max']);
        }
        if (array_key_exists('featured', $p) && filter_var($p['featured'], FILTER_VALIDATE_BOOLEAN)) {
            $query->where($query->qualifyColumn('featured'), true);
        }
        if (! empty($p['title_type'])) {
            $query->where($query->qualifyColumn('title_type'), (string) $p['title_type']);
        }
        $this->parmi($query, 'condition', $p['condition'] ?? null);
        $this->parmi($query, 'type', $p['type'] ?? null);
        if (! empty($p['contract_type'])) {
            $query->where($query->qualifyColumn('contract_type'), (string) $p['contract_type']);
        }
        if (! empty($p['rent_period'])) {
            $query->where($query->qualifyColumn('rent_period'), (string) $p['rent_period']);
        }
        if (array_key_exists('furnished', $p) && $p['furnished'] !== null && $p['furnished'] !== '') {
            $query->where($query->qualifyColumn('furnished'), filter_var($p['furnished'], FILTER_VALIDATE_BOOLEAN));
        }
        $this->equipements($query, $p['tags'] ?? null);
        if (! empty($p['available_from'])) {
            $date = Carbon::parse((string) $p['available_from'])->toDateString();
            $colonne = $query->qualifyColumn('available_from');
            $query->where(fn (Builder $q) => $q->whereNull($colonne)->orWhereDate($colonne, '<=', $date));
        }
    }

    /** @param  Builder<Property>  $query */
    private function adresseEgale(Builder $query, string $colonne, string $valeur): void
    {
        $query->whereHas('address', fn (Builder $q) => $q->whereRaw(
            CaseInsensitive::sql($colonne).' = ?',
            [CaseInsensitive::fold($valeur)],
        ));
    }

    /** @param  Builder<Property>  $query */
    private function parmi(Builder $query, string $colonne, mixed $brut): void
    {
        $valeurs = self::valeurs($brut);
        if ($valeurs !== []) {
            $query->whereIn($query->qualifyColumn($colonne), $valeurs);
        }
    }

    /**
     * Un `whereHas` PAR équipement : le bien doit les offrir TOUS (ET), comme les clauses
     * `tags = …` que `buildFilter()` pose une à une au premier niveau du filtre Meilisearch.
     *
     * @param  Builder<Property>  $query
     */
    private function equipements(Builder $query, mixed $brut): void
    {
        foreach (self::valeurs($brut) as $nom) {
            // TCK-633 (D9) — les seuls équipements que la fiche montre, comme l'index de la liste
            // (`Property::toSearchableArray`) : pas la proposition en attente d'un autre auteur.
            $query->whereHas('tagsVisibles', fn (Builder $q) => $q->whereRaw(
                CaseInsensitive::sql('tags.name').' = ?',
                [CaseInsensitive::fold($nom)],
            ));
        }
    }

    /** @return list<string> */
    private static function valeurs(mixed $brut): array
    {
        if ($brut === null || $brut === '') {
            return [];
        }
        $liste = is_array($brut) ? $brut : explode(',', (string) $brut);

        return array_values(array_unique(array_filter(
            array_map(static fn ($v) => trim((string) $v), $liste),
            static fn (string $v) => $v !== '',
        )));
    }
}
