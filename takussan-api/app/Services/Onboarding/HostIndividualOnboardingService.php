<?php

namespace App\Services\Onboarding;

use App\Http\Requests\Onboarding\HostIndividualOnboardRequest;
use App\Models\Agency;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\Currency;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Services\Auth\PhoneVerificationService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

/**
 * TCK-255 — orchestrates the host individual onboarding flow.
 *
 * One transactional shot:
 *   1. Validates the phone OTP (delegated to {@see PhoneVerificationService}).
 *   2. Creates the {@see Agency} with `kind = individual`,
 *      `status = active`, `is_verified = false`.
 *   3. Pins the user as `primary_admin_id`. TCK-278 — no spatie role is
 *      attached any more (ADR-0002): the two profiles created at step 4
 *      ARE the `agency_admin` + `owner` roles, scoped by their `agency_id`.
 *   4. Creates the {@see AgencyAdminProfile} (TCK-271 — agency-side
 *      profile, pinned as the active context cookie) and the
 *      {@see OwnerProfile} (KYC-bearing profile for the owner role).
 *   5. TCK-496 — l'étape « mode de paiement » a quitté l'assistant : on ne
 *      demande plus par quel opérateur être payé à quelqu'un qui n'a pas
 *      encore d'annonce. La clé `settings.payment.preferred_provider` n'est
 *      donc écrite QUE si l'appelant la fournit — un brouillon repris, ou un
 *      client tiers resté sur l'ancien contrat. Une agence sans préférence
 *      n'est pas une agence cassée : la question se repose au premier
 *      encaissement, où elle a un sens immédiat.
 *   6. Sets the user's `active_profile` (returned to the caller so the
 *      controller can refresh the cookie).
 *   7. Logs the `host_individual_onboarded` activity.
 *
 * The wizard used to create a first property draft inline (step 3) — that
 * step has been dropped so the user lands on `/app/properties/new` and
 * uses the regular property-creation form instead. No first property is
 * touched by this service anymore.
 *
 * Any failure rolls the whole transaction back — no orphan agencies.
 */
class HostIndividualOnboardingService
{
    public function __construct(private readonly PhoneVerificationService $phoneVerification) {}

    /**
     * @param  array<string, mixed>  $payload  Validated body from {@see HostIndividualOnboardRequest}.
     * @return array{agency: Agency, agency_admin_profile: AgencyAdminProfile, owner_profile: OwnerProfile, active_profile: AgencyAdminProfile}
     *
     * @throws ValidationException When the OTP is rejected.
     */
    public function onboard(User $user, array $payload): array
    {
        // One personal agency per user — bail out before consuming an OTP or
        // touching the DB. The legacy frontend gate on /onboarding/host could
        // miss this case for multi-profile users (TCK-142), so the invariant
        // lives here as the source of truth.
        if ($this->userAlreadyHasIndividualAgency($user)) {
            throw ValidationException::withMessages([
                'agency' => [__('onboarding.host_individual.errors.already_onboarded')],
            ])->status(Response::HTTP_CONFLICT);
        }

        // OTP gate — verified BEFORE the transaction so a wrong code never
        // touches the DB. The service silently consumes the cached OTP on
        // success, mirroring the existing PhoneVerificationController flow.
        //
        // Bypass when the user is already phone-verified — the wizard
        // pre-verifies through PhoneVerificationController (which consumes
        // the cache and sets `phone_verified_at`), and users who verified
        // in a prior flow (registration, owner/agent onboarding, profile)
        // shouldn't have to re-verify. Mirrors OwnerOnboardingService.
        $code = (string) data_get($payload, 'phone_otp.code');
        if ($user->phone_verified_at === null) {
            if (! $this->verifyOtp($user, $code)) {
                throw ValidationException::withMessages([
                    'phone_otp.code' => [__('onboarding.host_individual.errors.invalid_otp')],
                ])->status(422);
            }
        }

        return DB::transaction(function () use ($user, $payload): array {
            $agency = $this->createAgency($user, $payload);
            // TCK-278 — Plus d'attachement spatie : les profils créés ci-dessous
            // (AgencyAdminProfile + OwnerProfile) sont la source de vérité.
            $agencyAdminProfile = $this->createAgencyAdminProfile($user, $agency);
            $ownerProfile = $this->createOwnerProfile($user, $agency);
            $this->markPhoneVerified($user);

            activity('Onboarding')
                ->causedBy($user)
                ->performedOn($agency)
                ->withProperties([
                    'user_id' => $user->id,
                    'agency_id' => $agency->id,
                    'source' => 'wizard',
                ])
                ->event('host_individual_onboarded')
                ->log('host_individual_onboarded');

            return [
                'agency' => $agency->refresh(),
                'agency_admin_profile' => $agencyAdminProfile->refresh(),
                'owner_profile' => $ownerProfile->refresh(),
                // TCK-271 — the agency-admin profile is now the concrete
                // active profile. Pinning it (rather than the OwnerProfile)
                // makes the cookie semantics match the user's primary
                // intent in the wizard ("I'm setting up my agency"). TCK-278
                // — ResolveActiveProfile reads the agency straight off the
                // profile's own `agency_id`; there is no team_id and no
                // spatie role attachment to go through (ADR-0002).
                'active_profile' => $agencyAdminProfile,
            ];
        });
    }

