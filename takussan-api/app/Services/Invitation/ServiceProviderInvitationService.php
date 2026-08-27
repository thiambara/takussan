<?php

namespace App\Services\Invitation;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\Capability;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\Invitation;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Support\CaseInsensitive;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * TCK-260 — orchestre l'invitation d'un Service Provider depuis le carnet
 * de prestataires d'une agence.
 *
 * Wraps {@see InvitationService} pour concentrer les règles métier
 * spécifiques au prestataire en un seul point d'entrée :
 *
 *  - Agences éligibles : `standard` ET `individual` (un host individual a
 *    aussi besoin de ses prestataires) — cf. TCK-248.
 *  - Porte `invite_service_provider`, scopée à l'agence (TCK-278 — check
 *    profile-based, plus une permission spatie sur un team_id : le paquet
 *    est désinstallé, ADR-0002). Détenue par `agency_admin`, déléguable à
 *    un agent via {@see RoleDelegation}.
 *  - Pré-crée un `ServiceProviderProfile` en `draft` + une
 *    `ServiceProviderAgencyCollaboration` en `paused`. La collab
 *    bascule à `active` lors du wizard post-acceptation (TCK-261).
 *  - Conflict guard : si un SP **actif** (collab Active + User attaché)
 *    existe déjà dans cette agence pour cet email → 409.
 *  - Détection multi-agence : si un SP existe déjà pour cet email dans
 *    une **autre** agence, on ne bloque pas — on remonte le flag
 *    `existing_sp_other_agency` dans la metadata de l'invitation pour
 *    que TCK-262 puisse proposer un multi-rattachement à l'acceptation.
 *  - `metadata.from_maintenance_request_id` est propagé tel quel sur
 *    l'invitation pour que le SP atterrisse directement sur la demande
 *    après acceptation (TCK-261).
 *  - Activity log : `service_provider_invited`.
 */
class ServiceProviderInvitationService
{
    public const PERMISSION = 'invite_service_provider';

    public function __construct(private readonly InvitationService $invitations) {}

