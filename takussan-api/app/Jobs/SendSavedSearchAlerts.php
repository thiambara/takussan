<?php

namespace App\Jobs;

use App\Models\Enums\NotificationType;
use App\Models\SavedSearch;
use App\Services\Model\NotificationService;
use App\Services\Model\SearchService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class SendSavedSearchAlerts implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(SearchService $searchService, NotificationService $notifications): void
    {
        SavedSearch::with('user')
            ->where('is_active', true)
            ->whereNotNull('user_id')
            ->each(function (SavedSearch $search) use ($searchService, $notifications): void {
                $criteria = $search->criteria ?? [];

                // Only match properties published after the last alert
                if ($search->last_notified_at) {
                    $criteria['published_after'] = $search->last_notified_at->toDateTimeString();
                }

                $matches = $searchService->getMatchingProperties($search);

                if ($matches->isEmpty()) {
                    return;
                }

                $notifications->notify(
                    $search->user,
                    NotificationType::System,
                    'Nouvelles propriétés correspondent à votre recherche',
                    $matches->count().' bien(s) correspondent à votre recherche « '.($search->name).' ».',
                    ['saved_search_id' => $search->id, 'count' => $matches->count()],
                );

                $search->update(['last_notified_at' => now()]);
            });
    }
}
