<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Models\Customer;
use App\Models\Enums\Currency;
use App\Models\Lease;
use App\Models\NotificationTemplate;
use App\Models\ThresholdAlert;
use App\Models\User;
use App\Notifications\LeaseDepositRefundNotification;
use App\Notifications\ThresholdAlertTriggered;
use App\Services\Notifications\NotificationRenderer;
use App\Services\Notifications\Sms\SmsSegmentCalculator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Messages\MailMessage;
use Tests\TestCase;

/**
 * TCK-2794 (décision n° 11 (a) du porteur, suite de TCK-2714) — un montant que l'API rend en texte
 * groupe ses milliers par l'insécable U+00A0, comme l'écran. Les épingles portent sur le TEXTE
 * RENDU, au caractère près : aucune ne normalise les espaces, et une sortie en U+202F (celle
 * d'ICU en `fr`) les fait échouer.
 */
class MontantsGroupesParLInsecableTest extends TestCase
{
    use RefreshDatabase;

    private const MONTANT = "150\u{00A0}000\u{00A0}F CFA";

    private function renderer(): NotificationRenderer
    {
        return app(NotificationRenderer::class);
    }

    /** @return array<string, mixed> */
    private function paiement(): array
    {
        return ['amount' => NotificationRenderer::money(150000, 'XOF'), 'property' => 'Villa Almadies'];
    }

    /** AC2 — une des sept notifications, rendue en `fr` : son courriel porte le montant en U+00A0. */
    public function test_ac2_la_restitution_de_caution_en_francais_groupe_par_l_insecable(): void
    {
        $lease = Lease::factory()->create(['tenant_id' => Customer::factory()->create()->id, 'currency' => Currency::XOF]);

        $previous = app()->getLocale();
        app()->setLocale('fr');
        try {
            /** @var MailMessage $mail */
            $mail = (new LeaseDepositRefundNotification($lease, 150000.0, 50000.0, 'Peinture'))->toMail(User::factory()->make());
        } finally {
            app()->setLocale($previous);
        }
        $text = implode("\n", [$mail->subject, ...$mail->introLines, ...$mail->outroLines]);

        $this->assertStringContainsString(self::MONTANT, $text);
        $this->assertStringContainsString("50\u{00A0}000\u{00A0}F CFA", $text);
        $this->assertStringNotContainsString("\u{202F}", $text);
    }

    /** AC2 — le message codé (tout montant rendu par le renderer) : `fr` et `wo` en U+00A0, `en` inchangé. */
    public function test_ac2_le_message_code_groupe_par_l_insecable_dans_la_langue_du_destinataire(): void
    {
        foreach (['fr', 'wo'] as $locale) {
            $body = $this->renderer()->render(NotificationCode::LeasePaymentRecorded, $this->paiement(), $locale);
            $this->assertStringContainsString(self::MONTANT, $body, $locale);
            $this->assertStringNotContainsString("\u{202F}", $body, $locale);
        }

        $this->assertStringContainsString("150,000\u{00A0}F CFA", $this->renderer()->render(NotificationCode::LeasePaymentRecorded, $this->paiement(), 'en'));
    }

    /** Le gabarit historique `payment_received` (montant sans symbole, `NotificationRenderer::number()`). */
    public function test_le_gabarit_payment_received_groupe_par_l_insecable(): void
    {
        NotificationTemplate::query()->create([
            'event' => 'payment_received',
            'channel' => 'email',
            'locale' => 'fr',
            'subject' => 'Reçu de {{ payment.amount }} {{ payment.currency }}',
            'body' => 'Nous avons bien reçu {{ payment.amount }} {{ payment.currency }}.',
            'is_active' => true,
        ]);

        $body = $this->renderer()->render(NotificationCode::LeasePaymentRecorded, $this->paiement(), 'fr', null, 'mail_body', 'Awa');

        $this->assertStringContainsString("150\u{00A0}000 XOF", $body);
        $this->assertStringNotContainsString("\u{202F}", $body);
    }

    /**
     * AC5 — le SMS garde son encodage et sa longueur comptée : U+00A0 et U+202F sont tous deux hors
     * GSM-7 (et l'U+00A0 d'avant « F CFA » y était déjà) — même encodage, même nombre de caractères,
     * même nombre de segments qu'avec l'ancien groupe.
     */
    public function test_ac5_le_sms_garde_son_encodage_et_sa_longueur(): void
    {
        $sms = $this->renderer()->render(NotificationCode::LeasePaymentRecorded, $this->paiement(), 'fr', null, 'sms');
        $this->assertStringContainsString(self::MONTANT, $sms);

        $avant = str_replace("150\u{00A0}000", "150\u{202F}000", $sms);
        $this->assertNotSame($avant, $sms);

        $this->assertTrue(SmsSegmentCalculator::isUnicode($sms));
        $this->assertSame(SmsSegmentCalculator::isUnicode($avant), SmsSegmentCalculator::isUnicode($sms));
        $this->assertSame(mb_strlen($avant), mb_strlen($sms));
        $this->assertSame(SmsSegmentCalculator::segmentsCount($avant), SmsSegmentCalculator::segmentsCount($sms));
    }

    /** Le seuil d'une alerte (`Number::format` d'ICU avant) : groupé comme tout nombre rendu. */
    public function test_l_alerte_de_seuil_groupe_par_l_insecable(): void
    {
        $alert = (new ThresholdAlert)->forceFill([
            'metric' => 'revenue', 'operator' => '>', 'threshold' => 1000000, 'severity' => 'warning', 'cooldown_hours' => 24,
        ]);

        $previous = app()->getLocale();
        app()->setLocale('fr');
        try {
            $mail = (new ThresholdAlertTriggered($alert, 1234567.5))->toMail(User::factory()->make());
        } finally {
            app()->setLocale($previous);
        }
        $text = implode("\n", $mail->introLines);

        $this->assertStringContainsString("1\u{00A0}234\u{00A0}567,50", $text);
        $this->assertStringContainsString("1\u{00A0}000\u{00A0}000,00", $text);
        $this->assertStringNotContainsString("\u{202F}", $text);
    }
}
