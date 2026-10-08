<?php

namespace App\Services\Inventory;

use App\Http\Requests\InventorySignRequest;
use App\Models\Enums\InventoryStatus;
use App\Models\Inventory;
use App\Models\User;
use App\Services\Lease\LandlordSignatory;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * TCK-076 — captures an immutable signature payload for a given role
 * (tenant | landlord). Once both parties have signed, the inventory is locked
 * and `signed_at` is stamped.
 *
 * Business rules enforced here (not in the controller — no policy guards the route, this service
 * is the only guard):
 *   - Only the tenant of the lease may sign as `tenant` — not even the super-admin (TCK-596).
 *   - `landlord` follows {@see LandlordSignatory}: the landlord of the lease for himself, or a
 *     member of the lease agency's staff holding `leases.sign`, on his behalf. No property
 *     collaborator, whatever its role, no super-admin, no other landlord of the agency (TCK-596).
 *     Who signed and for whom is recorded (`owner_signed_by_user_id`, `…_on_behalf_of_user_id`).
 *   - A role can only be signed once (409 on re-sign — AC4).
 *   - Signatures are accepted while the inventory is `draft` or
 *     `pending_signature`; never on `signed` or `disputed`.
 *   - Each payload is hashed (SHA-256) for tamper detection — the hash lands
 *     in the JSON API, the raw base64 stays hidden server-side.
 *   - At the second signature the traceability hash is FROZEN, and it covers the room photos
 *     (TCK-596): the PDF is recomposed at download time, so an unfrozen hash would follow the
 *     document instead of attesting it.
 */
class InventorySignatureService
{
    public function sign(Inventory $inventory, User $user, string $role, string $signature): Inventory
    {
        // VERIF-596 M3 — sous le verrou de la ligne, et TOUT est relu dessus : deux signatures
        // simultanées (un état des lieux fait ensemble, deux téléphones) voyaient chacune l'autre
        // « non signée », aucune ne passait `signed` ni ne figeait l'empreinte, et l'état restait
        // bloqué (chaque rôle déjà signé → 409). Patron de `LeaseSignatureService::sign`.
        return DB::transaction(function () use ($inventory, $user, $role, $signature): Inventory {
            /** @var Inventory $locked */
            $locked = Inventory::query()->whereKey($inventory->getKey())->lockForUpdate()->firstOrFail();

            $this->assertSignable($locked);
            $this->authorizeRole($locked, $user, $role);
            $this->assertRoleNotAlreadySigned($locked, $role);

            $hash = hash('sha256', $signature);
            $now = now();

            if ($role === InventorySignRequest::ROLE_TENANT) {
                $locked->tenant_signed = true;
                $locked->tenant_signed_at = $now;
                $locked->tenant_signature_data = $signature;
                $locked->tenant_signature_hash = $hash;
            } else {
                $locked->owner_signed = true;
                $locked->owner_signed_at = $now;
                $locked->owner_signature_data = $signature;
                $locked->owner_signature_hash = $hash;
                $locked->owner_signed_by_user_id = $user->id;
                $locked->owner_signed_on_behalf_of_user_id = LandlordSignatory::onBehalfOf($user, $locked->lease);
            }

            if ($locked->tenant_signed && $locked->owner_signed) {
                $locked->status = InventoryStatus::Signed;
                $locked->signed_at = $now;
                $locked->traceability_hash = $this->frozenTraceabilityHash($locked);
            } elseif ($locked->status === InventoryStatus::Draft) {
                // First signature promotes a draft to pending_signature so the
                // counterparty can see it's awaiting their action.
                $locked->status = InventoryStatus::PendingSignature;
            }

            $locked->save();

            return $locked->refresh();
        });
    }

    /**
     * L'empreinte IMPRIMÉE sur le PDF : la colonne figée à la seconde signature quand elle existe
     * (TCK-596), sinon l'ancien calcul — un état des lieux signé avant ce ticket garde l'empreinte
     * qu'il imprimait déjà.
     */
    public function traceabilityHash(Inventory $inventory): string
    {
        return $inventory->traceability_hash ?? $this->legacyTraceabilityHash($inventory);
    }

