<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Models\User;
use App\Notifications\Channels\SmsChannel;
use App\Notifications\Channels\WhatsappChannel;
use App\Notifications\CodedNotification;
use App\Notifications\Concerns\SupportsSms;
use App\Notifications\Concerns\SupportsWhatsapp;
use App\Services\Notifications\Whatsapp\WhatsappTemplateRef;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Notification;
use Illuminate\Notifications\SendQueuedNotifications;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Queue;
use Mockery;
use Tests\TestCase;

/**
 * TCK-800 (P11.10) — le journal ne garde que le suffixe d'un numéro, et une notification par code
 * en file attend avant de réessayer, puis journalise son échec final.
 */
class NotificationFailureLoggingTest extends TestCase
{
    use RefreshDatabase;

    private const NUMERO_INVALIDE = '0012-34-56-7890';

    public function test_an_invalid_phone_is_logged_by_its_suffix_on_both_channels(): void
    {
        Log::spy();
        $contact = \Illuminate\Support\Facades\Notification::route('sms', self::NUMERO_INVALIDE)
            ->route('whatsapp', self::NUMERO_INVALIDE);

        $this->assertNull(app(SmsChannel::class)->send($contact, $this->mobile()));
        $this->assertNull(app(WhatsappChannel::class)->send($contact, $this->mobile()));

        foreach (['[sms-channel] invalid phone — rejected before routing', '[whatsapp-channel] invalid phone — rejected'] as $message) {
            Log::shouldHaveReceived('warning')->with($message, Mockery::on(
                fn (array $ctx) => ($ctx['phone_suffix'] ?? null) === '7890' && ! array_key_exists('phone', $ctx),
            ))->once();
        }
    }

    public function test_a_queued_coded_notification_backs_off_and_logs_its_final_failure(): void
    {
        Queue::fake();
        $user = User::factory()->create(['email' => 'awa@example.test']);
        $user->notify(new CodedNotification(NotificationCode::LeasePaymentDueSoon, ['amount' => 1000], null, 42));

        $jobs = Queue::pushed(SendQueuedNotifications::class);
        $mail = $jobs->first(fn (SendQueuedNotifications $job) => $job->channels === ['mail']);
        $this->assertNotNull($mail, 'un job pour le canal mail');
        $this->assertSame([60, 300, 900], $mail->backoff());

        Log::spy();
        $mail->failed(new \RuntimeException('secret +221771234567'));

        Log::shouldHaveReceived('error')->with('[notifications] envoi abandonné', Mockery::on(
            fn (array $ctx) => $ctx['code'] === 'lease_payment.due_soon'
                && $ctx['channel'] === 'mail'
                && $ctx['app_notification_id'] === 42
                && $ctx['exception'] === 'RuntimeException'
                && ! str_contains(json_encode($ctx), 'secret'),
        ))->once();
    }

    private function mobile(): Notification
    {
        return new class extends Notification implements SupportsSms, SupportsWhatsapp
        {
            public function via(object $notifiable): array
            {
                return [SmsChannel::class, WhatsappChannel::class];
            }

            public function toSms(object $notifiable): string
            {
                return 'message';
            }

            public function shouldSendSms(): bool
            {
                return true;
            }

            public function isCriticalSms(): bool
            {
                return true;
            }

            public function toWhatsapp(object $notifiable): string
            {
                return 'message';
            }

            public function whatsappTemplate(object $notifiable): ?WhatsappTemplateRef
            {
                return null;
            }

            public function shouldSendWhatsapp(): bool
            {
                return true;
            }

            public function isCriticalWhatsapp(): bool
            {
                return true;
            }
        };
    }
}
