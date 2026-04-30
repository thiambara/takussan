<?php

namespace Tests\Feature\Notifications;

use App\Models\Customer;
use App\Models\Enums\Currency;
use App\Models\Invoice;
use App\Models\NotificationPreference;
use App\Models\User;
use App\Notifications\InvoiceOverdueReminderNotification;
use App\Services\Notifications\PreferenceResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InvoiceOverdueReminderNotificationTest extends TestCase
{
    use RefreshDatabase;

    public function test_default_via_includes_all_three_channels(): void
    {
        $user = User::factory()->create();
        $invoice = $this->makeInvoice($user);
        $notification = new InvoiceOverdueReminderNotification($invoice, 3);

        $this->assertSame(['database', 'mail', 'broadcast'], $notification->via($user));
    }

    public function test_email_optout_drops_mail_channel(): void
    {
        $user = User::factory()->create();
        // `UserObserver` already provisioned this row — flip via
        // updateOrCreate to avoid colliding with the unique key.
        NotificationPreference::query()->updateOrCreate(
            [
                'user_id' => $user->id,
                'event_type' => 'invoice_reminder_sent',
                'channel' => PreferenceResolver::CHANNEL_EMAIL,
            ],
            ['enabled' => false],
        );

        $invoice = $this->makeInvoice($user);
        $notification = new InvoiceOverdueReminderNotification($invoice, 7);

        $channels = $notification->via($user);
        $this->assertNotContains('mail', $channels);
        $this->assertContains('database', $channels);
    }

    public function test_to_mail_renders_subject_amount_and_due_date(): void
    {
        // Pin the locale: another notification test in the same suite
        // toggles `app()->setLocale('fr')` and the CI runner sometimes
        // schedules this test after that one without going through the
        // sibling's `finally` (e.g. when running in random order).
        app()->setLocale('en');

        $user = User::factory()->create();
        $invoice = $this->makeInvoice($user, ['reference_number' => 'INV-2026-0042']);

        $mail = (new InvoiceOverdueReminderNotification($invoice, 15))->toMail($user);
        $rendered = (string) $mail->render();

        $this->assertSame('Reminder — invoice INV-2026-0042 overdue', $mail->subject);
        $this->assertStringContainsString('15', $rendered);
        $this->assertStringContainsString('XOF', $rendered);
    }

    public function test_to_array_payload_shape_for_inapp(): void
    {
        $user = User::factory()->create();
        $invoice = $this->makeInvoice($user, ['reference_number' => 'INV-X']);

        $payload = (new InvoiceOverdueReminderNotification($invoice, 3))->toArray($user);

        $this->assertSame($invoice->id, $payload['invoice_id']);
        $this->assertSame('INV-X', $payload['reference_number']);
        $this->assertSame(3, $payload['offset_days']);
        $this->assertSame('XOF', $payload['currency']);
        $this->assertSame('invoice.reminder_sent', (new InvoiceOverdueReminderNotification($invoice, 3))->broadcastType());
    }

    public function test_locale_renders_french_subject_when_user_locale_is_fr(): void
    {
        // The factory default is `preferred_language = 'fr'`, which
        // `User::preferredLocale()` returns to the notification pipeline.
        $user = User::factory()->create();
        $invoice = $this->makeInvoice($user, ['reference_number' => 'INV-FR']);
        $this->assertSame('fr', $user->preferredLocale());

        // Manually switch locale (the queued path would do this via
        // HasLocalePreference) so we can render directly.
        app()->setLocale('fr');
        try {
            $mail = (new InvoiceOverdueReminderNotification($invoice, 3))->toMail($user);
            $this->assertSame('Rappel — facture INV-FR en retard', $mail->subject);
        } finally {
            app()->setLocale('en');
        }
    }

    /**
     * @param  array<string,mixed>  $overrides
     */
    private function makeInvoice(User $user, array $overrides = []): Invoice
    {
        $customer = Customer::factory()->create(['user_id' => $user->id]);

        return Invoice::factory()->sent()->create(array_merge([
            'customer_id' => $customer->id,
            'due_date' => now()->subDays(3)->toDateString(),
            'total_amount' => 125_000,
            'currency' => Currency::XOF,
        ], $overrides));
    }
}
