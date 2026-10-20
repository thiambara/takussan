<?php

namespace App\Services\Search;

use App\Models\Message;
use App\Models\User;
use App\Services\Messaging\ConversationAccess;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Carbon;

class MessageSearchService
{
    public function __construct(private readonly ConversationAccess $access) {}

    /**
     * @param  array<string, mixed>  $params  Validated search parameters
     */
    public function search(User $user, array $params): LengthAwarePaginator
    {
        $conversationIds = $this->userConversationIds($user);

        // Scope + equality filters run as native Scout clauses so the search
        // engine filters and paginates server-side — yielding a correct total.
        // An empty conversation list resolves to "IN []", which matches nothing.
        $search = Message::search($params['q'])
            ->whereIn('conversation_id', $conversationIds);

        if (! empty($params['filter']['conversation'])) {
            $search->where('conversation_id', (int) $params['filter']['conversation']);
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

        // TCK-1010 (P59.02) — `MessageResource` lit les pièces jointes de chaque message : le
        // paginateur de Scout ne précharge rien, comme `DocumentSearchService`.
        $paginator = $search->paginate((int) ($params['per_page'] ?? 20));
        $paginator->getCollection()->loadMissing('media');

        return $paginator;
    }

    /**
     * TCK-592 (passe 2, N1) — les fils que la garde de conversation ouvre, pas la seule
     * participation : un prestataire en pause y retrouvait le texte et les notes vocales.
     *
     * @return list<int>
     */
    private function userConversationIds(User $user): array
    {
        return $this->access->participatingQuery($user)
            ->pluck('conversations.id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }
}
