<?php

namespace App\Services\Onboarding;

use App\Models\Customer;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use App\Services\Auth\PhoneVerificationService;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * TCK-259 — orchestrates the post-acceptance Agent onboarding wizard.
 *
 *  1. Validate phone OTP (mirror Owner / SP wizard — verified **before**
 *     the transaction so a wrong code never touches the DB).
 *  2. Activate (or assert active) the AgentProfile.
 *  3. Caller sets the `active_profile_id` cookie pointing at the Agent.
 *  4. Activity log : `agent_phone_verified`, `agent_onboarding_completed`.
 *
 * KYC documents + specialization / zones are persisted upstream by the
 * dedicated `Me\AgentProfileController` endpoints during the wizard ;
 * by the time `complete()` is called they're already on disk. KYC
 * submission is **non-blocking** for activation per spec.
 */
class AgentOnboardingService
{
    public function __construct(private readonly PhoneVerificationService $phoneVerification) {}

    /**
     * @return array{
     *     agent_profile: AgentProfile,
     *     first_lead: array<string, mixed>|null,
     * }
     *
     * @throws ValidationException When the OTP is rejected.
     */
    public function complete(AgentProfile $agent, User $user, array $payload): array
    {
        // OTP gate. Bypass when the user is already phone-verified — the
        // wizard pre-verifies in step 1 and may re-submit on retries.
        $code = (string) data_get($payload, 'phone_otp.code');
        if ($user->phone_verified_at === null) {
            if (! $this->verifyOtp($user, $code)) {
                throw ValidationException::withMessages([
                    'phone_otp.code' => [__('team.onboarding.errors.invalid_otp')],
                ])->status(422);
            }
        }

        return DB::transaction(function () use ($agent, $user): array {
            // Defensive ownership check inside the transaction — the
            // caller (controller) already gates, but routing changes
            // could leak past the gate later.
            if ((int) $agent->user_id !== (int) $user->id) {
                abort(403);
            }

            if ($agent->status !== AgentProfileStatus::Active) {
                $agent->forceFill(['status' => AgentProfileStatus::Active->value])->save();
            }

            $this->markPhoneVerified($user);

            $firstLead = $this->resolveFirstLead($agent);

            activity('Onboarding')
                ->performedOn($agent)
                ->causedBy($user)
                ->withProperties([
                    'agent_profile_id' => $agent->id,
                    'first_lead_customer_id' => $firstLead['id'] ?? null,
                ])
                ->event('agent_onboarding_completed')
                ->log('agent_onboarding_completed');

            return [
                'agent_profile' => $agent->refresh(),
                'first_lead' => $firstLead,
            ];
        });
    }

    /**
     * Wrap PhoneVerificationService so tests can stub via the container.
     * Mirror Owner / SP wizards — keep dev/test bypass (`123456`) so the
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
            ->event('agent_phone_verified')
            ->log('agent_phone_verified');
    }

    /**
     * Surface the first pre-assigned lead for the welcome screen. The
     * current schema has no dedicated `assigned_agent_id` column — we
     * use `customers.added_by_id = $agent_profile->user_id` scoped by
     * agency as a heuristic. Returns `null` when none.
     *
     * @return array<string, mixed>|null
     */
    protected function resolveFirstLead(AgentProfile $agent): ?array
    {
        if ($agent->user_id === null) {
            return null;
        }

        $customer = Customer::query()
            ->where('added_by_id', $agent->user_id)
            ->when($agent->agency_id !== null, fn ($q) => $q->where('agency_id', $agent->agency_id))
            ->orderBy('id')
            ->first(['id', 'first_name', 'last_name', 'email', 'phone', 'pipeline_stage', 'agency_id']);

        if ($customer === null) {
            return null;
        }

        return [
            'id' => $customer->id,
            'first_name' => $customer->first_name,
            'last_name' => $customer->last_name,
            'full_name' => trim((string) $customer->first_name.' '.(string) $customer->last_name),
            'email' => $customer->email,
            'phone' => $customer->phone,
            'pipeline_stage' => $customer->pipeline_stage?->value,
        ];
    }
}
