<?php

namespace App\Services\Model;

use App\Models\Property;
use App\Models\SavedSearch;
use App\Models\User;
use App\Support\DistanceHaversine;
use Carbon\CarbonInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Collection;

class SearchService
{
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

        // TCK-350 — borne temporelle des alertes de recherche sauvegardée.
        //
        // ⚠ CETTE CLÉ N'EST PAS UN CRITÈRE D'UTILISATEUR, et elle n'a qu'un
        // seul alimentateur légitime : l'argument `$publieApres` de
        // `getMatchingProperties()`, qui la pose dans un tableau LOCAL. Elle
        // n'est jamais lue depuis `SavedSearch.criteria` — cf. le `unset()`
        // explicite là-bas, et la décision d'étape 0 du ticket.
        //
        // Le filtre vit ICI, dans la requête, et non dans un tri-après-coup
        // côté job : une recherche large rendrait sinon une première page
        // entièrement composée de biens déjà notifiés, et tairait la nouveauté
        // classée plus loin.
        if (! empty($filters['published_after'])) {
            $query->where('published_at', '>', $filters['published_after']);
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
        //
        // ⚠ L'expression haversine vit dans `App\Support\DistanceHaversine`, et
        // PAS ici : `GET /api/public/properties/map` l'emploie aussi. Deux copies
        // dont une seule porterait le clamp `LEAST/GREATEST`, c'est exactement le
        // defaut que TCK-346 a paye (cf. le docblock de la classe).
        if ($this->aUnPointEtUnRayon($filters)) {
            $lat = (float) $filters['lat'];
            $lng = (float) $filters['lng'];
            $radius = (float) $filters['radius_km'];
            $query->whereHas(
                'address',
                fn ($q) => DistanceHaversine::restreindreAuRayonKm($q, $lat, $lng, $radius)
            );
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

    /**
     * Les biens que cette recherche sauvegardée capte, éventuellement bornés
     * aux seuls biens publiés APRÈS `$publieApres`.
     *
     * ⚠ **`$publieApres` est un ARGUMENT et jamais une clé de `criteria`**
     * (TCK-350, décision d'étape 0). `criteria` est un tableau LIBRE — validé
     * `['required','array']`, sans schéma de clés — et `saveSearch()` y recopie
     * *tout* ce qu'on lui passe (`:100-106`, `name` et `notification_frequency`
     * compris). Une clé de contrôle qui y transiterait serait donc PERSISTÉE, et
     * le jour où l'on migrera les `criteria` vers le vocabulaire de `/search`
     * (ADR-0023), il faudrait savoir laquelle des clés n'en était pas une.
     *
     * Le `unset()` ci-dessous n'est pas une précaution de style : il rend cette
     * propriété VRAIE même si une ligne portait déjà la clé. C'est lui qui fait
     * que la borne ne peut venir que d'ici.
     *
     * @return Collection<int,Property>
     */
    public function getMatchingProperties(SavedSearch $search, ?CarbonInterface $publieApres = null): Collection
    {
        $filters = $search->criteria ?? [];

        unset($filters['published_after']);

        if ($publieApres !== null) {
            $filters['published_after'] = $publieApres;
        }

        $paginator = $this->search($filters);

        return $paginator->getCollection();
    }
}
