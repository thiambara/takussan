<?php

namespace App\Services\Search;

use App\Models\Document;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

class DocumentSearchService
{
    /**
     * @param  array<string, mixed>  $params  Validated search parameters
     */
    public function search(User $user, array $params): LengthAwarePaginator
    {
        $query = Document::search($params['q'])
            ->query(function ($builder) use ($user, $params) {
                // Scoping: non-admin users see only their own uploaded documents
                if (! $user->isSuperAdmin()) {
                    $builder->where('uploaded_by', $user->id);
                }

                if (! empty($params['filter']['type'])) {
                    $builder->where('type', $params['filter']['type']);
                }

                if (! empty($params['filter']['date_from'])) {
                    $builder->whereDate('created_at', '>=', $params['filter']['date_from']);
                }

                if (! empty($params['filter']['date_to'])) {
                    $builder->whereDate('created_at', '<=', $params['filter']['date_to']);
                }

                if (($params['sort'] ?? null) === '-created_at') {
                    $builder->orderByDesc('created_at');
                }
            });

        $perPage = (int) ($params['per_page'] ?? 20);

        $paginator = $query->paginate($perPage);
        $paginator->getCollection()->loadMissing('media');

        return $paginator;
    }
}
