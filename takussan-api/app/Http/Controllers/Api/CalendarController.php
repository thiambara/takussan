<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\IndexCalendarRequest;
use App\Services\Calendar\CalendarEventCollector;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;

/**
 * TCK-072 — Agrégateur calendrier ; TCK-591 — cinq types (réservations, visites, tâches, échéances
 * de bail, interventions), filtre « Mes rendez-vous », fenêtre bornée.
 *
 * Le périmètre vit dans {@see CalendarEventCollector}, partagé avec le flux iCalendar (ADR-0034) :
 * il est jugé sur le prédicat « personnel de l'agence » et non plus sur `$user->agency_id`, qui
 * ouvrait l'agenda de toute l'agence à un bailleur.
 */
class CalendarController extends Controller
{
    public function __construct(
        private readonly CalendarEventCollector $collector,
    ) {}

    public function index(IndexCalendarRequest $request): JsonResponse
    {
        $user = $request->user();

        $validated = $request->validated();

        // Cross-agency filter is admin-only so a tenant of agency A cannot
        // probe agency B's agenda by passing `agency_id=B`.
        $agencyFilter = null;
        if (array_key_exists('agency_id', $validated)) {
            abort_code_unless($user->isSuperAdmin(), 403, 'calendar.other_agency_forbidden');
            $agencyFilter = (int) $validated['agency_id'];
        }

        $events = $this->collector->collect(
            user: $user,
            staffAgencyId: CalendarEventCollector::agencyOf($request),
            start: Carbon::parse($validated['start_date']),
            end: Carbon::parse($validated['end_date']),
            types: collect($validated['types'] ?? CalendarEventCollector::DEFAULT_TYPES)->unique()->values()->all(),
            mine: (bool) ($validated['mine'] ?? false),
            propertyId: isset($validated['property_id']) ? (int) $validated['property_id'] : null,
            propertyIds: collect($validated['property_ids'] ?? [])->filter()->map(fn ($id) => (int) $id)->values()->all(),
            agencyFilter: $agencyFilter,
        );

        return $this->json([
            'data' => $events,
        ]);
    }
}
