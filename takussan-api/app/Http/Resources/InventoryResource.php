<?php

namespace App\Http\Resources;

use App\Http\Requests\InventorySignRequest;
use App\Http\Resources\Bases\BaseResource;
use App\Models\User;
use App\Services\Inventory\InventorySignatureService;
use App\Services\Lease\LandlordSignatory;
use App\Services\Media\PrivateMediaAccess;
use Illuminate\Http\Request;

class InventoryResource extends BaseResource
{
    private ?User $viewer = null;

    private ?InventorySignatureService $signatures = null;

    /**
     * TCK-596 — `show` seulement : `can_sign_as` se juge pour l'utilisateur courant, par le même
     * prédicat que la signature elle-même. Le front ouvre le canevas à qui l'API laisse signer.
     */
    public function forViewer(?User $viewer, InventorySignatureService $signatures): static
    {
        $this->viewer = $viewer;
        $this->signatures = $signatures;

        return $this;
    }

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'lease_id' => $this->lease_id,
            'property_id' => $this->property_id,
            'type' => $this->type?->value,
            'conducted_by' => $this->conducted_by,
            'tenant_id' => $this->tenant_id,
            'conducted_at' => $this->iso($this->conducted_at),
            'status' => $this->status?->value,
            'general_condition' => $this->general_condition?->value,
            'rooms' => $this->rooms,
            'notes' => $this->notes,
            'tenant_signed' => (bool) $this->tenant_signed,
            'tenant_signed_at' => $this->iso($this->tenant_signed_at),
            'tenant_signature_hash' => $this->tenant_signature_hash,
            'owner_signed' => (bool) $this->owner_signed,
            'owner_signed_at' => $this->iso($this->owner_signed_at),
            'owner_signature_hash' => $this->owner_signature_hash,
            // TCK-596 — qui a signé pour le bailleur, et pour le compte de qui (nul : lui-même).
            'owner_signed_by_user_id' => $this->owner_signed_by_user_id,
            'owner_signed_on_behalf_of_user_id' => $this->owner_signed_on_behalf_of_user_id,
            'signed_at' => $this->iso($this->signed_at),
            'traceability_hash' => $this->traceability_hash,
            'room_photos' => $this->whenLoaded('media', fn () => $this->roomPhotos()),
            'can_sign_as' => $this->when(
                $this->viewer !== null && $this->signatures !== null,
                fn () => array_values(array_filter(
                    InventorySignRequest::ROLES,
                    fn (string $role) => $this->signatures->canSignAs($this->resource, $this->viewer, $role),
                )),
            ),
            // TCK-596 — quand le lecteur signerait POUR LE COMPTE du bailleur, le canevas le dit.
            'sign_on_behalf_of' => $this->when(
                $this->viewer !== null && $this->signatures !== null,
                fn () => $this->signOnBehalfOf(),
            ),
            // TCK-182 — surface human-readable labels when the related models
            // are eager-loaded so the customer UI can render `<bien>` /
            // `<bail.reference>` instead of raw ids.
            'property' => $this->whenLoaded('property', fn () => $this->property ? [
                'id' => $this->property->id,
                'title' => $this->property->title,
                'slug' => $this->property->slug,
            ] : null),
            'lease' => $this->whenLoaded('lease', fn () => $this->lease ? [
                'id' => $this->lease->id,
                'reference_number' => $this->lease->reference_number,
            ] : null),
            'created_at' => $this->iso($this->created_at),
        ];
    }

    /** @return array{id: int, full_name: string}|null */
    private function signOnBehalfOf(): ?array
    {
        $lease = $this->lease;
        if ($lease === null || ! $this->signatures->canSignAs($this->resource, $this->viewer, InventorySignRequest::ROLE_LANDLORD)) {
            return null;
        }

        $landlordId = LandlordSignatory::onBehalfOf($this->viewer, $lease);
        $landlord = $landlordId !== null ? User::query()->find($landlordId) : null;

        return $landlord !== null ? ['id' => (int) $landlord->id, 'full_name' => $landlord->getFullNameAttribute()] : null;
    }

    /**
     * Les photos de pièces groupées dans l'ordre des pièces de l'état des lieux, chacune par URL
     * signée (collection privée, ADR-0029). Une photo dont la pièce a disparu de `rooms` reste
     * visible, dans un groupe à part, plutôt que de devenir invisible et indélébile.
     *
     * @return list<array{room_name: string, photos: list<array{id: int, url: string, room_name: string}>}>
     */
    private function roomPhotos(): array
    {
        $access = app(PrivateMediaAccess::class);
        $groups = [];
        foreach ($this->rooms ?? [] as $room) {
            if (is_array($room) && is_string($room['name'] ?? null)) {
                $groups[$room['name']] = [];
            }
        }

        foreach ($this->media->where('collection_name', 'room_photos')->sortBy('id') as $media) {
            $name = (string) $media->getCustomProperty('room_name');
            $groups[$name][] = [
                'id' => (int) $media->id,
                'url' => $access->signedUrl($media),
                'room_name' => $name,
            ];
        }

        $out = [];
        foreach ($groups as $name => $photos) {
            $out[] = ['room_name' => (string) $name, 'photos' => $photos];
        }

        return $out;
    }
}
