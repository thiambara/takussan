<?php

namespace App\Services\Auth\Voice;

use Illuminate\Contracts\Container\Container;

/**
 * TCK-2940 (ADR-0126 § 2) — le pilote d'appel que `auth.phone_login.voice_driver` désigne (`PHONE_VOICE_CODE_DRIVER`).
 * Vide (le défaut, et `.env.example`, donc la CI) ou inconnu : aucun pilote, la voie n'existe pas.
 */
class VoiceCodeDrivers
{
    public static function make(Container $app): VoiceCodeSender
    {
        return match ((string) config('auth.phone_login.voice_driver')) {
            'lafricamobile' => $app->make(LAfricaMobileVoiceCodeSender::class),
            'log' => $app->make(LogVoiceCodeSender::class),
            default => new NullVoiceCodeSender,
        };
    }
}
