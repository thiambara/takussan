<?php

namespace App\Services\Onboarding;

use App\Models\Enums\OwnerProfileStatus;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Auth\PhoneVerificationService;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * TCK-257 — orchestrates the post-acceptance Owner onboarding wizard.
 *
 *  1. Validate phone OTP (mirror SP wizard — verified **before** the
 *     transaction so a wrong code never touches the DB).
 *  2. Activate (or assert active) the OwnerProfile.
 *  3. Caller sets the `active_profile_id` cookie pointing at the Owner.
 *  4. Activity log : `owner_phone_verified`, `owner_onboarding_completed`.
 *
 * KYC documents are uploaded upstream via the dedicated
 * `Me\OwnerProfileController` endpoints; by the time `complete()` is
 * called they're already on disk. KYC submission is **non-blocking** for
 * Owner activation per spec — `OwnerProfile.status = active` à
 * l'acceptation, KYC reste en `pending_review` côté metadata.
 */
class OwnerOnboardingService
{
    public function __construct(private readonly PhoneVerificationService $phoneVerification) {}

    /**
     * @return array{
     *     owner_profile: OwnerProfile,
     *     properties_count: int,
     * }
     *
     * @throws ValidationException When the OTP is rejected.
     */
    public function complete(OwnerProfile $owner, User $user, array $payload): array
    {
        // OTP gate. Bypass when the user is already phone-verified — the
        // wizard pre-verifies in step 1 and may re-submit on retries.
        $code = (string) data_get($payload, 'phone_otp.code');
        if ($user->phone_verified_at === null) {
            if (! $this->verifyOtp($user, $code)) {
                throw ValidationException::withMessages([
                    'phone_otp.code' => [__('owners.onboarding.errors.invalid_otp')],
                ])->status(422);
            }
        }

        return DB::transaction(function () use ($owner, $user): array {
            // Defensive ownership check inside the transaction — the
            // caller (controller) already gates, but routing changes
            // could leak past the gate later.
            if ((int) $owner->user_id !== (int) $user->id) {
                abort(403);
            }

            if ($owner->status !== OwnerProfileStatus::Active) {
                $owner->forceFill(['status' => OwnerProfileStatus::Active->value])->save();
            }

            $this->markPhoneVerified($user);

            $propertiesCount = Property::query()
                ->where('user_id', $owner->user_id)
                ->when($owner->agency_id !== null, fn ($q) => $q->where('agency_id', $owner->agency_id))
                ->count();

            activity('Onboarding')
                ->performedOn($owner)
                ->causedBy($user)
                ->withProperties([
                    'owner_profile_id' => $owner->id,
                    'properties_count' => $propertiesCount,
                ])
                ->event('owner_onboarding_completed')
                ->log('owner_onboarding_completed');

            return [
                'owner_profile' => $owner->refresh(),
                'properties_count' => $propertiesCount,
            ];
        });
    }

    /**
     * Wrap PhoneVerificationService so tests can stub via the container.
     * Mirror SP / host wizard — keep dev/test bypass (`123456`) so the
     * wizard is exercisable end-to-end without an SMS provider.
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
            return;
        }

        $user->forceFill(['phone_verified_at' => now()])->save();

        activity('Onboarding')
            ->causedBy($user)
            ->performedOn($user)
            ->withProperties(['user_id' => $user->id])
            ->event('owner_phone_verified')
            ->log('owner_phone_verified');
    }
}
