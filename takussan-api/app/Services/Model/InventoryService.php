<?php

namespace App\Services\Model;

use App\Models\Customer;
use App\Models\Enums\InventoryStatus;
use App\Models\Enums\InventoryType;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\User;
use App\Services\Inventory\InventoryExitPrefill;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

class InventoryService
{
    public function __construct(private readonly InventoryExitPrefill $prefill) {}

    /**
     * TCK-2646 — une sortie reprend l'entrée signée du bail (`from_inventory_id`, à défaut la
     * dernière) : ses pièces quand le client n'en envoie pas, et dans tous les cas les états d'entrée
     * de chaque élément. La copie se fait ici, à la création seulement.
     *
     * @param  array<string,mixed>  $data
     */
    public function create(Lease $lease, User $user, array $data): Inventory
    {
        $tenant = Customer::find($lease->tenant_id);
        abort_code_if($tenant === null, 422, 'inventory.tenant_not_found');

        $entry = $data['type'] === InventoryType::MoveOut->value
            ? $this->prefill->entryFor($lease, isset($data['from_inventory_id']) ? (int) $data['from_inventory_id'] : null)
            : null;
        $rooms = $data['rooms'] ?? ($entry !== null ? $this->prefill->roomsFrom($entry) : null);
        $condition = $data['general_condition'] ?? $entry?->general_condition?->value;
        // Une sortie sans entrée signée démarre comme avant : pièces et état général exigés.
        $missing = array_filter(['rooms' => $rooms === null || $rooms === [], 'general_condition' => $condition === null]);
        if ($missing !== []) {
            throw ValidationException::withMessages(array_map(
                fn (string $field): string => __('validation.required', ['attribute' => str_replace('_', ' ', $field)]),
                array_combine(array_keys($missing), array_keys($missing)),
            ));
        }

        return Inventory::create([
            'lease_id' => $lease->id,
            'property_id' => $lease->property_id,
            'type' => $data['type'],
            'conducted_by' => $user->id,
            'tenant_id' => $tenant->id,
            'entry_inventory_id' => $entry?->id,
            'conducted_at' => $data['conducted_at'] ?? now(),
            'status' => InventoryStatus::Draft->value,
            'general_condition' => $condition,
            'rooms' => $entry !== null ? $this->prefill->attach($rooms, $entry) : $rooms,
            'notes' => $data['notes'] ?? null,
        ]);
    }

    /**
     * @param  array<string,mixed>  $data
     * @param  array<string,bool>  $presentKeys  Keys that were present in the request (so null can be preserved as an intentional clear).
     */
    public function update(Inventory $inventory, array $data, array $presentKeys): Inventory
    {
        return $this->underLock($inventory, function (Inventory $locked) use ($data, $presentKeys): Inventory {
            $this->assertDraft($locked);

            // TCK-2646 — les états d'entrée d'une sortie sont reposés par le serveur à chaque
            // écriture des pièces : un `PATCH` ne les change pas, ne les retire pas.
            if (isset($data['rooms']) && is_array($data['rooms']) && $locked->type === InventoryType::MoveOut) {
                $data['rooms'] = $this->prefill->attach($data['rooms'], $locked->entryInventory);
            }

            $locked->update(array_filter(
                $data,
                fn ($v, $k) => $v !== null || ! empty($presentKeys[$k]),
                ARRAY_FILTER_USE_BOTH
            ));

            return $locked->refresh();
        });
    }

    public function submit(Inventory $inventory): Inventory
    {
        return $this->underLock($inventory, function (Inventory $locked): Inventory {
            abort_code_unless(
                $locked->status === InventoryStatus::Draft,
                422,
                'inventory.not_draft_submit'
            );

            $locked->update(['status' => InventoryStatus::PendingSignature]);

            return $locked->refresh();
        });
    }

    public function dispute(Inventory $inventory, string $reason): Inventory
    {
        return $this->underLock($inventory, function (Inventory $locked) use ($reason): Inventory {
            abort_code_unless(
                in_array($locked->status, [InventoryStatus::PendingSignature, InventoryStatus::Signed], true),
                422,
                'inventory.cannot_dispute'
            );

            $locked->update([
                'status' => InventoryStatus::Disputed,
                'notes' => trim(($locked->notes ? $locked->notes."\n\n" : '').'[Dispute] '.$reason),
            ]);

            return $locked->refresh();
        });
    }

    /**
     * TCK-596 — les photos d'une pièce, en brouillon seulement : le PDF est recomposé au
     * téléchargement, une photo ajoutée après signature changerait le document signé.
     *
     * @param  list<UploadedFile>  $photos
     */
    public function addRoomPhotos(Inventory $inventory, array $photos, ?string $roomName, ?string $elementLabel = null): Inventory
    {
        return $this->underLock($inventory, function (Inventory $locked) use ($photos, $roomName, $elementLabel): Inventory {
            $this->assertDraft($locked);

            foreach ($photos as $photo) {
                $locked->addMedia($photo)
                    // TCK-2646 — `element_label` : la photo d'un élément de la pièce, sinon de la pièce.
                    ->withCustomProperties(array_filter(['room_name' => $roomName, 'element_label' => $elementLabel], fn ($v) => $v !== null))
                    ->toMediaCollection('room_photos');
            }

            return $locked;
        });
    }

    public function removeRoomPhoto(Inventory $inventory, Media $photo): void
    {
        $this->underLock($inventory, function (Inventory $locked) use ($photo): void {
            $this->assertDraft($locked);

            $photo->delete();
        });
    }

    /**
     * P211.05 (TCK-2109) — chaque geste relit la ligne sous verrou dans une transaction et juge
     * le statut sur elle, comme `InventorySignatureService::sign`, qui prend le même verrou.
     * Jugé sur le modèle lié, un geste parti d'un brouillon resté en mémoire changeait le contenu
     * d'un état des lieux qu'une partie venait de signer.
     *
     * @template T
     *
     * @param  callable(Inventory): T  $geste
     * @return T
     */
    private function underLock(Inventory $inventory, callable $geste): mixed
    {
        return DB::transaction(function () use ($inventory, $geste): mixed {
            /** @var Inventory $locked */
            $locked = Inventory::query()->whereKey($inventory->getKey())->lockForUpdate()->firstOrFail();

            return $geste($locked);
        });
    }

    /** 409 si l'état des lieux est signé, 422 s'il n'est plus un brouillon — la garde d'`update`. */
    private function assertDraft(Inventory $inventory): void
    {
        if ($inventory->status === InventoryStatus::Signed) {
            abort_code(SymfonyResponse::HTTP_CONFLICT, 'inventory.signed_locked');
        }

        abort_code_unless($inventory->status === InventoryStatus::Draft, 422, 'inventory.not_draft');
    }
}
