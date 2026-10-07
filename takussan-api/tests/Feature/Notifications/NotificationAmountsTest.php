<?php

namespace Tests\Feature\Notifications;

use App\Models\Customer;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\User;
use App\Notifications\LeaseDepositRefundNotification;
use App\Notifications\LeasePaymentLateFeeNotification;
use App\Notifications\LeaseRentReviewedNotification;
use App\Services\Formatting\CurrencyFormatter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-588, AC17 — un montant d'e-mail est formaté dans la langue du destinataire, par
 * `CurrencyFormatter` : plus de `number_format(…, 2)` (« 1,500.00 XOF ») ni d'espace de milliers
 * français dans une phrase anglaise.
 */
class NotificationAmountsTest extends TestCase
{
    use RefreshDatabase;

    private function text(Notification $notification, string $locale): string
    {
        $previous = app()->getLocale();
        app()->setLocale($locale);
        try {
            /** @var MailMessage $mail */
            $mail = $notification->toMail(User::factory()->make());

            return implode("\n", [$mail->subject, ...$mail->introLines, ...$mail->outroLines]);
        } finally {
            app()->setLocale($previous);
        }
    }

    private function format(float $amount, string $locale): string
    {
        return app(CurrencyFormatter::class)->format($amount, Currency::XOF, $locale);
    }

    private function lease(): Lease
    {
        return Lease::factory()->create([
            'tenant_id' => Customer::factory()->create()->id,
            'currency' => Currency::XOF,
        ]);
    }

    /** @return array<string, array{string}> */
    public static function langues(): array
    {
        return ['fr' => ['fr'], 'en' => ['en']];
    }

    #[DataProvider('langues')]
    public function test_la_penalite_de_retard_est_formatee_dans_la_langue_du_destinataire(string $locale): void
    {
        $payment = LeasePayment::factory()->create([
            'lease_id' => $this->lease()->id,
            'amount' => 30000,
            'currency' => Currency::XOF,
            'status' => PaymentStatus::Late,
        ]);

        $text = $this->text(new LeasePaymentLateFeeNotification($payment, 1500.0, 5.0, 30000.0), $locale);

        $this->assertStringContainsString($this->format(1500, $locale), $text);
        $this->assertStringNotContainsString('1,500.00', $text);
        $this->assertStringNotContainsString('1500.00', $text);
    }

    public function test_la_restitution_de_caution_en_anglais_n_a_pas_d_espace_de_milliers(): void
    {
        $text = $this->text(new LeaseDepositRefundNotification($this->lease(), 150000.0, 50000.0, 'Peinture'), 'en');

        $this->assertStringContainsString($this->format(150000, 'en'), $text);
        $this->assertStringContainsString($this->format(50000, 'en'), $text);
        $this->assertDoesNotMatchRegularExpression('/\d[\x{00A0}\x{202F} ]\d{3}/u', $text);
        $this->assertStringNotContainsString('150,000.00', $text);
    }

    public function test_la_revision_de_loyer_en_anglais_n_a_pas_d_espace_de_milliers(): void
    {
        $text = $this->text(new LeaseRentReviewedNotification($this->lease(), 150000.0, 165000.0, 'Indexation', '2026-11-01'), 'en');

        $this->assertStringContainsString($this->format(150000, 'en'), $text);
        $this->assertStringContainsString($this->format(165000, 'en'), $text);
        $this->assertDoesNotMatchRegularExpression('/\d[\x{00A0}\x{202F} ]\d{3}/u', $text);
    }
}
