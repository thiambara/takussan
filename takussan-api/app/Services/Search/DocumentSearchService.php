<?php

namespace App\Services\Search;

use App\Models\Document;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Carbon;

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

        // TCK-786 (P16.05) — la plage de dates filtre DANS le moteur, comme le périmètre :
        // passée en SQL par `query()`, elle s'appliquait à une page déjà découpée par
        // Meilisearch (pages vides, correspondances inatteignables). `created_at` est indexé
        // en timestamp et filtrable ; les bornes restent inclusives au jour, comme `whereDate`.
        if (! empty($params['filter']['date_from'])) {
            $search->where('created_at', '>=', Carbon::parse($params['filter']['date_from'])->startOfDay()->timestamp);
        }

        if (! empty($params['filter']['date_to'])) {
            $search->where('created_at', '<=', Carbon::parse($params['filter']['date_to'])->endOfDay()->timestamp);
        }

        $paginator = $search->paginate((int) ($params['per_page'] ?? 20));
        $paginator->getCollection()->loadMissing('media');

        return $paginator;
    }
}
