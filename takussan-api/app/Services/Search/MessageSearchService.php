<?php

namespace App\Services\Search;

use App\Models\ConversationParticipant;
use App\Models\Message;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

class MessageSearchService
{
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

        return $search->paginate((int) ($params['per_page'] ?? 20));
    }

    /** @return list<int> */
    private function userConversationIds(User $user): array
    {
        return ConversationParticipant::query()
            ->where('user_id', $user->id)
            ->whereNull('left_at')
            ->pluck('conversation_id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }
}
