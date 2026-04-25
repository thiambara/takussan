<?php

namespace Tests\Feature\Auth;

use App\Models\AccountDeletionRequest;
use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\User;
use App\Notifications\AccountDeletionRequestedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use PragmaRX\Google2FA\Google2FA;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

class AccountDeletionRequestTest extends TestCase
{
    use RefreshDatabase;

    public function test_request_with_correct_password_returns_202_and_schedules_at_j_plus_30(): void
    {
        Notification::fake();

        $user = User::factory()->create(['password' => bcrypt('correct-horse')]);
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/auth/me/deletion-request', [
            'password' => 'correct-horse',
            'reason_code' => 'privacy',
            'reason' => 'I prefer to delete my account.',
        ]);

        $response->assertStatus(202)
            ->assertJsonStructure(['data' => ['id', 'requested_at', 'scheduled_for', 'days_remaining']]);

        $request = AccountDeletionRequest::query()->where('user_id', $user->id)->first();
        $this->assertNotNull($request);
        $graceDays = (int) config('auth.account_deletion.grace_days');
        $this->assertEqualsWithDelta(
            now()->addDays($graceDays)->timestamp,
            $request->scheduled_for->timestamp,
            120,
        );

        $this->assertNotNull($user->fresh()->deletion_requested_at);

        Notification::assertSentTo($user, AccountDeletionRequestedNotification::class);
    }

    public function test_request_with_wrong_password_returns_422(): void
    {
        $user = User::factory()->create(['password' => bcrypt('correct-horse')]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/me/deletion-request', [
            'password' => 'wrong-horse',
            'reason_code' => 'privacy',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['password']);

        $this->assertNull($user->fresh()->deletion_requested_at);
    }

    public function test_request_blocked_when_user_has_active_lease_as_landlord(): void
    {
        $user = User::factory()->create(['password' => bcrypt('correct-horse')]);
        Lease::factory()->for($user, 'landlord')->create([
            'status' => LeaseStatus::Active,
            'reference_number' => 'LS-XYZ123',
        ]);
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/auth/me/deletion-request', [
            'password' => 'correct-horse',
            'reason_code' => 'privacy',
        ])->assertStatus(422);

        $response->assertJsonStructure(['obligations']);
        $this->assertNotEmpty($response->json('obligations'));
        $this->assertSame('lease', $response->json('obligations.0.type'));
    }

    public function test_request_revokes_all_sanctum_tokens(): void
    {
        $user = User::factory()->create(['password' => bcrypt('correct-horse')]);
        // Mint two extra tokens beyond Sanctum::actingAs.
        $user->createToken('phone');
        $user->createToken('web');
        Sanctum::actingAs($user);

        $this->assertGreaterThan(0, $user->tokens()->count());

        $this->postJson('/api/auth/me/deletion-request', [
            'password' => 'correct-horse',
            'reason_code' => 'privacy',
        ])->assertStatus(202);

        $this->assertSame(0, $user->fresh()->tokens()->count());
    }

    public function test_request_requires_valid_two_factor_code_when_2fa_active(): void
    {
        $secret = (new Google2FA)->generateSecretKey();
        $user = User::factory()->create([
            'password' => bcrypt('correct-horse'),
            'two_factor_enabled' => true,
            'two_factor_secret' => $secret,
        ]);
        Sanctum::actingAs($user);

        // No code provided
        $this->postJson('/api/auth/me/deletion-request', [
            'password' => 'correct-horse',
            'reason_code' => 'privacy',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['two_factor_code']);

        // Wrong code
        $this->postJson('/api/auth/me/deletion-request', [
            'password' => 'correct-horse',
            'reason_code' => 'privacy',
            'two_factor_code' => '000000',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['two_factor_code']);

        // Correct code
        $this->postJson('/api/auth/me/deletion-request', [
            'password' => 'correct-horse',
            'reason_code' => 'privacy',
            'two_factor_code' => (new Google2FA)->getCurrentOtp($secret),
        ])->assertStatus(202);
    }

    public function test_activity_log_records_request_transition(): void
    {
        $user = User::factory()->create(['password' => bcrypt('correct-horse')]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/me/deletion-request', [
            'password' => 'correct-horse',
            'reason_code' => 'privacy',
        ])->assertStatus(202);

        $log = Activity::query()->where('event', 'account.deletion.requested')->first();
        $this->assertNotNull($log);
        $this->assertSame($user->id, $log->causer_id);
    }

    public function test_blocked_when_user_has_pending_lease_payment_via_customer(): void
    {
        $user = User::factory()->create(['password' => bcrypt('correct-horse')]);
        $customer = Customer::factory()->create(['user_id' => $user->id]);
        $lease = Lease::factory()->create(['tenant_id' => $customer->id, 'status' => LeaseStatus::Active]);

        // The active lease alone is enough for the test contract; the
        // service surfaces leases first then payments.
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/auth/me/deletion-request', [
            'password' => 'correct-horse',
            'reason_code' => 'privacy',
        ])->assertStatus(422);

        $obligations = collect($response->json('obligations'));
        $this->assertTrue($obligations->contains(fn ($o) => $o['type'] === 'lease' && $o['id'] === $lease->id));
    }
}
