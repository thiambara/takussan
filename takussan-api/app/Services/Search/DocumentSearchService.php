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
        // Scope + equality filters run as native Scout clauses so the search
        // engine filters and paginates server-side — yielding a correct total.
        $search = Document::search($params['q']);

        // Scoping: non-admin users see only their own uploaded documents.
        if (! $user->isSuperAdmin()) {
            $search->where('uploaded_by', $user->id);
        }

        if (! empty($params['filter']['type'])) {
            $search->where('type', $params['filter']['type']);
        }

        if (($params['sort'] ?? null) === '-created_at') {
            $search->orderBy('created_at', 'desc');
        }

        // Date range stays an Eloquent refinement: created_at is a datetime
        // column in the DB but an int timestamp in the index, so a native
        // Scout clause would only be correct against one of the two engines.
        if (! empty($params['filter']['date_from']) || ! empty($params['filter']['date_to'])) {
            $search->query(function ($builder) use ($params) {
                if (! empty($params['filter']['date_from'])) {
                    $builder->whereDate('created_at', '>=', $params['filter']['date_from']);
                }

                if (! empty($params['filter']['date_to'])) {
                    $builder->whereDate('created_at', '<=', $params['filter']['date_to']);
                }
            });
        }

        $paginator = $search->paginate((int) ($params['per_page'] ?? 20));
        $paginator->getCollection()->loadMissing('media');

        return $paginator;
    }
}
