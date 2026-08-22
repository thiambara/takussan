<?php

namespace App\Services\Model;

use App\Models\Property;
use App\Models\SavedSearch;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Collection;

class SearchService
{
    /**
     * Distance orthodromique en KILOMETRES entre (?, ?) et (latitude, longitude).
     *
     * ⚠⚠ `LEAST(1.0, GREATEST(-1.0, …))` N'EST PAS un ornement defensif : sans
     * lui, cette requete FAIT PLANTER LE JOB D'ALERTES SUR POSTGRESQL. Mesure
     * le 2026-08-22 sur PostgreSQL 17 (`tests/Feature/Search/SearchServiceGeoTest.php`,
     * cas « un bien sans coordonnees » et « un brouillon ») :
     *
     *   SQLSTATE[22003]: Numeric value out of range: 7 ERROR: input is out of range
     *
     * L'argument d'`acos()` vaut mathematiquement 1 quand le point de recherche
     * COINCIDE avec les coordonnees d'un bien — le cas « des biens autour de
     * celui-ci » — et l'arithmetique flottante le rend regulierement a
     * 1,0000000000000002. MySQL et SQLite rendaient alors NULL et la ligne
     * etait simplement ecartee ; PostgreSQL LEVE. Et comme
     * `SendSavedSearchAlerts` itere par `each()`, l'exception ne perd pas une
     * recherche : elle tue le job, donc TOUTES les alertes suivantes.
     *
     * C'est exactement la classe de divergence qu'ADR-0020 a rendue visible en
     * amenant la suite de tests sur le moteur de production — et ce chemin
     * n'avait aucun test jusqu'a TCK-346.
     */
    private const HAVERSINE_KM = '(6371 * acos(LEAST(1.0, GREATEST(-1.0, '
        .'cos(radians(?)) * cos(radians(latitude)) * cos(radians(longitude) - radians(?)) '
        .'+ sin(radians(?)) * sin(radians(latitude))))))';

    /** @param array<string,mixed> $filters */
    public function search(array $filters, ?User $user = null): LengthAwarePaginator
    {
        $query = Property::query()->with('address');

        // Public-only unless authenticated
        if ($user === null || ! $user->isSuperAdmin()) {
            $query->public();
        }

        $stringFilters = ['type', 'contract_type', 'status', 'currency', 'title_type'];
        foreach ($stringFilters as $field) {
            if (! empty($filters[$field])) {
                $query->where($field, $filters[$field]);
            }
        }

        if (! empty($filters['min_price'])) {
            $query->where('price', '>=', $filters['min_price']);
        }
        if (! empty($filters['max_price'])) {
            $query->where('price', '<=', $filters['max_price']);
        }
        if (! empty($filters['min_area'])) {
            $query->where('area', '>=', $filters['min_area']);
        }
        if (! empty($filters['bedrooms'])) {
            $query->where('bedrooms', '>=', $filters['bedrooms']);
        }
        if (! empty($filters['city'])) {
            $query->whereHas('address', fn ($q) => $q->where('city', 'like', '%'.$filters['city'].'%'));
        }
        if (isset($filters['furnished'])) {
            $query->where('furnished', $filters['furnished']);
        }

        // Tag-based filtering
        if (! empty($filters['tags'])) {
            $tags = is_array($filters['tags']) ? $filters['tags'] : explode(',', $filters['tags']);
            $query->whereHas('tags', fn ($q) => $q->whereIn('tags.name', $tags));
        }

        // Rectangle geographique (ADR-0023, chemin 3).
        //
        // ⚠ `is_numeric` et non `! empty` : `empty('0')` est VRAI, et une borne
        // a 0 est une latitude ou une longitude parfaitement valide. La garde
        // d'origine faisait disparaitre le filtre en silence sur l'equateur ou
        // sur le meridien de Greenwich (TCK-346).
        if ($this->aQuatreBornes($filters)) {
            $query->whereHas('address', function ($q) use ($filters) {
                $q->whereBetween('latitude', [$filters['lat_min'], $filters['lat_max']])
                    ->whereBetween('longitude', [$filters['lng_min'], $filters['lng_max']]);
            });
        }

        // Rayon autour d'un point, en KILOMETRES — meme nom et meme unite que
        // `GET /api/public/properties/search` (ADR-0023), pour que la
        // convergence future soit un changement de moteur et non de contrat.
        if ($this->aUnPointEtUnRayon($filters)) {
            $lat = (float) $filters['lat'];
            $lng = (float) $filters['lng'];
            $radius = (float) $filters['radius_km'];
            $query->whereHas('address', function ($q) use ($lat, $lng, $radius) {
                $q->whereNotNull('latitude')
                    ->whereNotNull('longitude')
                    ->whereRaw(self::HAVERSINE_KM.' <= ?', [$lat, $lng, $lat, $radius]);
            });
        }

        $sort = $filters['sort'] ?? 'published_at';
        $direction = ($filters['direction'] ?? 'desc') === 'asc' ? 'asc' : 'desc';
        $allowedSorts = ['price', 'area', 'published_at', 'created_at'];
        if (in_array($sort, $allowedSorts, true)) {
            $query->orderBy($sort, $direction);
        }

        return $query->paginate((int) ($filters['per_page'] ?? 20));
    }

    /** @param array<string,mixed> $criteria */
    public function saveSearch(User $user, array $criteria): SavedSearch
    {
        return SavedSearch::create([
            'user_id' => $user->id,
            'name' => $criteria['name'] ?? 'Recherche sauvegardée',
            'criteria' => $criteria,
            'notification_frequency' => $criteria['notification_frequency'] ?? 'daily',
            'is_active' => true,
        ]);
    }

    /**
     * Les quatre bornes du rectangle sont fournies et numeriques.
     *
     * @param  array<string,mixed>  $filters
     */
    private function aQuatreBornes(array $filters): bool
    {
        foreach (['lat_min', 'lat_max', 'lng_min', 'lng_max'] as $cle) {
            if (! isset($filters[$cle]) || ! is_numeric($filters[$cle])) {
                return false;
            }
        }

        return true;
    }

    /**
     * Un point d'origine complet ET un rayon strictement positif.
     *
     * @param  array<string,mixed>  $filters
     */
    private function aUnPointEtUnRayon(array $filters): bool
    {
        return isset($filters['lat'], $filters['lng'], $filters['radius_km'])
            && is_numeric($filters['lat'])
            && is_numeric($filters['lng'])
            && is_numeric($filters['radius_km'])
            && (float) $filters['radius_km'] > 0;
    }

    /** @return Collection<int,Property> */
    public function getMatchingProperties(SavedSearch $search): Collection
    {
        $filters = $search->criteria ?? [];
        $paginator = $this->search($filters);

        return $paginator->getCollection();
    }
}
