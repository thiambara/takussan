<?php

namespace App\Services\Onboarding;

use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use App\Services\Auth\PhoneVerificationService;
use App\Services\Maintenance\MaintenanceStateMachine;
use App\Services\Maintenance\ProviderEligibility;
use App\Services\Model\MaintenanceRequestService;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * TCK-261 — orchestrates the post-acceptance Service Provider onboarding.
 *
 *  1. Validate phone OTP (mirror HostIndividualOnboardingService — verified
 *     **before** the transaction so a wrong code never touches the DB).
 *  2. Activate (or assert active) the SP profile + flip every previously
 *     paused collaboration to active.
 *  3. Caller sets the `active_profile_id` cookie pointing at the SP.
 *  4. Activity log : `sp_phone_verified`, `sp_onboarding_completed`.
 *
 * Trades, zones, rates, KYC and availability are persisted by the
 * dedicated `Me\ServiceProviderProfileController` endpoints during the
 * wizard — by the time `complete()` is called they're already on disk.
 */
class ServiceProviderOnboardingService
{
    public function __construct(private readonly PhoneVerificationService $phoneVerification) {}

    /**
     * @return array{
     *     sp_profile: ServiceProviderProfile,
     *     activated_collaborations: int,
     *     redirect_to_maintenance_request_id: ?int,
     * }
     *
     * @throws ValidationException When the OTP is rejected.
     */
    public function complete(ServiceProviderProfile $sp, User $user, array $payload): array
    {
        // TCK-592 — une suspension posée par la plateforme ne se lève pas par le prestataire : la fin
        // d'onboarding est REJOUABLE (aucune garde « déjà fait », OTP sauté si le téléphone est
        // vérifié), et chaque appel repassait le profil à `active`. Refus AVANT toute écriture.
        abort_if(
            $sp->status === ServiceProviderProfileStatus::Suspended,
            403,
            __('service_providers.onboarding.errors.suspended'),
        );

        // OTP gate. Bypass when the user is already phone-verified — the
        // wizard pre-verifies in step 1 and may re-submit on retries.
        $code = (string) data_get($payload, 'phone_otp.code');
        if ($user->phone_verified_at === null) {
            if (! $this->verifyOtp($user, $code)) {
                throw ValidationException::withMessages([
                    'phone_otp.code' => [__('service_providers.onboarding.errors.invalid_otp')],
                ])->status(422);
            }
        }

        $redirectMaintenanceRequestId = $this->resolveMaintenanceRequestRedirect($sp);

        return DB::transaction(function () use ($sp, $user, $redirectMaintenanceRequestId): array {
            // Defensive ownership check inside the transaction — the
            // caller (controller) already gates, but routing changes
            // could leak past the gate later.
            if ((int) $sp->user_id !== (int) $user->id) {
                abort(403);
            }

            if ($sp->status !== ServiceProviderProfileStatus::Active) {
                $sp->forceFill(['status' => ServiceProviderProfileStatus::Active->value])->save();
            }

            // TCK-592 — seules les collaborations d'une INVITATION EN ATTENTE s'activent ici :
            // `paused` sans `metadata.paused_by`. Une pause posée par l'agence porte `paused_by`
            // et ne se lève que par l'agence (`ServiceProviderCollaborationService`).
            $activated = ServiceProviderAgencyCollaboration::query()
                ->where('service_provider_profile_id', $sp->id)
                ->where('status', CollaborationStatus::Paused->value)
                ->whereNull('metadata->paused_by')
                ->update(['status' => CollaborationStatus::Active->value]);

            $this->markPhoneVerified($user);

            $this->assignDeepLinkedRequest($redirectMaintenanceRequestId, $user);

            activity('Onboarding')
                ->performedOn($sp)
                ->causedBy($user)
                ->withProperties([
                    'service_provider_profile_id' => $sp->id,
                    'activated_collaborations' => (int) $activated,
                    'from_maintenance_request_id' => $redirectMaintenanceRequestId,
                ])
                ->event('sp_onboarding_completed')
                ->log('sp_onboarding_completed');

            return [
                'sp_profile' => $sp->refresh(),
                'activated_collaborations' => (int) $activated,
                'redirect_to_maintenance_request_id' => $redirectMaintenanceRequestId,
            ];
        });
    }

    /**
     * Wrap PhoneVerificationService so tests can stub via the container.
     * Mirror HostIndividualOnboardingService — keep dev/test bypass
     * (`123456`) so the wizard is exercisable end-to-end without an SMS
     * provider.
     */
    protected function verifyOtp(User $user, string $code): bool
    {
        if ($code === '' || $user->phone === null) {
            return false;
        }

        if ($this->phoneVerification->verifyOtp($user, $code)) {
            return true;
        }

        if (! app()->environment('production') && hash_equals('123456', trim($code))) {
            return true;
        }

        return false;
    }

    protected function markPhoneVerified(User $user): void
    {
        if ($user->phone_verified_at !== null) {
            // Still log the explicit verification event the first time
            // we record it inside the wizard.
            return;
        }

        $user->forceFill(['phone_verified_at' => now()])->save();

        activity('Onboarding')
            ->causedBy($user)
            ->performedOn($user)
            ->withProperties(['user_id' => $user->id])
            ->event('sp_phone_verified')
            ->log('sp_phone_verified');
    }

    /**
     * TCK-592 (P18) — la demande du lien profond est ASSIGNÉE au nouveau prestataire (acceptation à
     * venir) : sans cela, le renvoi en fin d'onboarding menait à un 403. Seulement si elle est
     * encore ouverte et que le prestataire y est désormais assignable (collaboration active avec
     * l'agence du bien) — l'invitation l'a vérifiée à l'émission, l'état a pu changer depuis.
     */
    protected function assignDeepLinkedRequest(?int $maintenanceRequestId, User $user): void
    {
        if ($maintenanceRequestId === null) {
            return;
        }

        $mr = MaintenanceRequest::query()->with('property')->find($maintenanceRequestId);
        if ($mr === null
            || app(MaintenanceStateMachine::class)->isTerminal($mr->status)
            || ! app(ProviderEligibility::class)->isAssignable($user, $mr->property)) {
            return;
        }

        app(MaintenanceRequestService::class)->assign($mr, $user, null);
    }

    /**
     * Pull the deep-link maintenance request id from the most recent
     * accepted invitation that bound this SP profile. The
     * ServiceProviderInvitationService stores it in
     * `metadata.from_maintenance_request_id` (TCK-260).
     */
    protected function resolveMaintenanceRequestRedirect(ServiceProviderProfile $sp): ?int
    {
        $invitation = $sp->invitations()
            ->orderByDesc('id')
            ->first();

        if ($invitation === null) {
            return null;
        }

        $value = data_get($invitation->metadata, 'from_maintenance_request_id');
        if ($value === null || $value === '') {
            return null;
        }

        $cast = (int) $value;

        return $cast > 0 ? $cast : null;
    }
}