    /**
     * Wraps {@see PhoneVerificationService::verifyOtp()} so tests can override
     * via the container. In `local`/`testing` we also accept a fixed dev
     * code (`123456`) to keep the wizard exercisable end-to-end without a
     * real SMS provider — matches the existing OTP-stub pattern.
     */
    protected function verifyOtp(User $user, string $code): bool
    {
        if ($code === '' || $user->phone === null) {
            return false;
        }

        if ($this->phoneVerification->verifyOtp($user, $code)) {
            return true;
        }

        // Dev/test bypass — production never matches because the env check
        // short-circuits before hash comparison. A real SMS gateway should
        // replace `PhoneVerificationService::sendSms` in prod.
        if (! app()->environment('production') && hash_equals('123456', trim($code))) {
            return true;
        }

        return false;
    }

    private function userAlreadyHasIndividualAgency(User $user): bool
    {
        return OwnerProfile::query()
            ->where('user_id', $user->id)
            ->whereHas('agency', fn ($q) => $q->where('kind', AgencyKind::Individual))
            ->exists();
    }

    private function createAgency(User $user, array $payload): Agency
    {
        $name = (string) data_get($payload, 'agency.name');
        $primaryCity = (string) data_get($payload, 'agency.primary_city');
        $currencyValue = (string) data_get($payload, 'agency.currency', Currency::default()->value);
        $primaryPropertyType = (string) data_get($payload, 'preferences.primary_property_type');
        $preferredProvider = data_get($payload, 'payment_setting.preferred_provider');

        $settings = [
            'primary_city' => $primaryCity,
            'primary_property_type' => $primaryPropertyType,
            // Marker so downstream surfaces can distinguish between an
            // individual created via the wizard and one provisioned by a
            // super-admin (see TCK-263).
            'onboarding_source' => 'host_individual_wizard',
        ];

        // TCK-496 — la clé n'est posée que si elle a été fournie. La version
        // précédente castait en `(string)` et écrivait donc `''` quand rien
        // n'était donné : une préférence VIDE, indiscernable en aval d'un choix
        // délibéré. *Une valeur par défaut fabriquée est un mensonge qui a l'air
        // d'une donnée.*
        if (is_string($preferredProvider) && $preferredProvider !== '') {
            $settings['payment'] = ['preferred_provider' => $preferredProvider];
        }

        return Agency::query()->create([
            'name' => $name,
            'slug' => $this->uniqueSlug($name),
            'kind' => AgencyKind::Individual,
            'status' => AgencyStatus::Active,
            'is_verified' => false,
            'verified_at' => null,
            'currency' => Currency::from(strtoupper($currencyValue)),
            'primary_admin_id' => $user->id,
            'settings' => $settings,
        ]);
    }

    /**
     * TCK-271 — agency-admin profile is materialized in the same
     * transaction as the agency, so the wizard can pin it as the active
     * profile cookie. `firstOrCreate` for parity with the owner profile
     * helper (defensive against rare replays).
     */
    private function createAgencyAdminProfile(User $user, Agency $agency): AgencyAdminProfile
    {
        $profile = AgencyAdminProfile::query()->firstOrCreate(
            ['user_id' => $user->id, 'agency_id' => $agency->id],
            ['status' => AgencyAdminProfileStatus::Active->value],
        );

        if ($profile->status !== AgencyAdminProfileStatus::Active) {
            $profile->forceFill(['status' => AgencyAdminProfileStatus::Active->value])->save();
        }

        return $profile;
    }

    private function createOwnerProfile(User $user, Agency $agency): OwnerProfile
    {
        // `firstOrCreate` so a (rare) replay or a User with a legacy stub
        // OwnerProfile (TCK-142 mutator) doesn't break the flow.
        $profile = OwnerProfile::query()->firstOrCreate(
            ['user_id' => $user->id, 'agency_id' => $agency->id],
            ['status' => OwnerProfileStatus::Active->value],
        );

        if ($profile->status !== OwnerProfileStatus::Active) {
            $profile->forceFill(['status' => OwnerProfileStatus::Active->value])->save();
        }

        return $profile;
    }

    /**
     * The phone OTP succeeded — flag the user as phone-verified if not
     * already. Idempotent on purpose so a re-run (after a partial failure
     * the caller decides to retry) doesn't bump the timestamp.
     */
    private function markPhoneVerified(User $user): void
    {
        if ($user->phone_verified_at !== null) {
            return;
        }

        $user->forceFill(['phone_verified_at' => now()])->save();
    }

    private function uniqueSlug(string $name): string
    {
        $base = Str::slug($name);
        if ($base === '') {
            $base = 'agence';
        }

        $slug = $base;
        $suffix = 2;
        while (Agency::query()->where('slug', $slug)->exists()) {
            $slug = "{$base}-{$suffix}";
            $suffix++;
        }

        return $slug;
    }
}
