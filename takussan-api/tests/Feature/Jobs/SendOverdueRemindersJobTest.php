<?php

namespace Tests\Feature\Jobs;

use App\Jobs\Invoice\SendOverdueRemindersJob;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\User;
use App\Notifications\InvoiceOverdueReminderNotification;
use App\Services\Invoice\OverdueReminderService;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class SendOverdueRemindersJobTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    public function test_sweeps_invoices_across_agencies_and_null_bucket(): void
    {
        // Two distinct agencies + one platform invoice (null agency).
        // All due 3 days ago — all should be relancées exactly once.
        $agency1 = Agency::factory()->create();
        $agency2 = Agency::factory()->create();

        $u1 = User::factory()->create();
        $u2 = User::factory()->create();
        $u3 = User::factory()->create();
        $c1 = Customer::factory()->create(['user_id' => $u1->id]);
        $c2 = Customer::factory()->create(['user_id' => $u2->id]);
        $c3 = Customer::factory()->create(['user_id' => $u3->id]);

        Invoice::factory()->sent()->create([
            'customer_id' => $c1->id,
            'agency_id' => $agency1->id,
            'due_date' => now()->subDays(3)->toDateString(),
        ]);
        Invoice::factory()->sent()->create([
            'customer_id' => $c2->id,
            'agency_id' => $agency2->id,
            'due_date' => now()->subDays(3)->toDateString(),
        ]);
        Invoice::factory()->sent()->create([
            'customer_id' => $c3->id,
            'agency_id' => null,
            'due_date' => now()->subDays(3)->toDateString(),
        ]);

        $count = (new SendOverdueRemindersJob)->handle(app(OverdueReminderService::class));

        $this->assertSame(3, $count);
        Notification::assertSentTo($u1, InvoiceOverdueReminderNotification::class);
        Notification::assertSentTo($u2, InvoiceOverdueReminderNotification::class);
        Notification::assertSentTo($u3, InvoiceOverdueReminderNotification::class);
    }

    public function test_two_runs_same_day_dispatch_only_once(): void
    {
        $u = User::factory()->create();
        $c = Customer::factory()->create(['user_id' => $u->id]);
        Invoice::factory()->sent()->create([
            'customer_id' => $c->id,
            'due_date' => now()->subDays(7)->toDateString(),
        ]);

        $first = (new SendOverdueRemindersJob)->handle(app(OverdueReminderService::class));
        $second = (new SendOverdueRemindersJob)->handle(app(OverdueReminderService::class));

        $this->assertSame(1, $first);
        $this->assertSame(0, $second);
        Notification::assertSentToTimes($u, InvoiceOverdueReminderNotification::class, 1);
    }

    public function test_schedule_is_registered_daily_with_without_overlapping(): void
    {
        $schedule = app(Schedule::class);
        $events = collect($schedule->events());

        $match = $events->first(fn ($event) => str_contains($event->command ?? $event->description ?? '', 'SendOverdueRemindersJob'));

        $this->assertNotNull($match, 'SendOverdueRemindersJob should be registered in routes/console.php');
        $this->assertSame('0 9 * * *', $match->expression, 'Job should run daily at 09:00');
        $this->assertNotEmpty($match->mutexName(), 'Job should be wired with withoutOverlapping');
    }
}
