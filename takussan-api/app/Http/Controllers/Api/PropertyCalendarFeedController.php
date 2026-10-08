<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\StorePropertyCalendarFeedRequest;
use App\Http\Resources\PropertyCalendarFeedResource;
use App\Jobs\SyncPropertyCalendarFeedJob;
use App\Models\Property;
use App\Models\PropertyCalendarFeed;
use App\Services\Booking\PropertyCalendarSyncService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\RateLimiter;

/**
 * TCK-596 §3B (ADR-0041 §5) — les flux iCal importés d'un bien. L'URL n'en ressort jamais : elle
 * porte souvent un secret de la plateforme tierce ; seul son hôte est rendu.
 */
class PropertyCalendarFeedController extends Controller
{
    public function index(Request $request, Property $property): JsonResponse
    {
        $this->authorize('update', $property);

        $feeds = $property->calendarFeeds()->orderBy('id')->get();

        return $this->json(['data' => PropertyCalendarFeedResource::collection($feeds)->toArray($request)]);
    }

    public function store(StorePropertyCalendarFeedRequest $request, Property $property, PropertyCalendarSyncService $sync): JsonResponse
    {
        $data = $request->validated();

        $feed = $sync->register($property, $data['url'], $data['label'] ?? null, $request->user());

        // VERIF-596 m3 — la première synchronisation (appel sortant, 10 s au plus) quitte la
        // requête : le flux est rendu en `pending`, et une tâche de file va le chercher.
        $payload = PropertyCalendarFeedResource::make($feed)->toArray($request);
        SyncPropertyCalendarFeedJob::dispatch($feed->id);

        return $this->json(['data' => $payload], 201);
    }

    /** « Synchroniser maintenant » : un appel par minute et par flux (ADR-0041 §5). */
    public function sync(Request $request, PropertyCalendarFeed $feed, PropertyCalendarSyncService $sync): JsonResponse
    {
        $this->authorize('update', $feed->property);
        abort_code_unless($feed->property->hasHostCalendar(), 422, 'calendar_feed.property_closed');

        $key = 'calendar-feed-sync:'.$feed->id;
        abort_code_if(RateLimiter::tooManyAttempts($key, 1), 429, 'calendar_feed.sync_throttled');
        RateLimiter::hit($key, 60);

        $sync->sync($feed);

        return $this->json(['data' => PropertyCalendarFeedResource::make($feed->refresh())->toArray($request)]);
    }

    public function destroy(PropertyCalendarFeed $feed): Response
    {
        $this->authorize('update', $feed->property);

        // Ses plages importées partent avec lui (clé étrangère en cascade).
        $feed->delete();

        return response()->noContent();
    }
}
