<?php

namespace Tests\Feature\Services\Sms;

use App\Services\Notifications\Sms\Drivers\LogSmsDriver;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

/**
 * TCK-1025 (P57.05) — le pilote `log` sert en développement et en repli (`SMS_LOG_FALLBACK`) : il
 * ne journalise ni le numéro entier ni le texte, qui porte le code de vérification. Il garde les
 * 4 derniers caractères du numéro, comme `PhoneVerificationService` (`phone_suffix`).
 */
class LogSmsDriverTest extends TestCase
{
    public function test_le_journal_ne_porte_ni_le_numero_ni_le_code(): void
    {
        $lignes = [];
        Log::listen(function ($message) use (&$lignes): void {
            $lignes[] = $message->message.' '.json_encode($message->context);
        });

        $results = app(LogSmsDriver::class)->send('+221 77 123 45 67', 'Votre code Takussan : 482913', [
            'event_type' => 'phone_otp',
            'is_otp' => true,
        ]);

        $this->assertArrayHasKey('+221771234567', $results, 'le résultat reste indexé par le numéro normalisé');
        $journal = implode("\n", $lignes);
        $this->assertStringContainsString('[sms-log-driver] dispatched', $journal);
        $this->assertStringNotContainsString('482913', $journal, 'le code de vérification est au journal');
        $this->assertStringNotContainsString('771234567', $journal, 'le numéro entier est au journal');
        $this->assertStringContainsString('"phone_suffix":"4567"', $journal);
    }
}
