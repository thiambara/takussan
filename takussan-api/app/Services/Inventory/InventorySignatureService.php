<?php

namespace App\Services\Inventory;

use App\Http\Requests\InventorySignRequest;
use App\Models\Enums\InventoryStatus;
use App\Models\Inventory;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Notifications\LeaseSignatureCodeNotification;
use App\Policies\InventoryPolicy;
use App\Services\Auth\OtpPreview;
use App\Services\Lease\LandlordSignatory;
use App\Services\Lease\LeaseSignatureService;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Services\Pdf\PrintedIdentity;
use App\Services\Signature\SignatureOtpService;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Throwable;

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
 *   - TCK-2646 (ADR-0098) — the tenant may also sign ON SITE, on the device of a member of the lease
 *     agency's staff who can `update` the inventory: the tenant draws, then types the code sent by
 *     SMS to the VERIFIED phone of their account ({@see sendOnsiteCode()}). Never to the `Customer`
 *     phone, which the agency types itself. The proof keeps `onsite_otp`, the staff member, the
 *     channel, the masked number, the IP and the time.
 */
class InventorySignatureService
{
    /** TCK-2646 — le rôle de `can_sign_as` qui ouvre la voie sur place ; jamais un rôle de `sign`. */
    public const ROLE_TENANT_ONSITE = 'tenant_onsite';

    public function __construct(private readonly SignatureOtpService $otp) {}

