<?php

namespace App\Services\Onboarding;

use App\Http\Requests\Onboarding\HostIndividualOnboardRequest;
use App\Models\Agency;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\Enums\PropertyVisibility;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Auth\PhoneVerificationService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * TCK-255 — orchestrates the host individual onboarding flow.
 *
 * One transactional shot:
 *   1. Validates the phone OTP (delegated to {@see PhoneVerificationService}).
 *   2. Creates the {@see Agency} with `kind = individual`,
 *      `status = active`, `is_verified = false`.
 *   3. Pins the user as `primary_admin_id` and attaches the spatie
 *      `agency_admin` + `owner` roles scoped to the agency team_id.
 *   4. Creates the {@see AgencyAdminProfile} (TCK-271 — agency-side
 *      profile, pinned as the active context cookie) and the
 *      {@see OwnerProfile} (KYC-bearing profile for the owner role).
 *   5. Creates the first {@see Property} as `status = draft`,
 *      `visibility = private`.
 *   6. Stores `payment_setting.preferred_provider` on the agency's
 *      `settings` JSON column (no dedicated PaymentSetting model exists
 *      in V1 — full provider config is deferred to first booking per
 *      ticket scope).
 *   7. Sets the user's `active_profile` (returned to the caller so the
 *      controller can refresh the cookie).
 *   8. Logs the `host_individual_onboarded` activity.
 *
 * Any failure rolls the whole transaction back — no orphan agencies.
 */
class HostIndividualOnboardingService
{
    public function __construct(private readonly PhoneVerificationService $phoneVerification) {}

    /**
     * @param  array<string, mixed>  $payload  Validated body from {@see HostIndividualOnboardRequest}.
     * @return array{agency: Agency, agency_admin_profile: AgencyAdminProfile, owner_profile: OwnerProfile, property_draft: Property, active_profile: AgencyAdminProfile}
     *
     * @throws ValidationException When the OTP is rejected.
     */
    public function onboard(User $user, array $payload): array
    {
        // OTP gate — verified BEFORE the transaction so a wrong code never
        // touches the DB. The service silently consumes the cached OTP on
        // success, mirroring the existing PhoneVerificationController flow.
        $code = (string) data_get($payload, 'phone_otp.code');
        if (! $this->verifyOtp($user, $code)) {
            throw ValidationException::withMessages([
                'phone_otp.code' => [__('onboarding.host_individual.errors.invalid_otp')],
            ])->status(422);
        }

        return DB::transaction(function () use ($user, $payload): array {
            $agency = $this->createAgency($user, $payload);
            $this->attachRoles($user, $agency);
            $agencyAdminProfile = $this->createAgencyAdminProfile($user, $agency);
            $ownerProfile = $this->createOwnerProfile($user, $agency);
            $propertyDraft = $this->createPropertyDraft($user, $agency, $payload);
            $this->markPhoneVerified($user);

            activity('Onboarding')
                ->causedBy($user)
                ->performedOn($agency)
                ->withProperties([
                    'user_id' => $user->id,
                    'agency_id' => $agency->id,
                    'first_property_id' => $propertyDraft->id,
                    'source' => 'wizard',
                ])
                ->event('host_individual_onboarded')
                ->log('host_individual_onboarded');

            return [
                'agency' => $agency->refresh(),
                'agency_admin_profile' => $agencyAdminProfile->refresh(),
                'owner_profile' => $ownerProfile->refresh(),
                'property_draft' => $propertyDraft->refresh(),
                // TCK-271 — the agency-admin profile is now the concrete
                // active profile. Pinning it (rather than the OwnerProfile)
                // makes the cookie semantics match the user's primary
                // intent in the wizard ("I'm setting up my agency"), and
                // ResolveActiveProfile resolves it back to the correct
                // team_id via the spatie role attachment.
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

    private function createAgency(User $user, array $payload): Agency
    {
        $name = (string) data_get($payload, 'agency.name');
        $primaryCity = (string) data_get($payload, 'agency.primary_city');
        $currencyValue = (string) data_get($payload, 'agency.currency', Currency::default()->value);
        $primaryPropertyType = (string) data_get($payload, 'preferences.primary_property_type');
        $preferredProvider = (string) data_get($payload, 'payment_setting.preferred_provider');

        $settings = [
            'primary_city' => $primaryCity,
            'primary_property_type' => $primaryPropertyType,
            'payment' => [
                'preferred_provider' => $preferredProvider,
            ],
            // Marker so downstream surfaces can distinguish between an
            // individual created via the wizard and one provisioned by a
            // super-admin (see TCK-263).
            'onboarding_source' => 'host_individual_wizard',
        ];

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

    private function attachRoles(User $user, Agency $agency): void
    {
        Role::findOrCreate('agency_admin', 'web');
        Role::findOrCreate('owner', 'web');

        $registrar = app(PermissionRegistrar::class);
        $previous = $registrar->getPermissionsTeamId();
        $registrar->setPermissionsTeamId($agency->id);
        $user->unsetRelation('roles');

        try {
            if (! $user->hasRole('agency_admin')) {
                $user->assignRole('agency_admin');
            }
            if (! $user->hasRole('owner')) {
                $user->assignRole('owner');
            }
        } finally {
            $registrar->setPermissionsTeamId($previous);
            $user->unsetRelation('roles');
        }
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

    private function createPropertyDraft(User $user, Agency $agency, array $payload): Property
    {
        $title = (string) data_get($payload, 'first_property_draft.title');
        $type = (string) data_get($payload, 'first_property_draft.type');
        $city = (string) data_get($payload, 'first_property_draft.city');
        $contractType = (string) data_get($payload, 'first_property_draft.contract_type');
        $price = (float) data_get($payload, 'first_property_draft.price', 0);

        return Property::query()->create([
            'user_id' => $user->id,
            'agency_id' => $agency->id,
            'title' => $title,
            'type' => PropertyType::from($type),
            'contract_type' => ContractType::from($contractType),
            'status' => PropertyStatus::Draft,
            'visibility' => PropertyVisibility::Private,
            'price' => $price,
            'currency' => $agency->currency,
            'metadata' => [
                'wizard' => 'host-individual',
                'city' => $city,
            ],
        ]);
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
