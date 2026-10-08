<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Models\NotificationTemplate;
use App\Models\User;
use App\Notifications\CodedNotification;
use App\Services\Model\NotificationService;
use App\Services\Notifications\NotificationRenderer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * TCK-588, AC11 — l'éditeur de gabarits du super-admin est effectif : un gabarit ACTIF
 * `payment_received` remplace le sujet et le corps de l'e-mail `lease_payment.recorded`.
 * Avant, l'éditeur enregistrait des gabarits qu'aucun envoi ne lisait.
 */
class NotificationTemplateOverrideTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    private function template(bool $active): void
    {
        NotificationTemplate::query()->create([
            'event' => 'payment_received',
            'channel' => 'email',
            'locale' => 'fr',
            'subject' => 'Reçu de {{ payment.amount }} {{ payment.currency }}',
            'body' => 'Bonjour {{ user.first_name }}, nous avons bien reçu {{ payment.amount }} {{ payment.currency }}.',
            'is_active' => $active,
        ]);
    }

    private function mail(): MailMessage
    {
        $tenant = User::factory()->create(['preferred_language' => 'fr', 'first_name' => 'Awa']);
        app(NotificationService::class)->send($tenant, NotificationCode::LeasePaymentRecorded, [
            'amount' => NotificationRenderer::money(150000, 'XOF'),
            'property' => 'Villa Almadies',
        ]);

        $mail = null;
        Notification::assertSentTo($tenant, CodedNotification::class, function (CodedNotification $n, array $channels, User $to, ?string $locale) use (&$mail) {
            $previous = app()->getLocale();
            app()->setLocale((string) $locale);
            try {
                $mail = $n->toMail($to);
            } finally {
                app()->setLocale($previous);
            }

            return true;
        });

        return $mail;
    }

    public function test_un_gabarit_actif_remplace_le_sujet_et_le_corps(): void
    {
        $this->template(active: true);

        $mail = $this->mail();

        $this->assertStringStartsWith('Reçu de 150', $mail->subject);
        $this->assertStringEndsWith('XOF', $mail->subject);
        $this->assertStringStartsWith('Bonjour Awa, nous avons bien reçu 150', $mail->introLines[0]);
        $this->assertNotSame(__('notifications.codes.lease_payment.recorded.title', [], 'fr'), $mail->subject);
    }

    public function test_un_gabarit_inactif_laisse_la_cle_de_lang(): void
    {
        $this->template(active: false);

        $mail = $this->mail();

        $this->assertSame(__('notifications.codes.lease_payment.recorded.title', [], 'fr'), $mail->subject);
        $this->assertStringContainsString('Villa Almadies', $mail->introLines[0]);
    }
}
