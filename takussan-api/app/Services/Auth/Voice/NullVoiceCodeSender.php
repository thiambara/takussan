<?php

namespace App\Services\Auth\Voice;

/** TCK-2940 (ADR-0126 § 2) — aucun pilote configuré : la voie n'existe pas. */
class NullVoiceCodeSender implements VoiceCodeSender
{
    public function available(): bool
    {
        return false;
    }

    public function call(string $phone, string $code, ?string $locale): bool
    {
        return false;
    }
}
