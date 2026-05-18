<?php

namespace Tests\Feature\Onboarding;

use App\Models\Agency;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Services\Auth\PhoneVerificationService;
use Database\Seeders\System\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-255 — host individual onboarding wizard backend.
 *
 * Covers AC3 (agency + profiles created), AC4 (rollback on invalid OTP),
 * AC6 (activity log) plus the spatie role attachment scoped to the
 * freshly-created agency team_id, and the active profile cookie returned
 * to the caller. The first-property step has been removed from the wizard
 * so this test no longer covers a draft property creation.
 */
class HostIndividualOnboardingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    private function defaultPayload(): array
    {
        return [
            'agency' => [
                'name' => 'Espace de Amine',
                'primary_city' => 'Dakar',
                'currency' => 'XOF',
            ],
            'phone_otp' => [
                'phone' => '+221770000000',
                'code' => '123456',
            ],
            'preferences' => [
                'primary_property_type' => 'apartment',
            ],
            'payment_setting' => [
                'preferred_provider' => 'wave',
            ],
            'cgu_accepted' => true,
        ];
    }

    public function test_nominal_flow_creates_agency_admin_and_owner_profiles_and_attaches_roles(): void
    {
        $user = User::factory()->create([
            'phone' => '+221770000000',
            'phone_verified_at' => null,
        ]);
        Sanctum::actingAs($user);

        // Stash a real OTP via the service so the verify path matches the
        // production hash check, not the dev bypass.
        $code = app(PhoneVerificationService::class)->sendOtp($user);
        $this->assertNotNull($code);

        $payload = $this->defaultPayload();
        $payload['phone_otp']['code'] = $code;

        $response = $this->postJson('/api/host/individual/onboard', $payload);

        $response->assertStatus(201)
            ->assertJsonPath('data.agency.kind', AgencyKind::Individual->value)
            ->assertJsonPath('data.profiles.agency_admin.role', 'agency_admin')
            ->assertJsonPath('data.profiles.agency_admin.status', AgencyAdminProfileStatus::Active->value)
            ->assertJsonMissingPath('data.property_draft');

        // Agency persisted with kind=individual + active.
        $agencyId = $response->json('data.agency.id');
        $agency = Agency::query()->findOrFail($agencyId);
        $this->assertSame(AgencyKind::Individual, $agency->kind);
        $this->assertSame(AgencyStatus::Active, $agency->status);
        $this->assertFalse((bool) $agency->is_verified);
        $this->assertSame($user->id, $agency->primary_admin_id);
        $this->assertSame('wave', data_get($agency->settings, 'payment.preferred_provider'));

        // OwnerProfile active and linked (TCK-255 baseline).
        $owner = OwnerProfile::query()
            ->where('user_id', $user->id)
            ->where('agency_id', $agency->id)
            ->firstOrFail();
        $this->assertSame(OwnerProfileStatus::Active, $owner->status);

        // TCK-271 — AgencyAdminProfile created in the same transaction
        // and exposed in the response payload.
        $admin = AgencyAdminProfile::query()
            ->where('user_id', $user->id)
            ->where('agency_id', $agency->id)
            ->firstOrFail();
        $this->assertSame(AgencyAdminProfileStatus::Active, $admin->status);
        $this->assertSame($admin->id, (int) $response->json('data.profiles.agency_admin.id'));

        // Spatie roles scoped to agency team_id.
        $registrar = app(PermissionRegistrar::class);
        $registrar->setPermissionsTeamId($agency->id);
        $user->unsetRelation('roles');
        $this->assertTrue($user->hasRole('agency_admin'));
        $this->assertTrue($user->hasRole('owner'));
        $registrar->setPermissionsTeamId(null);

        // Active profile cookie set on the response so the next request
        // resolves the agency context automatically. TCK-271 — the cookie
        // must point to the AgencyAdminProfile (not the OwnerProfile).
        $cookies = $response->headers->getCookies();
        $names = array_map(fn ($c) => $c->getName(), $cookies);
        $this->assertContains('active_profile_id', $names);

        $cookieValue = null;
        foreach ($cookies as $cookie) {
            if ($cookie->getName() === 'active_profile_id') {
                $cookieValue = $cookie->getValue();
                break;
            }
        }
        $this->assertSame("agency_admin:{$admin->id}", $cookieValue);
        $this->assertSame("agency_admin:{$admin->id}", $response->json('data.active_profile_id'));

        // Phone marked as verified by side-effect.
        $this->assertNotNull($user->fresh()->phone_verified_at);
    }

    public function test_invalid_otp_rejects_with_422_and_does_not_persist_anything(): void
    {
        $user = User::factory()->create([
            'phone' => '+221770000000',
            'phone_verified_at' => null,
        ]);
        Sanctum::actingAs($user);

        $agencyCountBefore = Agency::query()->count();
        $ownerCountBefore = OwnerProfile::query()->count();
        $adminCountBefore = AgencyAdminProfile::query()->count();

        $payload = $this->defaultPayload();
        $payload['phone_otp']['code'] = '999999'; // not a cached code, not the dev bypass

        $response = $this->postJson('/api/host/individual/onboard', $payload);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['phone_otp.code']);

        $this->assertSame($agencyCountBefore, Agency::query()->count());
        $this->assertSame($ownerCountBefore, OwnerProfile::query()->count());
        $this->assertSame($adminCountBefore, AgencyAdminProfile::query()->count());
    }

    public function test_cgu_must_be_accepted_otherwise_422(): void
    {
        $user = User::factory()->create([
            'phone' => '+221770000000',
            'phone_verified_at' => null,
        ]);
        Sanctum::actingAs($user);

        $payload = $this->defaultPayload();
        $payload['cgu_accepted'] = false;

        $this->postJson('/api/host/individual/onboard', $payload)
            ->assertStatus(422)
            ->assertJsonValidationErrors(['cgu_accepted']);

        $this->assertSame(0, Agency::query()->count());
    }

    public function test_activity_log_entry_is_created_on_success(): void
    {
        $user = User::factory()->create([
            'phone' => '+221770000000',
            'phone_verified_at' => null,
        ]);
        Sanctum::actingAs($user);

        $code = app(PhoneVerificationService::class)->sendOtp($user);
        $payload = $this->defaultPayload();
        $payload['phone_otp']['code'] = $code;

        $this->postJson('/api/host/individual/onboard', $payload)->assertStatus(201);

        $activity = Activity::query()
            ->where('event', 'host_individual_onboarded')
            ->where('causer_id', $user->id)
            ->first();

        $this->assertNotNull($activity);
        $this->assertSame($user->id, (int) $activity->properties->get('user_id'));
        $this->assertSame('wizard', $activity->properties->get('source'));
        $this->assertNotNull($activity->properties->get('agency_id'));
    }

    public function test_endpoint_requires_authentication(): void
    {
        $this->postJson('/api/host/individual/onboard', $this->defaultPayload())
            ->assertStatus(401);
    }

    public function test_second_onboarding_attempt_is_rejected_and_does_not_create_duplicate_agency(): void
    {
        $user = User::factory()->create([
            'phone' => '+221770000000',
            'phone_verified_at' => null,
        ]);
        Sanctum::actingAs($user);

        // First onboarding — happy path.
        $code = app(PhoneVerificationService::class)->sendOtp($user);
        $payload = $this->defaultPayload();
        $payload['phone_otp']['code'] = $code;
        $this->postJson('/api/host/individual/onboard', $payload)->assertStatus(201);

        $this->assertSame(1, Agency::query()->count());
        $this->assertSame(1, OwnerProfile::query()->count());
        $this->assertSame(1, AgencyAdminProfile::query()->count());

        // Second attempt with a fresh OTP — must be refused without touching the DB.
        $code2 = app(PhoneVerificationService::class)->sendOtp($user);
        $payload2 = $this->defaultPayload();
        $payload2['phone_otp']['code'] = $code2;
        $this->postJson('/api/host/individual/onboard', $payload2)
            ->assertStatus(409)
            ->assertJsonValidationErrors(['agency']);

        $this->assertSame(1, Agency::query()->count());
        $this->assertSame(1, OwnerProfile::query()->count());
        $this->assertSame(1, AgencyAdminProfile::query()->count());
    }
}
