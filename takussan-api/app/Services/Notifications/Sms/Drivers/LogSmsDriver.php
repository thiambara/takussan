<?php

namespace App\Services\Notifications\Sms\Drivers;

use App\Services\Notifications\Sms\PhoneNumber;
use App\Services\Notifications\Sms\SmsDriverInterface;
use App\Services\Notifications\Sms\SmsResult;
use App\Services\Notifications\Sms\SmsSegmentCalculator;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * TCK-102 — Local / testing driver. Logs the dispatch (masked number,
 * message length) and returns a
 * synthetic `sent` SmsResult so the rest of the pipeline can be
 * exercised without hitting any provider.
 */
class LogSmsDriver implements SmsDriverInterface
{
    public function id(): string
    {
        return 'log';
    }

    public function send(array|string $to, string $message, array $context = []): array
    {
        $recipients = is_array($to) ? $to : [$to];
        $segments = SmsSegmentCalculator::segmentsCount($message);
        $results = [];
        foreach ($recipients as $recipient) {
            $normalized = PhoneNumber::normalize($recipient);
            $providerMessageId = 'log_'.Str::uuid()->toString();
            // TCK-1025 (P57.05) — ni le numéro entier ni le texte, qui porte le code de
            // vérification : ce pilote sert aussi de repli (`SMS_LOG_FALLBACK`) hors du poste.
            Log::info('[sms-log-driver] dispatched', [
                'phone_suffix' => substr($normalized, -4),
                'message_length' => mb_strlen($message),
                'segments' => $segments,
                'context' => $context,
                'provider_message_id' => $providerMessageId,
            ]);
            $results[$normalized] = SmsResult::sent(
                to: $normalized,
                provider: $this->id(),
                providerMessageId: $providerMessageId,
                segmentsCount: $segments,
                costEstimate: 0.0,
            );
        }

        return $results;
    }
}
