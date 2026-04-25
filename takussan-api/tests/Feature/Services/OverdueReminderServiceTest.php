<?php

namespace Tests\Feature\Services;

use App\Models\Customer;
use App\Models\Enums\InvoiceStatus;
use App\Models\Invoice;
use App\Models\NotificationPreference;
use App\Models\Setting;
use App\Models\User;
use App\Notifications\InvoiceOverdueReminderNotification;
use App\Services\Invoice\OverdueReminderService;
use App\Services\Notifications\PreferenceResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

class OverdueReminderServiceTest extends TestCase
{
    use RefreshDatabase;

    protected OverdueReminderService $service;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->service = app(OverdueReminderService::class);
    }

    public function test_sends_reminder_for_invoice_at_first_offset(): void
    {
        [$user, $invoice] = $this->makeInvoice(daysAgo: 3);

        $sent = $this->service->sendForAgency(null);

        $this->assertSame(1, $sent);
        Notification::assertSentTo($user, InvoiceOverdueReminderNotification::class);
        $this->assertSame(1, (int) $invoice->fresh()->reminders_sent_count);
    }

    public function test_skips_paid_invoice(): void
    {
        [$user, $invoice] = $this->makeInvoice(daysAgo: 3, status: InvoiceStatus::Paid);

        $sent = $this->service->sendForAgency(null);

        $this->assertSame(0, $sent);
        Notification::assertNothingSentTo($user);
        $this->assertSame(0, (int) $invoice->fresh()->reminders_sent_count);
    }

    public function test_idempotent_within_same_day(): void
    {
        [$user, $invoice] = $this->makeInvoice(daysAgo: 3);

        $first = $this->service->sendForAgency(null);
        $second = $this->service->sendForAgency(null);

        $this->assertSame(1, $first);
        $this->assertSame(0, $second);
        Notification::assertSentToTimes($user, InvoiceOverdueReminderNotification::class, 1);
    }

    public function test_does_not_send_at_unlisted_offset(): void
    {
        [$user] = $this->makeInvoice(daysAgo: 4);

        $sent = $this->service->sendForAgency(null);

        $this->assertSame(0, $sent);
        Notification::assertNothingSentTo($user);
    }

    public function test_caps_at_total_offset_count(): void
    {
        [$user, $invoice] = $this->makeInvoice(daysAgo: 3);
        // Pretend we already sent the maximum (3 reminders for the default
        // `[3, 7, 15]` offsets).
        $invoice->forceFill(['reminders_sent_count' => 3])->save();

        $sent = $this->service->sendForAgency(null);

        $this->assertSame(0, $sent);
        Notification::assertNothingSentTo($user);
    }

    public function test_records_activity_log_on_each_reminder(): void
    {
        [, $invoice] = $this->makeInvoice(daysAgo: 7);
        // Bump the count so we are still in the second-offset bucket.
        $invoice->forceFill(['reminders_sent_count' => 1])->save();

        $this->service->sendForAgency(null);

        $log = Activity::query()
            ->where('subject_type', Invoice::class)
            ->where('subject_id', $invoice->id)
            ->where('event', 'invoice_reminder_sent')
            ->firstOrFail();
        $this->assertSame(7, (int) $log->properties['offset_days']);
    }

    public function test_respects_user_email_opt_out_but_still_audits(): void
    {
        [$user, $invoice] = $this->makeInvoice(daysAgo: 3);
        // `UserObserver` already inserted default preference rows for every
        // event/channel combination; flip the relevant ones to opt-out
        // via updateOrCreate to avoid violating the (user, event, channel)
        // unique constraint.
        foreach ([PreferenceResolver::CHANNEL_EMAIL, PreferenceResolver::CHANNEL_PUSH] as $ch) {
            NotificationPreference::query()->updateOrCreate(
                [
                    'user_id' => $user->id,
                    'event_type' => 'invoice_reminder_sent',
                    'channel' => $ch,
                ],
                ['enabled' => false],
            );
        }

        $this->service->sendForAgency(null);

        // The email opt-out only filters out the `mail` channel — the
        // notification still fires for the `database` channel (in-app
        // is locked on globally) so the audit trail is preserved.
        Notification::assertSentTo(
            $user,
            InvoiceOverdueReminderNotification::class,
            function (InvoiceOverdueReminderNotification $n, array $channels) {
                $this->assertNotContains('mail', $channels);
                $this->assertContains('database', $channels);

                return true;
            }
        );
        $this->assertSame(1, (int) $invoice->fresh()->reminders_sent_count);
    }

    public function test_promotes_sent_to_overdue_on_first_reminder(): void
    {
        [, $invoice] = $this->makeInvoice(daysAgo: 3, status: InvoiceStatus::Sent);

        $this->service->sendForAgency(null);

        $invoice = $invoice->fresh();
        $this->assertSame(1, (int) $invoice->reminders_sent_count);
        $this->assertSame(InvoiceStatus::Overdue, $invoice->status);
    }

    public function test_uses_setting_for_custom_offsets(): void
    {
        Setting::query()->create([
            'key' => OverdueReminderService::SETTING_KEY,
            'value' => ['value' => [5, 10]],
            'scope' => 'global',
        ]);
        // Day 3 is no longer an offset — should not fire.
        [$user] = $this->makeInvoice(daysAgo: 3);
        $sent = $this->service->sendForAgency(null);
        $this->assertSame(0, $sent);
        Notification::assertNothingSentTo($user);

        // Day 5 should fire.
        [$user2] = $this->makeInvoice(daysAgo: 5);
        $sent = $this->service->sendForAgency(null);
        $this->assertSame(1, $sent);
        Notification::assertSentTo($user2, InvoiceOverdueReminderNotification::class);
    }

    public function test_audits_attempt_when_recipient_has_no_user_account(): void
    {
        $customer = Customer::factory()->create(['user_id' => null]);
        $invoice = Invoice::factory()->sent()->create([
            'customer_id' => $customer->id,
            'due_date' => now()->subDays(3)->toDateString(),
        ]);

        $sent = $this->service->sendForAgency(null);

        // No deliverable target → 0 reminders sent, but the row is
        // stamped and the activity log records the audit-only attempt.
        $this->assertSame(0, $sent);
        $this->assertSame(1, (int) $invoice->fresh()->reminders_sent_count);
        $log = Activity::query()
            ->where('event', 'invoice_reminder_sent')
            ->where('subject_id', $invoice->id)
            ->first();
        $this->assertNotNull($log);
        $this->assertSame('audit_only', $log->properties['channel']);
    }

    /**
     * @return array{0: User, 1: Invoice}
     */
    private function makeInvoice(int $daysAgo, ?InvoiceStatus $status = null): array
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $user->id]);
        $factory = Invoice::factory();
        $factory = match ($status) {
            InvoiceStatus::Paid => $factory->paid(),
            InvoiceStatus::Sent => $factory->sent(),
            default => $factory->sent(),
        };
        $invoice = $factory->create([
            'customer_id' => $customer->id,
            'due_date' => now()->subDays($daysAgo)->toDateString(),
        ]);

        return [$user, $invoice];
    }
}
