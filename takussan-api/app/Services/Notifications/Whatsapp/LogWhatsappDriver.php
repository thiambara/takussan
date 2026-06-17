<?php

namespace App\Services\Notifications\Whatsapp;

use App\Services\Notifications\Sms\Drivers\LogSmsDriver;
use App\Services\Notifications\Sms\PhoneNumber;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * TCK-282 — Local / testing driver. Logs the payload and returns a
 * synthetic `sent` result so the channel pipeline can be exercised
 * without hitting Meta. Mirror of {@see LogSmsDriver}.
 */
class LogWhatsappDriver implements WhatsappDriverInterface
{
    public function id(): string
    {
        return 'whatsapp_cloud';
    }

    public function send(array|string $to, WhatsappMessage $message, array $context = []): array
    {
        $recipients = is_array($to) ? $to : [$to];
        $results = [];
        foreach ($recipients as $recipient) {
            $normalized = PhoneNumber::normalize($recipient);
            $providerMessageId = 'wamid.log_'.Str::uuid()->toString();
            Log::info('[whatsapp-log-driver] dispatched', [
                'to' => $normalized,
                'type' => $message->type,
                'text' => $message->text,
                'template' => $message->template?->name,
                'context' => $context,
                'provider_message_id' => $providerMessageId,
            ]);
            $results[$normalized] = WhatsappResult::sent($normalized, $this->id(), $providerMessageId);
        }

        return $results;
    }
}
