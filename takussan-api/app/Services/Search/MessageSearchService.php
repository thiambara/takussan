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

        $query = Message::search($params['q'])
            ->query(function ($builder) use ($conversationIds, $params) {
                $builder->whereIn('conversation_id', $conversationIds);

                if (! empty($params['filter']['conversation'])) {
                    $builder->where('conversation_id', (int) $params['filter']['conversation']);
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

        return $query->paginate($perPage);
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
