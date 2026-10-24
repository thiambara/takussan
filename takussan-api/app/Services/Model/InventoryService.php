<?php

namespace App\Services\Model;

use App\Models\Customer;
use App\Models\Enums\InventoryStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

class InventoryService
{
    /**
     * @param  array<string,mixed>  $data
     */
    public function create(Lease $lease, User $user, array $data): Inventory
    {
        $tenant = Customer::find($lease->tenant_id);
        abort_code_if($tenant === null, 422, 'inventory.tenant_not_found');

        return Inventory::create([
            'lease_id' => $lease->id,
            'property_id' => $lease->property_id,
            'type' => $data['type'],
            'conducted_by' => $user->id,
            'tenant_id' => $tenant->id,
            'conducted_at' => $data['conducted_at'] ?? now(),
            'status' => InventoryStatus::Draft->value,
            'general_condition' => $data['general_condition'],
            'rooms' => $data['rooms'],
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
    public function addRoomPhotos(Inventory $inventory, array $photos, ?string $roomName): Inventory
    {
        return $this->underLock($inventory, function (Inventory $locked) use ($photos, $roomName): Inventory {
            $this->assertDraft($locked);

            foreach ($photos as $photo) {
                $locked->addMedia($photo)
                    ->withCustomProperties(['room_name' => $roomName])
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
