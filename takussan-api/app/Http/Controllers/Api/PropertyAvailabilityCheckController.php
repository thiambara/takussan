<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\AnswerPropertyAvailabilityRequest;
use App\Models\Property;
use App\Services\Radar\Observatory\RadarAvailabilityCheck;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-2432 — la question posée au titulaire d'un bien publié par le Radar dont la source a disparu, et sa réponse. La règle
 * vit dans {@see RadarAvailabilityCheck}.
 */
class PropertyAvailabilityCheckController extends Controller
{
    public function __construct(private readonly RadarAvailabilityCheck $checks) {}

    /** `open` : une question attend une réponse, et l'appelant peut y répondre. */
    public function show(Request $request, Property $property): JsonResponse
    {
        $this->authorize('view', $property);
        $since = $request->user()->can('update', $property) ? $this->checks->openSince($property) : null;

        return $this->json(['data' => [
            'property_id' => $property->id,
            'open' => $since !== null,
            'asked_at' => $this->instant($since),
        ]]);
    }

    public function answer(AnswerPropertyAvailabilityRequest $request, Property $property): JsonResponse
    {
        $result = $this->checks->answer($property, (string) $request->validated('answer'), $request->user());

        return $this->json(['data' => [
            'property_id' => $property->id,
            'answer' => $result['answer'],
            'status' => $result['status'],
        ]]);
    }
}
