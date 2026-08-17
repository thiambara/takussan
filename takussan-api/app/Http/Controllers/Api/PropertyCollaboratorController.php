<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\StorePropertyCollaboratorRequest;
use App\Http\Requests\Api\UpdatePropertyCollaboratorRequest;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PropertyCollaboratorController extends Controller
{
    public function index(Request $request, Property $property): JsonResponse
    {
        $this->authorize('view', $property);

        $collaborators = $property->collaborators()->with('user')->get();

        return $this->json(['data' => $collaborators]);
    }

    public function store(StorePropertyCollaboratorRequest $request, Property $property): JsonResponse
    {
        $this->authorize('update', $property);

        $data = $request->validated();

        $exists = $property->collaborators()->where('user_id', $data['user_id'])->exists();
        abort_if($exists, 422, __('messages.collaborator_already_exists'));

        $collaborator = DB::transaction(function () use ($property, $data) {
            $this->assertCommissionWithinCapLocked(
                $property,
                (float) ($data['commission_share'] ?? 0),
            );

            return $property->collaborators()->create(array_merge($data, [
                'invited_at' => now(),
            ]));
        });

        return $this->json(['data' => $collaborator->load('user')], 201);
    }

    public function update(UpdatePropertyCollaboratorRequest $request, Property $property, PropertyCollaborator $collaborator): JsonResponse
    {
        $this->authorize('update', $property);
        abort_if($collaborator->property_id !== $property->id, 404);

        $data = $request->validated();

        DB::transaction(function () use ($property, $collaborator, $data) {
            if (array_key_exists('commission_share', $data)) {
                $this->assertCommissionWithinCapLocked(
                    $property,
                    (float) ($data['commission_share'] ?? 0),
                    excludingCollaboratorId: $collaborator->id,
                );
            }

            $collaborator->fill($data)->save();
        });

        return $this->json(['data' => $collaborator->refresh()->load('user')]);
    }

    public function destroy(Request $request, Property $property, PropertyCollaborator $collaborator): JsonResponse
    {
        $this->authorize('update', $property);
        abort_if($collaborator->property_id !== $property->id, 404);

        $collaborator->delete();

        return $this->json(null, 204);
    }

    /**
     * Sum existing collaborator shares with a row-level lock so concurrent
     * writers serialize on the same rows and the 100% cap is enforced
     * atomically. Must be called inside a DB::transaction.
     */
    protected function assertCommissionWithinCapLocked(
        Property $property,
        float $candidateShare,
        ?int $excludingCollaboratorId = null,
    ): void {
        $query = $property->collaborators();
        if ($excludingCollaboratorId !== null) {
            $query->where('id', '!=', $excludingCollaboratorId);
        }
        $currentTotal = (float) $query->lockForUpdate()->sum('commission_share');

        if (round($currentTotal + $candidateShare, 2) > 100.0) {
            throw ValidationException::withMessages([
                'commission_share' => [__('validation.commission_share_exceeds_cap')],
            ]);
        }
    }
}