    /**
     * Short, deterministic hash for footer traceability (first 16 chars of
     * a SHA-256 over the inventory identity + rooms snapshot). Stable across
     * renders so the same PDF always shows the same fingerprint.
     *
     * ⚠ Ne pas modifier : c'est l'empreinte déjà remise des états des lieux signés avant TCK-596.
     * `InventoryTraceabilityHashTest` en fige une valeur.
     */
    public function legacyTraceabilityHash(Inventory $inventory): string
    {
        $material = json_encode([
            'id' => $inventory->id,
            'property_id' => $inventory->property_id,
            'lease_id' => $inventory->lease_id,
            'type' => $inventory->type?->value,
            'conducted_at' => optional($inventory->conducted_at)->toIso8601String(),
            'rooms' => $inventory->rooms,
            'tenant_signature_hash' => $inventory->tenant_signature_hash,
            'owner_signature_hash' => $inventory->owner_signature_hash,
        ], JSON_UNESCAPED_UNICODE);

        return substr(hash('sha256', (string) $material), 0, 16);
    }

    /**
     * TCK-596 — SHA-256 complet, calculé UNE fois à la seconde signature. Il couvre ce que couvrait
     * l'ancien calcul, le signataire du bailleur, et chaque photo par pièce (triées par id) : son
     * `room_name` et le SHA-256 de ses octets, lus par le disque (ADR-0029, jamais `getPath()`).
     */
    public function frozenTraceabilityHash(Inventory $inventory): string
    {
        $photos = $inventory->getMedia('room_photos')
            ->sortBy('id')
            ->map(fn ($media) => [
                'room_name' => $media->getCustomProperty('room_name'),
                'sha256' => hash('sha256', (string) Storage::disk($media->disk)->get($media->getPathRelativeToRoot())),
            ])
            ->values()
            ->all();

        $material = json_encode([
            'id' => $inventory->id,
            'property_id' => $inventory->property_id,
            'lease_id' => $inventory->lease_id,
            'type' => $inventory->type?->value,
            'conducted_at' => optional($inventory->conducted_at)->toIso8601String(),
            'rooms' => $inventory->rooms,
            'tenant_signature_hash' => $inventory->tenant_signature_hash,
            'owner_signature_hash' => $inventory->owner_signature_hash,
            'owner_signed_by_user_id' => $inventory->owner_signed_by_user_id,
            'owner_signed_on_behalf_of_user_id' => $inventory->owner_signed_on_behalf_of_user_id,
            'room_photos' => $photos,
        ], JSON_UNESCAPED_UNICODE);

        return hash('sha256', (string) $material);
    }

    protected function assertSignable(Inventory $inventory): void
    {
        abort_code_unless(
            in_array($inventory->status, [InventoryStatus::Draft, InventoryStatus::PendingSignature], true),
            Response::HTTP_CONFLICT,
            'inventory.cannot_sign'
        );
    }

    /**
     * Le rôle demandé est-il celui de `$user` sur cet état des lieux ? Même prédicat que
     * {@see self::authorizeRole()} ; `InventoryResource::can_sign_as` l'expose au front.
     */
    public function canSignAs(Inventory $inventory, User $user, string $role): bool
    {
        $lease = $inventory->lease;
        if ($lease === null) {
            return false;
        }

        if ($role === InventorySignRequest::ROLE_TENANT) {
            $tenant = $lease->tenant;

            return $tenant !== null && $tenant->user_id !== null && (int) $tenant->user_id === (int) $user->id;
        }

        return LandlordSignatory::allows($user, $lease);
    }

    /**
     * TCK-596 — personne ne signe pour une autre partie. `inventories.lease_id` est non nul : le bail
     * existe toujours, et c'est LUI qui désigne les parties (locataire du bail, bailleur du bail).
     */
    protected function authorizeRole(Inventory $inventory, User $user, string $role): void
    {
        abort_unless($this->canSignAs($inventory, $user, $role), Response::HTTP_FORBIDDEN);
    }

    protected function assertRoleNotAlreadySigned(Inventory $inventory, string $role): void
    {
        $already = $role === InventorySignRequest::ROLE_TENANT
            ? (bool) $inventory->tenant_signed
            : (bool) $inventory->owner_signed;

        if ($already) {
            if ($role === InventorySignRequest::ROLE_TENANT) {
                abort_code(409, 'inventory.already_signed_tenant');
            }
            abort_code(409, 'inventory.already_signed_landlord');
        }
    }
}