    /**
     * @param  array{
     *     email:string,
     *     first_name:string,
     *     last_name:string,
     *     phone?:string|null,
     *     trades?:array<int,string>,
     *     intervention_zones?:array<int,string>,
     *     metadata?:array<string,mixed>,
     * }  $data
     * @return array{invitation: Invitation, profile: ServiceProviderProfile, existing_sp_other_agency: bool, existing_sp_same_agency: bool}
     *
     * @throws HttpException 403 si l'agence n'est ni standard ni individual,
     *                       ou si l'inviter n'a pas `invite_service_provider`.
     * @throws HttpException 409 si un SP actif existe déjà dans cette
     *                       agence pour cet email.
     */
    public function invite(Agency $agency, User $inviter, array $data): array
    {
        $this->assertAgencyCanInvite($agency);
        $this->assertInviterCanInvite($inviter, $agency);

        $email = CaseInsensitive::fold(trim((string) $data['email']));

        $this->assertNoActiveServiceProviderInAgency($agency, $email);

        // TCK-262 — détection en amont : si un User existe déjà avec un
        // ServiceProviderProfile attaché (≠ draft anonyme), on **réutilise**
        // ce profil au lieu d'en créer un nouveau. La collab vers la
        // nouvelle agence sera créée à l'acceptation. Ça évite les
        // doublons SP profile et préserve KYC/métiers/zones/tarifs déjà
        // renseignés sur le profil maître.
        $existingProfile = $this->lookupExistingServiceProviderForEmail($email);
        $existingOtherAgency = $existingProfile !== null;

        $trades = $this->normaliseStringList($data['trades'] ?? []);
        $zones = $this->normaliseStringList($data['intervention_zones'] ?? []);

        $fromMaintenanceRequestId = $this->normaliseMaintenanceRequestId(
            $data['metadata']['from_maintenance_request_id'] ?? null,
        );

        [$invitation, $profile] = DB::transaction(function () use (
            $agency, $inviter, $email, $data, $trades, $zones, $existingProfile, $existingOtherAgency, $fromMaintenanceRequestId
        ): array {
            if ($existingProfile !== null) {
                // Re-use the existing master profile — no new SP profile,
                // no draft collaboration row (the dedicated accept flow
                // creates the collab atomically when the SP confirms).
                $profile = $existingProfile;
            } else {
                $profile = ServiceProviderProfile::query()->create([
                    'user_id' => null,
                    'status' => ServiceProviderProfileStatus::Draft->value,
                    'specialties' => $trades !== [] ? $trades : null,
                    'service_areas' => $zones !== [] ? $zones : null,
                    'metadata' => [
                        'email' => $email,
                        'first_name' => trim((string) ($data['first_name'] ?? '')),
                        'last_name' => trim((string) ($data['last_name'] ?? '')),
                        'phone' => $this->cleanString($data['phone'] ?? null),
                        'trades' => $trades,
                        'intervention_zones' => $zones,
                        'invited_by' => $inviter->id,
                    ],
                ]);

                // Pre-create the per-agency link in `paused` so the dedup
                // check (`existing_sp_same_agency`) works before acceptance,
                // and so the wizard (TCK-261) only has to flip a status when
                // the SP signs up. `started_at` is set tentatively to today
                // — the wizard rewrites it on activation if needed.
                ServiceProviderAgencyCollaboration::query()->create([
                    'service_provider_profile_id' => $profile->id,
                    'agency_id' => $agency->id,
                    'status' => CollaborationStatus::Paused->value,
                    'started_at' => now()->toDateString(),
                    'metadata' => [
                        'invited_by' => $inviter->id,
                    ],
                ]);
            }

            $invitationMetadata = [
                'first_name' => trim((string) ($data['first_name'] ?? '')),
                'last_name' => trim((string) ($data['last_name'] ?? '')),
                'trades' => $trades,
                'intervention_zones' => $zones,
                'existing_sp_other_agency' => $existingOtherAgency,
            ];

            if ($fromMaintenanceRequestId !== null) {
                $invitationMetadata['from_maintenance_request_id'] = $fromMaintenanceRequestId;
            }

            $invitation = $this->invitations->send([
                'email' => $email,
                'role' => 'service_provider',
                'invitable_type' => ServiceProviderProfile::class,
                'invitable_id' => $profile->id,
                'agency_id' => $agency->id,
                'metadata' => $invitationMetadata,
            ], $inviter);

            activity('Invitation')
                ->performedOn($invitation)
                ->causedBy($inviter)
                ->withProperties([
                    'inviter_id' => $inviter->id,
                    'agency_id' => $agency->id,
                    'target_email' => $email,
                    'service_provider_profile_id' => $profile->id,
                    'existing_sp_other_agency' => $existingOtherAgency,
                    'from_maintenance_request_id' => $fromMaintenanceRequestId,
                ])
                ->event('service_provider_invited')
                ->log('service_provider_invited');

            return [$invitation, $profile];
        });

        return [
            'invitation' => $invitation,
            'profile' => $profile,
            'existing_sp_other_agency' => $existingOtherAgency,
            'existing_sp_same_agency' => false,
        ];
    }

    /**
     * Throws 403 if the agency is neither `standard` nor `individual`. In
     * the current data model the enum only has those two values, so this
     * is a defensive guard against future kinds (`broker`, `community`…).
     */
    protected function assertAgencyCanInvite(Agency $agency): void
    {
        $kind = $agency->kind instanceof AgencyKind
            ? $agency->kind
            : AgencyKind::tryFrom((string) $agency->kind);

        if ($kind !== AgencyKind::Standard && $kind !== AgencyKind::Individual) {
            throw new HttpException(403, __('service_providers.invite.errors.agency_kind'));
        }
    }

