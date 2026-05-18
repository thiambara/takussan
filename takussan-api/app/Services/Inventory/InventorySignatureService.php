<?php

namespace App\Services\Inventory;

use App\Http\Requests\InventorySignRequest;
use App\Models\Enums\InventoryStatus;
use App\Models\Inventory;
use App\Models\User;
use Illuminate\Http\Response;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

/**
 * TCK-076 — captures an immutable signature payload for a given role
 * (tenant | landlord). Once both parties have signed, the inventory is locked
 * and `signed_at` is stamped.
 *
 * Business rules enforced here (not in the controller):
 *   - Only the tenant linked to the lease may sign as `tenant`.
 *   - The landlord of the property, an accepted agency collaborator or an
 *     admin may sign as `landlord`.
 *   - A role can only be signed once (409 on re-sign — AC4).
 *   - Signatures are accepted while the inventory is `draft` or
 *     `pending_signature`; never on `signed` or `disputed`.
 *   - Each payload is hashed (SHA-256) for tamper detection — the hash lands
 *     in the JSON API, the raw base64 stays hidden server-side.
 */
class InventorySignatureService
{
    public function sign(Inventory $inventory, User $user, string $role, string $signature): Inventory
    {
        $this->assertSignable($inventory);
        $this->authorizeRole($inventory, $user, $role);
        $this->assertRoleNotAlreadySigned($inventory, $role);

        $hash = hash('sha256', $signature);
        $now = now();

        if ($role === InventorySignRequest::ROLE_TENANT) {
            $inventory->tenant_signed = true;
            $inventory->tenant_signed_at = $now;
            $inventory->tenant_signature_data = $signature;
            $inventory->tenant_signature_hash = $hash;
        } else {
            $inventory->owner_signed = true;
            $inventory->owner_signed_at = $now;
            $inventory->owner_signature_data = $signature;
            $inventory->owner_signature_hash = $hash;
        }

        if ($inventory->tenant_signed && $inventory->owner_signed) {
            $inventory->status = InventoryStatus::Signed;
            $inventory->signed_at = $now;
        } elseif ($inventory->status === InventoryStatus::Draft) {
            // First signature promotes a draft to pending_signature so the
            // counterparty can see it's awaiting their action.
            $inventory->status = InventoryStatus::PendingSignature;
        }

        $inventory->save();

        return $inventory->refresh();
    }

    /**
     * Short, deterministic hash for footer traceability (first 12 chars of
     * a SHA-256 over the inventory identity + rooms snapshot). Stable across
     * renders so the same PDF always shows the same fingerprint.
     */
    public function traceabilityHash(Inventory $inventory): string
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

    protected function assertSignable(Inventory $inventory): void
    {
        abort_unless(
            in_array($inventory->status, [InventoryStatus::Draft, InventoryStatus::PendingSignature], true),
            Response::HTTP_CONFLICT,
            'Inventory cannot be signed in its current state.'
        );
    }

    protected function authorizeRole(Inventory $inventory, User $user, string $role): void
    {
        $property = $inventory->property;
        $tenant = $inventory->tenant;
        $isAdmin = $user->isSuperAdmin();

        if ($role === InventorySignRequest::ROLE_TENANT) {
            $allowed = $isAdmin || ($tenant && $tenant->user_id === $user->id);
            abort_unless($allowed, Response::HTTP_FORBIDDEN);

            return;
        }

        // landlord
        $isOwner = $property && $property->user_id === $user->id;
        $isAgencyStaff = $user->agency_id && $property && $property->agency_id === $user->agency_id;
        $isCollaborator = $property
            ? (bool) $property->collaborators()
                ->where('user_id', $user->id)
                ->whereNotNull('accepted_at')
                ->exists()
            : false;

        abort_unless(
            $isAdmin || $isOwner || $isAgencyStaff || $isCollaborator,
            Response::HTTP_FORBIDDEN,
        );
    }

    protected function assertRoleNotAlreadySigned(Inventory $inventory, string $role): void
    {
        $already = $role === InventorySignRequest::ROLE_TENANT
            ? (bool) $inventory->tenant_signed
            : (bool) $inventory->owner_signed;

        if ($already) {
            throw new ConflictHttpException(sprintf(
                'Inventory has already been signed by the %s.',
                $role === InventorySignRequest::ROLE_TENANT ? 'tenant' : 'landlord',
            ));
        }
    }
}
