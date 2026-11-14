<?php

namespace App\Http\Resources;

use App\Http\Requests\InventorySignRequest;
use App\Http\Resources\Bases\BaseResource;
use App\Models\Enums\InventoryStatus;
use App\Models\Inventory;
use App\Models\User;
use App\Policies\InventoryPolicy;
use App\Services\Inventory\InventoryRetention;
use App\Services\Inventory\InventorySignatureService;
use App\Services\Lease\LandlordSignatory;
use App\Services\Media\PrivateMediaAccess;
use Illuminate\Http\Request;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

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
            'rooms' => $this->viewer !== null ? $this->roomsWithEntryThumbnails() : $this->rooms,
            'notes' => $this->notes,
            // TCK-2646 — pour une sortie, l'entrée signée qu'elle reprend ; et la somme des retenues
            // proposées par ses éléments (nulle pour une entrée).
            'entry_inventory_id' => $this->entry_inventory_id,
            'retention_total' => $this->when(
                array_key_exists('rooms', $this->resource->getAttributes()),
                fn () => InventoryRetention::total($this->type, $this->rooms),
            ),
            'tenant_signed' => (bool) $this->tenant_signed,
            'tenant_signed_at' => $this->iso($this->tenant_signed_at),
            'tenant_signature_hash' => $this->tenant_signature_hash,
            // TCK-2646 (ADR-0098 §5) — la voie de la signature du locataire : `drawn` depuis son compte,
            // `onsite_otp` sur l'appareil du personnel (qui, quel canal, quel numéro masqué). L'IP
            // reste dans l'API.
            'tenant_signature_method' => $this->tenant_signature_method,
            'tenant_signed_via_user_id' => $this->tenant_signed_via_user_id,
            'tenant_otp_channel' => $this->tenant_otp_channel,
            'tenant_otp_destination' => $this->tenant_otp_destination,
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
                fn () => $this->canSignAs(),
            ),
            // P189.02 (TCK-1869) — le verdict d'`InventoryPolicy::update`, qui garde la soumission et
            // les photos : l'écran les jugeait sur le seul statut, et les montrait au locataire et au
            // bailleur suspendu, refusés en 403.
            'abilities' => $this->when($this->viewer !== null, fn (): array => [
                'update' => $this->viewer->can('update', $this->resource),
                // TCK-2648 — « Contester » : la policy appelée EN DIRECT, sans `Gate::before` — le
                // super-admin passerait par la Gate, mais n'est partie ni au bail ni au constat — et
                // seulement quand le service l'accepterait (à signer, ou signé : `inventory.cannot_dispute`).
                'dispute' => in_array($this->status, [InventoryStatus::PendingSignature, InventoryStatus::Signed], true)
                    && app(InventoryPolicy::class)->dispute($this->viewer, $this->resource),
            ]),
            // TCK-2648 — les parties et les signataires NOMMÉS, sous `show` seulement (chargés par le
            // contrôleur) : un id et un nom, jamais un téléphone ni un e-mail.
            'tenant' => $this->when($this->viewer !== null, fn (): ?array => $this->tenant === null ? null : [
                'id' => (int) $this->tenant->id,
                'full_name' => $this->tenant->full_name,
                'first_name' => $this->tenant->first_name,
            ]),
            'landlord' => $this->when($this->viewer !== null, fn (): ?array => self::personne($this->lease?->landlord)),
            'tenant_signed_via' => $this->when($this->viewer !== null, fn (): ?array => self::personne($this->tenantSignedVia)),
            'owner_signed_by' => $this->when($this->viewer !== null, fn (): ?array => self::personne($this->ownerSignedBy)),
            'owner_signed_on_behalf_of' => $this->when($this->viewer !== null, fn (): ?array => self::personne($this->ownerSignedOnBehalfOf)),
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

    /**
     * Les rôles que le lecteur peut signer. TCK-2646 — `tenant_onsite` au personnel habilité à
     * recueillir sur son appareil la signature du locataire, tant que celui-ci n'a pas signé et que
     * l'état des lieux se signe encore. Ce n'est pas un rôle de `sign` : c'est `tenant` + `code`.
     *
     * @return list<string>
     */
    private function canSignAs(): array
    {
        $roles = array_values(array_filter(
            InventorySignRequest::ROLES,
            fn (string $role) => $this->signatures->canSignAs($this->resource, $this->viewer, $role),
        ));

        if (! $this->tenant_signed
            && in_array($this->status, [InventoryStatus::Draft, InventoryStatus::PendingSignature], true)
            && ! in_array(InventorySignRequest::ROLE_TENANT, $roles, true)
            && $this->signatures->canSignOnsite($this->resource, $this->viewer)) {
            $roles[] = InventorySignatureService::ROLE_TENANT_ONSITE;
        }

        return $roles;
    }

    /**
     * TCK-2646 — `show` seulement : chaque élément d'une sortie qui désigne une photo de l'entrée
     * (`entry_photo_id`) reçoit sa vignette, en URL signée résolue à la lecture (collection privée,
     * ADR-0029) — jamais stockée. La photo doit appartenir à l'entrée reprise.
     *
     * @return array<int, mixed>|null
     */
    private function roomsWithEntryThumbnails(): ?array
    {
        $rooms = $this->rooms;
        if (! is_array($rooms) || $this->entry_inventory_id === null) {
            return $rooms;
        }

        $ids = [];
        foreach ($rooms as $room) {
            foreach (is_array($room) && is_array($room['elements'] ?? null) ? $room['elements'] : [] as $element) {
                if (is_array($element) && is_int($element['entry_photo_id'] ?? null)) {
                    $ids[] = $element['entry_photo_id'];
                }
            }
        }
        if ($ids === []) {
            return $rooms;
        }

        $access = app(PrivateMediaAccess::class);
        $photos = Media::query()
            ->whereKey(array_values(array_unique($ids)))
            ->where('model_type', (new Inventory)->getMorphClass())
            ->where('model_id', $this->entry_inventory_id)
            ->where('collection_name', 'room_photos')
            ->get()
            ->keyBy('id');

        foreach ($rooms as $r => $room) {
            foreach (is_array($room) && is_array($room['elements'] ?? null) ? $room['elements'] : [] as $e => $element) {
                $photo = is_array($element) && is_int($element['entry_photo_id'] ?? null) ? $photos->get($element['entry_photo_id']) : null;
                if ($photo !== null) {
                    $rooms[$r]['elements'][$e]['entry_thumbnail_url'] = $access->signedConversionUrl($photo, 'preview') ?? $access->signedUrl($photo);
                }
            }
        }

        return $rooms;
    }

    /**
     * TCK-2648 — une personne nommée à un autre compte : son id et son nom (`nameWithoutContact`,
     * jamais l'e-mail), ou `null`.
     *
     * @return array{id: int, full_name: string}|null
     */
    private static function personne(?User $user): ?array
    {
        return $user === null ? null : ['id' => (int) $user->id, 'full_name' => $user->nameWithoutContact()];
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
     * TCK-2088 (P180.02) — `preview_url` sert la `preview` (600 px) à la grille, `url` l'original au
     * clic ; tant que la file n'a pas produit la `preview`, `preview_url` est l'original.
     *
     * @return list<array{room_name: string, photos: list<array{id: int, url: string, preview_url: string, room_name: string}>}>
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
            $url = $access->signedUrl($media);
            $groups[$name][] = [
                'id' => (int) $media->id,
                'url' => $url,
                'preview_url' => $access->signedConversionUrl($media, 'preview') ?? $url,
                'room_name' => $name,
                // TCK-2646 — l'élément photographié, nul pour une vue de la pièce.
                'element_label' => $media->getCustomProperty('element_label'),
            ];
        }

        $out = [];
        foreach ($groups as $name => $photos) {
            $out[] = ['room_name' => (string) $name, 'photos' => $photos];
        }

        return $out;
    }
}
