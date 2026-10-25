<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\TransferPropertyOwnerRequest;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Services\Property\PropertyOwnerTransfer;
use Illuminate\Http\JsonResponse;

/**
 * TCK-999 (P15.06, Q5 ; ADR-0036, amendement du 2026-10-19, voie 3) — « changer le titulaire » d'un
 * bien saisi au nom du personnel. Le geste est explicite : l'aperçu dit ce qui suit le bien et ce qui
 * reste, sans rien écrire ; le transfert le fait. La règle vit dans {@see PropertyOwnerTransfer}.
 */
class PropertyOwnerController extends Controller
{
    public function __construct(private readonly PropertyOwnerTransfer $transfert) {}

    public function preview(TransferPropertyOwnerRequest $request, Property $property): JsonResponse
    {
        $bailleur = $request->bailleur();
        ['passent' => $passent, 'restent' => $restent] = $this->transfert->apercu($property, $bailleur);

        return $this->json(['data' => [
            'property_id' => $property->id,
            'current_owner' => $this->personne(User::query()->find($property->user_id)),
            'new_owner' => $this->personne($bailleur),
            'leases_moving' => $passent->map(fn (Lease $bail) => $this->bail($bail))->all(),
            'leases_staying' => $restent->map(fn (Lease $bail) => $this->bail($bail))->all(),
        ]]);
    }

    public function update(TransferPropertyOwnerRequest $request, Property $property): JsonResponse
    {
        $bailleur = $request->bailleur();
        $bilan = $this->transfert->transfer($property, $bailleur, $request->user(), PropertyOwnerTransfer::VOIE_MANUELLE);

        return $this->json(['data' => [
            'property_id' => $property->id,
            'user_id' => (int) $bailleur->id,
            ...$bilan,
        ]]);
    }

    /** @return array{id: int, name: string}|null */
    private function personne(?User $user): ?array
    {
        return $user === null ? null : [
            'id' => (int) $user->id,
            'name' => trim($user->first_name.' '.$user->last_name) ?: (string) $user->username,
        ];
    }

    /** @return array{id: int, reference_number: ?string, status: ?string, tenant_name: ?string} */
    private function bail(Lease $bail): array
    {
        return [
            'id' => (int) $bail->id,
            'reference_number' => $bail->reference_number,
            'status' => $bail->status?->value,
            'tenant_name' => $bail->tenant?->full_name ?: null,
        ];
    }
}
