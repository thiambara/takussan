<?php

namespace Tests\Feature\Api;

use App\Jobs\SendOverdueInvoiceReminders;
use App\Jobs\SendPropertyVisitReminders;
use App\Models\Customer;
use App\Models\Enums\InvoiceStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Invoice;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Model\NotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ScheduledJobsTest extends TestCase
{
    use RefreshDatabase;

    public function test_visit_reminder_job_sends_notifications(): void
    {
        $agent = User::factory()->create();
        $visitor = User::factory()->create();
        $property = Property::factory()->create();

        PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'agent_id' => $agent->id,
            'visitor_id' => $visitor->id,
            'status' => VisitStatus::Scheduled,
            'scheduled_at' => now()->addDay(),
        ]);

        // Job should not throw
        $job = new SendPropertyVisitReminders;
        $job->handle(app(NotificationService::class));

        // Notifications should have been created
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $agent->id,
        ]);
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $visitor->id,
        ]);
    }

    public function test_visit_reminder_ignores_non_tomorrow_visits(): void
    {
        $agent = User::factory()->create();
        $property = Property::factory()->create();

        PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'agent_id' => $agent->id,
            'status' => VisitStatus::Scheduled,
            'scheduled_at' => now()->addDays(5),
        ]);

        $job = new SendPropertyVisitReminders;
        $job->handle(app(NotificationService::class));

        $this->assertDatabaseMissing('app_notifications', [
            'user_id' => $agent->id,
        ]);
    }

    public function test_overdue_invoice_job_updates_status_and_notifies(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $user->id]);

        $invoice = Invoice::factory()->sent()->create([
            'customer_id' => $customer->id,
            'due_date' => now()->subDays(2)->toDateString(),
        ]);

        $job = new SendOverdueInvoiceReminders;
        $job->handle(app(NotificationService::class));

        // Invoice should be marked overdue
        $this->assertDatabaseHas('invoices', [
            'id' => $invoice->id,
            'status' => InvoiceStatus::Overdue->value,
        ]);

        // Notification should be created for the customer's user
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $user->id,
        ]);
    }

    public function test_overdue_job_ignores_non_due_invoices(): void
    {
        $customer = Customer::factory()->create();

        Invoice::factory()->sent()->create([
            'customer_id' => $customer->id,
            'due_date' => now()->addDays(10)->toDateString(),
        ]);

        $job = new SendOverdueInvoiceReminders;
        $job->handle(app(NotificationService::class));

        // No invoice should be overdue
        $this->assertDatabaseMissing('invoices', [
            'status' => InvoiceStatus::Overdue->value,
        ]);
    }
}
