<?php

namespace App\Services\Auth\Voice;

use Illuminate\Support\Facades\Log;

/**
 * TCK-2940 (ADR-0126 § 2) — le pilote du poste de développement : il note qu'un appel aurait eu lieu, JAMAIS le code
 * (TCK-589 a retiré tout code du journal ; en local, le code se lit par l'aperçu d'ADR-0060). Disponible seulement
 * sous `APP_ENV` `local` ou `testing`, comme `SMS_LOG_FALLBACK` : recopié en préproduction, il éteint la voie.
 */
class LogVoiceCodeSender implements VoiceCodeSender
{
    public const ENVIRONMENTS = ['local', 'testing'];

    public function available(): bool
    {
        return app()->environment(self::ENVIRONMENTS);
    }

    public function call(string $phone, string $code, ?string $locale): bool
    {
        if (! $this->available()) {
            return false;
        }

        Log::info('[voice-otp] appel simulé (pilote log)', ['phone_suffix' => substr($phone, -4)]);

        return true;
    }
}
