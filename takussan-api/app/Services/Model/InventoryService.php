<?php

namespace App\Services\Model;

use App\Models\Customer;
use App\Models\Enums\InventoryStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\User;

class InventoryService
{
    /**
     * @param  array<string,mixed>  $data
     */
    public function create(Lease $lease, User $user, array $data): Inventory
    {
        $tenant = Customer::find($lease->tenant_id);
        abort_if($tenant === null, 422, 'Lease tenant not found.');

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
        abort_unless(
            $inventory->status === InventoryStatus::Draft,
            422,
            'Only draft inventories can be edited.'
        );

        $inventory->update(array_filter(
            $data,
            fn ($v, $k) => $v !== null || ! empty($presentKeys[$k]),
            ARRAY_FILTER_USE_BOTH
        ));

        return $inventory->refresh();
    }

    public function submit(Inventory $inventory): Inventory
    {
        abort_unless(
            $inventory->status === InventoryStatus::Draft,
            422,
            'Only draft inventories can be submitted for signature.'
        );

        $inventory->update(['status' => InventoryStatus::PendingSignature]);

        return $inventory->refresh();
    }

    public function sign(Inventory $inventory, User $user): Inventory
    {
        abort_unless(
            in_array($inventory->status, [InventoryStatus::PendingSignature, InventoryStatus::Draft], true),
            422,
            'Inventory cannot be signed in its current state.'
        );

        $property = $inventory->property;
        $tenant = $inventory->tenant;

        $isOwner = $property && $property->user_id === $user->id;
        $isTenant = $tenant && $tenant->user_id === $user->id;
        $isAdmin = $user->hasRole('super_admin');

        abort_unless($isOwner || $isTenant || $isAdmin, 403);

        $updates = [];
        if ($isOwner || $isAdmin) {
            $updates['owner_signed'] = true;
            $updates['owner_signed_at'] = now();
        }
        if ($isTenant || $isAdmin) {
            $updates['tenant_signed'] = true;
            $updates['tenant_signed_at'] = now();
        }

        $inventory->fill($updates);

        if ($inventory->tenant_signed && $inventory->owner_signed) {
            $inventory->status = InventoryStatus::Signed;
        }

        $inventory->save();

        return $inventory->refresh();
    }

    public function dispute(Inventory $inventory, string $reason): Inventory
    {
        abort_unless(
            in_array($inventory->status, [InventoryStatus::PendingSignature, InventoryStatus::Signed], true),
            422,
            'Inventory cannot be disputed in its current state.'
        );

        $inventory->update([
            'status' => InventoryStatus::Disputed,
            'notes' => trim(($inventory->notes ? $inventory->notes."\n\n" : '').'[Dispute] '.$reason),
        ]);

        return $inventory->refresh();
    }
}
