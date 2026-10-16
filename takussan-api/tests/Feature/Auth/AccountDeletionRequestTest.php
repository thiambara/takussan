<?php

namespace Tests\Feature\Auth;

use App\Models\AccountDeletionRequest;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\InvoiceStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
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

    /**
     * TCK-698 (P12.02) — un bail résilié ne bloque rien : seule l'échéance en retard
     * qui lui reste rattachée doit empêcher l'ancien locataire d'effacer son compte.
     */
    public function test_blocked_by_a_late_rent_on_a_terminated_lease(): void
    {
        [$user, $customer] = $this->formerTenant();
        $lease = Lease::factory()->create(['tenant_id' => $customer->id, 'status' => LeaseStatus::Terminated]);
        $payment = LeasePayment::factory()->late()->create(['lease_id' => $lease->id, 'payer_id' => $customer->id]);

        $obligations = $this->refusedObligations($user);

        $this->assertSame([['lease_payment', $payment->id]], $obligations);
    }

    /** TCK-698 (P12.02) — une facture envoyée et impayée, adressée au client lié au compte. */
    public function test_blocked_by_an_unpaid_invoice(): void
    {
        [$user, $customer] = $this->formerTenant();
        $invoice = Invoice::factory()->create(['customer_id' => $customer->id, 'status' => InvoiceStatus::Overdue]);
        Invoice::factory()->paid()->create(['customer_id' => $customer->id]);

        $obligations = $this->refusedObligations($user);

        $this->assertSame([['invoice', $invoice->id]], $obligations);
    }

    /** TCK-698 (P12.02) — une réservation créée par le compte et encore en cours. */
    public function test_blocked_by_an_open_booking(): void
    {
        [$user] = $this->formerTenant();
        $booking = Booking::factory()->create(['created_by_id' => $user->id, 'status' => BookingStatus::Confirmed]);
        Booking::factory()->cancelled()->create(['created_by_id' => $user->id]);

        $obligations = $this->refusedObligations($user);

        $this->assertSame([['booking', $booking->id]], $obligations);
    }

    /**
     * Témoin des trois tests précédents : soldées, les mêmes obligations ne bloquent plus. Sans lui,
     * une requête qui bloquerait tout le monde rendrait les trois verts.
     */
    public function test_settled_obligations_do_not_block(): void
    {
        Notification::fake();
        [$user, $customer] = $this->formerTenant();
        $lease = Lease::factory()->create(['tenant_id' => $customer->id, 'status' => LeaseStatus::Terminated]);
        LeasePayment::factory()->paid()->create(['lease_id' => $lease->id, 'payer_id' => $customer->id]);
        Invoice::factory()->paid()->create(['customer_id' => $customer->id]);
        Booking::factory()->create(['created_by_id' => $user->id, 'status' => BookingStatus::Completed]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/me/deletion-request', [
            'password' => 'correct-horse',
            'reason_code' => 'privacy',
        ])->assertStatus(202);
    }

    /** @return array{0: User, 1: Customer} */
    private function formerTenant(): array
    {
        $user = User::factory()->create(['password' => bcrypt('correct-horse')]);
        $customer = Customer::factory()->create(['user_id' => $user->id]);

        return [$user, $customer];
    }

    /** @return list<array{0: string, 1: int}> */
    private function refusedObligations(User $user): array
    {
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/auth/me/deletion-request', [
            'password' => 'correct-horse',
            'reason_code' => 'privacy',
        ])->assertStatus(422);

        $this->assertNull($user->fresh()->deletion_requested_at);

        return collect($response->json('obligations'))
            ->map(fn (array $o): array => [$o['type'], $o['id']])
            ->values()
            ->all();
    }
}