    public function sign(Inventory $inventory, User $user, string $role, string $signature, ?string $code = null, ?Request $request = null): Inventory
    {
        // VERIF-596 M3 — sous le verrou de la ligne, et TOUT est relu dessus : deux signatures
        // simultanées (un état des lieux fait ensemble, deux téléphones) voyaient chacune l'autre
        // « non signée », aucune ne passait `signed` ni ne figeait l'empreinte, et l'état restait
        // bloqué (chaque rôle déjà signé → 409). Patron de `LeaseSignatureService::sign`.
        return DB::transaction(function () use ($inventory, $user, $role, $signature, $code, $request): Inventory {
            /** @var Inventory $locked */
            $locked = Inventory::query()->whereKey($inventory->getKey())->lockForUpdate()->firstOrFail();

            $this->assertSignable($locked);
            // TCK-2646 — la voie sur place : le rôle `tenant` demandé par un membre du personnel
            // habilité, qui n'est pas lui-même le locataire. Refusée (403), puis déjà signée (409),
            // AVANT de regarder le code : un appel refusé ne consomme aucun essai.
            $onsite = $role === InventorySignRequest::ROLE_TENANT
                && ! $this->canSignAs($locked, $user, $role)
                && $this->canSignOnsite($locked, $user);
            if (! $onsite) {
                $this->authorizeRole($locked, $user, $role);
            }
            $this->assertRoleNotAlreadySigned($locked, $role);
            $proof = $onsite ? $this->checkOnsiteCode($locked, $code) : null;

            $hash = hash('sha256', $signature);
            $now = now();

            if ($role === InventorySignRequest::ROLE_TENANT) {
                $locked->tenant_signed = true;
                $locked->tenant_signed_at = $now;
                $locked->tenant_signature_data = $signature;
                $locked->tenant_signature_hash = $hash;
                // TCK-2646 (ADR-0098 §5) — la trace de la voie, en colonnes.
                $locked->tenant_signature_method = $proof === null ? Inventory::TENANT_METHOD_DRAWN : Inventory::TENANT_METHOD_ONSITE_OTP;
                if ($proof !== null) {
                    $locked->tenant_signed_via_user_id = $user->id;
                    $locked->tenant_otp_channel = $proof['channel'];
                    $locked->tenant_otp_destination = $proof['destination'];
                    $locked->tenant_signed_ip = $request?->ip();
                }
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
                // P140.02 (TCK-1792) — les parties, le bien et l'agence que le PDF imprime, figés
                // avec l'empreinte : l'empreinte ne les couvre pas, l'instantané les garde.
                // P234.06 (TCK-2315) — le bailleur est le propriétaire du bien (`owner` : il n'y a
                // pas de relation `user`, et l'instantané le figeait nul), avec sa raison sociale.
                $property = Property::withTrashed()->with(['address', 'agency', 'owner'])->find($locked->property_id);
                $locked->metadata = (is_array($locked->metadata) ? $locked->metadata : []) + [
                    PrintedIdentity::KEY => PrintedIdentity::capture([
                        'tenant' => $locked->tenant()->withTrashed()->first(),
                        'landlord' => $property?->owner,
                        'property' => $property,
                        'agency' => $property?->agency,
                    ]) + [
                        PrintedIdentity::LANDLORD_COMPANY => OwnerProfile::companyNameOf($property?->user_id, $property?->agency_id),
                    ],
                ];
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

    /**
     * TCK-2646 (ADR-0098 §1-§4) — envoie au locataire du bail le code qui l'authentifie sur l'appareil
     * de `$staff`. SMS au numéro VÉRIFIÉ de son compte, et à lui seul ; sans repli par e-mail.
     *
     * Le code, son délai de renvoi, son compteur d'essais et son verrou sont ceux du LOCATAIRE sur cet
     * état des lieux (`inventory-signature-…:{état}:{compte du locataire}:tenant`) : un second membre
     * du personnel ne rouvre pas cinq essais.
     *
     * @return array{channel: string, destination: string}
     */
    public function sendOnsiteCode(Inventory $inventory, User $staff): array
    {
        abort_unless($this->canSignOnsite($inventory, $staff), Response::HTTP_FORBIDDEN);
        $this->assertSignable($inventory);
        $this->assertRoleNotAlreadySigned($inventory, InventorySignRequest::ROLE_TENANT);

        $tenant = $this->tenantAccount($inventory);
        abort_code_if(
            $tenant === null || ! is_string($tenant->phone) || $tenant->phone === '' || $tenant->phone_verified_at === null,
            422,
            'inventory_signature.tenant_without_phone'
        );

        $role = InventorySignRequest::ROLE_TENANT;
        abort_code_if($this->otp->isLocked($inventory, $tenant, $role), 423, 'inventory_signature.code_locked');
        abort_code_unless($this->otp->canResend($inventory, $tenant, $role), 429, 'inventory_signature.resend_too_soon');

        $channel = LeaseSignatureCodeNotification::CHANNEL_SMS;
        $destination = LeaseSignatureService::maskPhone((string) $tenant->phone);
        $code = $this->otp->issue($inventory, $tenant, $role, $channel, $destination);
        // TCK-620 (ADR-0060) — hors production et drapeau allumé seulement, comme tout code SMS.
        app(OtpPreview::class)->record($code);

        $lease = $inventory->lease;
        $notification = new LeaseSignatureCodeNotification(
            $code,
            (string) ($lease?->reference_number ?? $inventory->lease_id),
            (int) (SignatureOtpService::CODE_TTL_SECONDS / 60),
            $channel,
            $this->otp->resendKey($inventory, $tenant, $role),
            LeaseSignatureCodeNotification::TEXTS_INVENTORY,
        );
        // TCK-1337 (P123.06) — la fenêtre de renvoi ne compte qu'après un envoi réussi.
        try {
            $tenant->notify($notification);
        } catch (Throwable $e) {
            $this->otp->releaseResend($inventory, $tenant, $role);

            throw $e;
        }
        // TCK-799 (P11.05) — un code qui n'est pas parti ne se dit pas envoyé.
        if ($notification->smsLeft() === false) {
            $this->otp->releaseResend($inventory, $tenant, $role);
            abort_code(503, 'inventory_signature.sms_not_sent');
        }

        return ['channel' => $channel, 'destination' => $destination];
    }

    /**
     * TCK-2646 (ADR-0098 §1) — `$user` peut-il recueillir sur son appareil la signature du locataire ?
     * Le personnel de l'agence DU BAIL qui peut `update` l'état des lieux — la policy appelée en direct :
     * `Gate::before` accorderait tout au super-admin, qui n'a pas de voie propre. Jamais un
     * collaborateur du bien qui n'est pas du personnel, jamais le locataire lui-même (il signe depuis
     * son compte).
     */
    public function canSignOnsite(Inventory $inventory, User $user): bool
    {
        $lease = $inventory->lease;
        if ($lease === null || $lease->agency_id === null) {
            return false;
        }

        $tenant = $lease->tenant;
        if ($tenant !== null && $tenant->user_id !== null && (int) $tenant->user_id === (int) $user->id) {
            return false;
        }

        return app(MembershipCapabilityResolver::class)->isStaffAt($user, (int) $lease->agency_id)
            && app(InventoryPolicy::class)->update($user, $inventory);
    }

    /**
     * Le compte du locataire du bail — celui que désigne `canSignAs` pour le rôle `tenant`.
     */
    private function tenantAccount(Inventory $inventory): ?User
    {
        $userId = $inventory->lease?->tenant?->user_id;

        return $userId === null ? null : User::query()->find($userId);
    }

    /**
     * Vérifie ET consomme le code du locataire. 422 sur `code` (absent, faux ou expiré), 423 sous
     * verrou — y compris pour le faux qui le pose.
     *
     * @return array{channel: string, destination: string}
     */
    private function checkOnsiteCode(Inventory $inventory, ?string $code): array
    {
        $tenant = $this->tenantAccount($inventory);
        abort_code_if($tenant === null, 422, 'inventory_signature.tenant_without_phone');
        if (! is_string($code) || trim($code) === '') {
            throw ValidationException::withMessages(['code' => __('errors.inventory_signature.code_required')]);
        }

        $role = InventorySignRequest::ROLE_TENANT;
        abort_code_if($this->otp->isLocked($inventory, $tenant, $role), 423, 'inventory_signature.code_locked');

        $proof = $this->otp->attempt($inventory, $tenant, $role, $code);
        abort_code_if($proof === null && $this->otp->isLocked($inventory, $tenant, $role), 423, 'inventory_signature.code_locked');
        if ($proof === null) {
            throw ValidationException::withMessages(['code' => __('errors.inventory_signature.invalid_code')]);
        }

        return $proof;
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
