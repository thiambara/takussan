<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Enums\CollaboratorRole;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class PropertyCollaboratorController extends Controller
{
    public function index(Request $request, Property $property): JsonResponse
    {
        $this->authorizeAccess($request, $property);

        $collaborators = $property->collaborators()->with('user')->get();

        return $this->json(['data' => $collaborators]);
    }

    public function store(Request $request, Property $property): JsonResponse
    {
        $this->authorizeManage($request, $property);

        $data = $request->validate([
            'user_id' => ['required', 'exists:users,id'],
            'role' => ['required', Rule::enum(CollaboratorRole::class)],
            'commission_share' => ['nullable', 'numeric', 'min:0', 'max:100'],
        ]);

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

    public function update(Request $request, Property $property, PropertyCollaborator $collaborator): JsonResponse
    {
        $this->authorizeManage($request, $property);
        abort_if($collaborator->property_id !== $property->id, 404);

        $data = $request->validate([
            'role' => ['sometimes', Rule::enum(CollaboratorRole::class)],
            'commission_share' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
        ]);

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
        $this->authorizeManage($request, $property);
        abort_if($collaborator->property_id !== $property->id, 404);

        $collaborator->delete();

        return $this->json(null, 204);
    }

    protected function authorizeAccess(Request $request, Property $property): void
    {
        $user = $request->user();
        $ok = $user->hasRole(['admin', 'super_admin'])
            || $property->user_id === $user->id
            || ($user->agency_id && $user->agency_id === $property->agency_id);

        abort_unless($ok, 403);
    }

    protected function authorizeManage(Request $request, Property $property): void
    {
        $this->authorizeAccess($request, $property);
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
