<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\CalendarFeed;
use App\Services\Calendar\CalendarEventCollector;
use App\Services\Calendar\CalendarFeedService;
use App\Services\Calendar\IcsCalendarRenderer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * TCK-591 (ADR-0034) — l'abonnement d'agenda : créer / faire tourner / révoquer son lien
 * (`me/calendar-feed`), et le lire (`calendar-feed/{token}.ics`, public, limité en débit).
 *
 * Le lien porte le secret : il n'est rendu qu'une fois, à la création, et ne se relit jamais.
 */
class CalendarFeedController extends Controller
{
    public function __construct(
        private readonly CalendarFeedService $feeds,
        private readonly IcsCalendarRenderer $renderer,
    ) {}

    /** L'état du lien de l'appelant dans l'agence courante — jamais le jeton. */
    public function current(Request $request): JsonResponse
    {
        $user = $request->user();
        $agencyId = CalendarEventCollector::staffAgencyIdOf($user);

        $feed = CalendarFeed::query()
            ->active()
            ->where('user_id', $user->id)
            ->when($agencyId === null, fn ($q) => $q->whereNull('agency_id'), fn ($q) => $q->where('agency_id', $agencyId))
            ->latest('id')
            ->first();

        return $this->json(['data' => [
            'active' => $feed !== null,
            'created_at' => $feed?->created_at?->toIso8601String(),
            'last_accessed_at' => $feed?->last_accessed_at?->toIso8601String(),
        ]]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $issued = $this->feeds->issue($user, CalendarEventCollector::staffAgencyIdOf($user));

        return $this->json(['data' => [
            'active' => true,
            'url' => url('/api/calendar-feed/'.$issued['token'].'.ics'),
            'created_at' => $issued['feed']->created_at?->toIso8601String(),
            'last_accessed_at' => null,
        ]], 201);
    }

    public function destroy(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->feeds->revoke($user, CalendarEventCollector::staffAgencyIdOf($user));

        return $this->json(null, 204);
    }

    /**
     * 404 pour un lien inconnu, révoqué ou dont le titulaire a quitté l'agence — jamais 401/403,
     * qui confirmeraient qu'un lien a existé.
     */
    public function show(string $token): Response
    {
        $feed = $this->feeds->resolve($token);
        abort_if($feed === null, 404);

        $this->feeds->touch($feed);

        $locale = $feed->user->preferred_language ?: (string) config('app.locale');
        $body = $this->renderer->render(
            $this->feeds->events($feed),
            __('calendar.feed.name', [], $locale),
            $locale,
        );

        return response($body, 200, [
            'Content-Type' => 'text/calendar; charset=utf-8',
            'Content-Disposition' => 'inline; filename="takussan.ics"',
            'Cache-Control' => 'private, no-store',
        ]);
    }
}
