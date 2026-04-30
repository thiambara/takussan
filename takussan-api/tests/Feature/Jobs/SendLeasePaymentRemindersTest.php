<?php

namespace Tests\Feature\Jobs;

use App\Jobs\SendLeasePaymentReminders;
use App\Models\Customer;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\User;
use App\Services\Model\NotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\TestCase;

class SendLeasePaymentRemindersTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_sends_reminders_for_upcoming_payments(): void
    {
        $tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $tenantUser->id]);
        $lease = Lease::factory()->create(['tenant_id' => $tenant->id]);

        LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'status' => PaymentStatus::Pending,
            'due_date' => now()->addDays(3)->toDateString(),
        ]);

        $notificationService = Mockery::mock(NotificationService::class);
        $notificationService->shouldReceive('notify')->once();

        $job = new SendLeasePaymentReminders;
        app()->call([$job, 'handle'], ['notifications' => $notificationService]);
    }

    public function test_it_sends_reminders_for_overdue_payments(): void
    {
        $tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $tenantUser->id]);
        $lease = Lease::factory()->create(['tenant_id' => $tenant->id]);

        LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'status' => PaymentStatus::Late,
            'due_date' => now()->subDay()->toDateString(),
        ]);

        $notificationService = Mockery::mock(NotificationService::class);
        $notificationService->shouldReceive('notify')->once();

        $job = new SendLeasePaymentReminders;
        app()->call([$job, 'handle'], ['notifications' => $notificationService]);
    }

    public function test_it_ignores_paid_payments(): void
    {
        $tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $tenantUser->id]);
        $lease = Lease::factory()->create(['tenant_id' => $tenant->id]);

        LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'status' => PaymentStatus::Paid,
            'due_date' => now()->addDays(3)->toDateString(),
        ]);

        $notificationService = Mockery::mock(NotificationService::class);
        $notificationService->shouldReceive('notify')->never();

        $job = new SendLeasePaymentReminders;
        app()->call([$job, 'handle'], ['notifications' => $notificationService]);
    }
}
