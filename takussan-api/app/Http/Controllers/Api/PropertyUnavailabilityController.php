<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\IndexPropertyUnavailabilityRequest;
use App\Http\Requests\Api\StorePropertyUnavailabilityRequest;
use App\Http\Resources\PropertyUnavailabilityResource;
use App\Models\Property;
use App\Models\PropertyUnavailability;
use App\Services\Booking\PropertyAvailabilityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * TCK-596 §3B (ADR-0041) — les dates bloquées d'un bien : manuelles (créées et supprimées ici) et
 * importées (lues ici, gérées par leur flux).
 */
class PropertyUnavailabilityController extends Controller
{
    public function index(IndexPropertyUnavailabilityRequest $request, Property $property): JsonResponse
    {
        $rows = $property->unavailabilities()
            ->with('feed:id,url_host,label')
            ->where('starts_on', '<', $request->to()->toDateString())
            ->where('ends_on', '>', $request->from()->toDateString())
            ->orderBy('starts_on')
            ->get();

        return $this->json(['data' => PropertyUnavailabilityResource::collection($rows)->toArray($request)]);
    }

    /**
     * Un blocage manuel sur une réservation confirmée est refusé : l'hôte, lui, sait (ADR-0041 §6).
     * Sous le verrou de la ligne du bien, comme une demande et une confirmation (§3A).
     */
    public function store(StorePropertyUnavailabilityRequest $request, Property $property, PropertyAvailabilityService $availability): JsonResponse
    {
        $data = $request->validated();

        $row = DB::transaction(function () use ($property, $data, $request, $availability): PropertyUnavailability {
            Property::query()->whereKey($property->getKey())->lockForUpdate()->first();

            abort_code_if(
                $availability->confirmedOverlap($property->id, Carbon::parse($data['starts_on']), Carbon::parse($data['ends_on'])) !== null,
                422,
                'unavailability.overlaps_booking'
            );

            return $property->unavailabilities()->create([
                'starts_on' => $data['starts_on'],
                'ends_on' => $data['ends_on'],
                'reason' => $data['reason'] ?? null,
                'source' => PropertyUnavailability::SOURCE_MANUAL,
                'created_by_id' => $request->user()->id,
            ]);
        });

        return $this->json(['data' => PropertyUnavailabilityResource::make($row)->toArray($request)], 201);
    }

    public function destroy(PropertyUnavailability $unavailability): Response
    {
        $this->authorize('delete', $unavailability);

        // Une plage importée reviendrait à la synchronisation suivante : elle se retire à la source.
        abort_code_if($unavailability->isImported(), 422, 'unavailability.imported_locked');

        $unavailability->delete();

        return response()->noContent();
    }
}
