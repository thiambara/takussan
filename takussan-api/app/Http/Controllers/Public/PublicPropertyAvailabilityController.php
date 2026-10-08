<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Public\PublicPropertyAvailabilityRequest;
use App\Models\Property;
use App\Services\Booking\PropertyAvailabilityService;
use Illuminate\Http\JsonResponse;

/**
 * TCK-596 §3B (ADR-0041) — les plages occupées d'un bien public, pour griser les nuits du tunnel
 * de réservation. Des dates, rien d'autre : ni réservation, ni motif, ni source.
 */
class PublicPropertyAvailabilityController extends Controller
{
    public function __invoke(PublicPropertyAvailabilityRequest $request, PropertyAvailabilityService $availability, string $slug): JsonResponse
    {
        $property = Property::query()
            ->public()
            ->where('slug', $slug)
            ->firstOrFail();

        $from = $request->from();
        $to = $request->to();

        return $this->json([
            'data' => [
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
                'occupied' => $availability->occupiedRanges($property, $from, $to),
            ],
        ]);
    }
}
