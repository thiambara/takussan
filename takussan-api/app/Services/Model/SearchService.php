<?php

namespace App\Services\Model;

use App\Models\Property;
use App\Models\SavedSearch;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Collection;

class SearchService
{
    /** @param array<string,mixed> $filters */
    public function search(array $filters, ?User $user = null): LengthAwarePaginator
    {
        $query = Property::query()->with('address');

        // Public-only unless authenticated
        if ($user === null || ! $user->hasRole(['admin', 'super_admin'])) {
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

    /** @return Collection<int,Property> */
    public function getMatchingProperties(SavedSearch $search): Collection
    {
        $filters = $search->criteria ?? [];
        $paginator = $this->search($filters);

        return $paginator->getCollection();
    }
}