    /**
     * Throws 403 unless the inviter holds `invite_service_provider` *in
     * the agency team context*. Mirror la sonde Owner/Agent pour qu'un
     * user ayant la permission ailleurs ne passe pas accidentellement.
     */
    /**
     * TCK-278 — Profile-based check (plus de spatie `setPermissionsTeamId` +
     * `hasPermissionTo`). Autorisé pour un `AgencyAdminProfile` actif sur
     * l'agence ou pour un user bénéficiant d'une `RoleDelegation` active
     * `agency_admin` (TCK-108).
     */
    protected function assertInviterCanInvite(User $inviter, Agency $agency): void
    {
        if (method_exists($inviter, 'isSuperAdmin') && $inviter->isSuperAdmin()) {
            return;
        }

        // TCK-395 — voir `MembershipCapabilityResolver::delegationAllows()` : la
        // délégation passe désormais par le pivot et est bornée par les
        // capacités propres du délégant, au lieu d'accorder l'agency_admin
        // plein sur un simple test de chaîne.
        $allowed = $inviter->isAgencyAdminAt((int) $agency->id)
            || $inviter->canActAt(Capability::TeamInvite, $agency);

        if (! $allowed) {
            throw new HttpException(403, __('service_providers.invite.errors.permission_denied'));
        }
    }

    /**
     * Throws 409 if an active ServiceProvider (User attached + active
     * collaboration) already covers this email/agency tuple. A standalone
     * draft (no User yet) is *not* blocked — the inviter is meant to use
     * the invitation resend flow instead.
     */
    protected function assertNoActiveServiceProviderInAgency(Agency $agency, string $email): void
    {
        $existing = ServiceProviderProfile::query()
            ->whereHas('user', function ($query) use ($email): void {
                $query->whereRaw(CaseInsensitive::sql('email').' = ?', [CaseInsensitive::fold($email)]);
            })
            ->whereHas('agencyCollaborations', function ($query) use ($agency): void {
                $query->where('agency_id', $agency->id)
                    ->where('status', CollaborationStatus::Active->value);
            })
            ->first();

        if ($existing !== null) {
            throw new HttpException(
                409,
                __('service_providers.invite.errors.already_member', ['profile_id' => $existing->id]),
            );
        }
    }

    /**
     * TCK-262 — returns the ServiceProviderProfile already attached to a
     * User with this email, if any. We re-use this row for multi-agency
     * onboarding instead of creating a fresh draft (preserves KYC,
     * trades, zones, rates and avoids duplicate `(user_id)` rows).
     *
     * Returns null when the email maps to no User, or when the User has
     * no SP profile yet — in which case the caller falls back to the
     * original "draft profile + invitation" flow (TCK-260).
     */
    protected function lookupExistingServiceProviderForEmail(string $email): ?ServiceProviderProfile
    {
        return ServiceProviderProfile::query()
            ->whereHas('user', function ($query) use ($email): void {
                $query->whereRaw(CaseInsensitive::sql('email').' = ?', [CaseInsensitive::fold($email)]);
            })
            ->first();
    }

    /**
     * @return array<int,string>
     */
    protected function normaliseStringList(mixed $values): array
    {
        if (! is_array($values)) {
            return [];
        }

        $out = [];
        foreach ($values as $value) {
            if (! is_string($value)) {
                continue;
            }
            $trimmed = trim($value);
            if ($trimmed === '') {
                continue;
            }
            if (! in_array($trimmed, $out, true)) {
                $out[] = $trimmed;
            }
        }

        return $out;
    }

    protected function normaliseMaintenanceRequestId(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (is_int($value)) {
            return $value > 0 ? $value : null;
        }
        if (is_numeric($value)) {
            $cast = (int) $value;

            return $cast > 0 ? $cast : null;
        }

        return null;
    }

    protected function cleanString(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }
        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }
}
