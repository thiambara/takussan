<?php

namespace Tests\Feature\Auth;

use App\Models\AccountDeletionRequest;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\UserStatus;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\User;
use App\Notifications\AccountDeletionExecutedNotification;
use App\Services\Account\AccountDeletionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

class AccountDeletionExecuteTest extends TestCase
{
    use RefreshDatabase;

    public function test_execute_anonymizes_user_fields(): void
    {
        Notification::fake();

        $user = User::factory()->create([
            'first_name' => 'Alice',
            'last_name' => 'Doe',
            'phone' => '+221700000000',
            'bio' => 'About me',
            'google_id' => 'g-1',
        ]);
        $request = AccountDeletionRequest::factory()->for($user)->due()->create();

        app(AccountDeletionService::class)->executeDeletion($request);

        $fresh = User::withTrashed()->find($user->id);
        // First/last name are NOT NULL on the schema, hence empty strings.
        $this->assertSame('', $fresh->first_name);
        $this->assertSame('', $fresh->last_name);
        $this->assertNull($fresh->phone);
        $this->assertNull($fresh->bio);
        $this->assertNull($fresh->google_id);
        $this->assertNull($fresh->facebook_id);
        $this->assertNull($fresh->apple_id);
        $this->assertSame('deleted-'.$user->id.'@takussan.local', $fresh->email);
        $this->assertSame(UserStatus::Deleted->value, $fresh->status->value);
        $this->assertNotNull($fresh->deleted_at);

        $this->assertNotNull($request->fresh()->executed_at);
    }

    public function test_execute_preserves_payments_invoices_leases_bookings(): void
    {
        Notification::fake();

        $user = User::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $user->id]);
        $lease = Lease::factory()->create([
            'landlord_id' => $user->id,
            'tenant_id' => $customer->id,
        ]);
        $leasePayment = LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $customer->id,
        ]);
        $booking = Booking::factory()->create(['created_by_id' => $user->id]);
        $bookingPayment = BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'payer_id' => $customer->id,
        ]);
        $invoice = Invoice::factory()->create(['customer_id' => $customer->id]);

        $request = AccountDeletionRequest::factory()->for($user)->due()->create();

        app(AccountDeletionService::class)->executeDeletion($request);

        // Records still requestable.
        $this->assertNotNull($lease->fresh());
        $this->assertNotNull($leasePayment->fresh());
        $this->assertNotNull($booking->fresh());
        $this->assertNotNull($bookingPayment->fresh());
        $this->assertNotNull($invoice->fresh());
    }

    public function test_execute_dissociates_customer_from_user(): void
    {
        Notification::fake();

        $user = User::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $user->id]);
        $request = AccountDeletionRequest::factory()->for($user)->due()->create();

        app(AccountDeletionService::class)->executeDeletion($request);

        $this->assertNull($customer->fresh()->user_id);
    }

    public function test_execute_logs_activity_transition_and_sends_notification(): void
    {
        Notification::fake();

        $user = User::factory()->create();
        $request = AccountDeletionRequest::factory()->for($user)->due()->create();

        app(AccountDeletionService::class)->executeDeletion($request);

        $log = Activity::query()->where('event', 'account.deletion.executed')->first();
        $this->assertNotNull($log);

        Notification::assertSentTo($user, AccountDeletionExecutedNotification::class);
    }

    public function test_execute_is_idempotent(): void
    {
        Notification::fake();

        $user = User::factory()->create();
        $request = AccountDeletionRequest::factory()->for($user)->due()->executed()->create();

        // Already executed: nothing should change.
        app(AccountDeletionService::class)->executeDeletion($request);

        // The user should NOT be soft-deleted because we never re-ran anonymization.
        $this->assertNotNull(User::query()->find($user->id));
    }
}
