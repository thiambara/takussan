<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\CalendarFeed;
use App\Services\Calendar\CalendarEventCollector;
use App\Services\Calendar\CalendarFeedService;
use App\Services\Calendar\IcsCalendarRenderer;
use App\Support\ImpersonationContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * TCK-591 (ADR-0034) — l'abonnement d'agenda : créer / faire tourner / révoquer son lien
 * (`me/calendar-feed`), et le lire (`calendar-feed/{token}.ics`, public, limité en débit).
 *
 * Le lien porte le secret. TCK-2887 (ADR-0121) — il se relit par son titulaire (`current`), depuis
 * une copie chiffrée, jamais sous impersonation (ADR-0055 § 3).
 */
class CalendarFeedController extends Controller
{
    public function __construct(
        private readonly CalendarFeedService $feeds,
        private readonly IcsCalendarRenderer $renderer,
    ) {}

    /**
     * L'état du lien de l'appelant pour son profil actif (agence, ou prestataire).
     *
     * TCK-2887 (ADR-0121) — `url` : le lien complet, relu de sa copie chiffrée ; `null` sans lien,
     * pour un lien antérieur (sans copie) ou une copie indéchiffrable ; clé ABSENTE sous
     * impersonation — le lien est un secret qui survit à la session.
     */
    public function current(Request $request): JsonResponse
    {
        $user = $request->user();
        $agencyId = CalendarEventCollector::agencyOf($request);

        $feed = CalendarFeed::query()
            ->active()
            ->where('user_id', $user->id)
            ->when($agencyId === null, fn ($q) => $q->whereNull('agency_id'), fn ($q) => $q->where('agency_id', $agencyId))
            ->latest('id')
            ->first();

        $data = [
            'active' => $feed !== null,
            'created_at' => $this->instant($feed?->created_at),
            'last_accessed_at' => $this->instant($feed?->last_accessed_at),
        ];

        // TCK-2887 (ADR-0121 § 3) — jamais sous impersonation.
        if (! app(ImpersonationContext::class)->active()) {
            $token = $feed?->readableToken();
            $data['url'] = $token !== null ? self::feedUrl($token) : null;
        }

        return $this->json(['data' => $data])->header('Cache-Control', 'no-store, private');
    }

    /** TCK-2887 — le lien d'un jeton : le même à la création et à la relecture. */
    private static function feedUrl(string $token): string
    {
        return url('/api/calendar-feed/'.$token.'.ics');
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $agencyId = CalendarEventCollector::agencyOf($request);
        $issued = $this->feeds->issue($user, $agencyId);

        return $this->json(['data' => [
            'active' => true,
            'url' => self::feedUrl($issued['token']),
            'created_at' => $this->instant($issued['feed']->created_at),
            'last_accessed_at' => null,
        ]], 201);
    }

    public function destroy(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->feeds->revoke($user, CalendarEventCollector::agencyOf($request));

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
