<?php

namespace App\Support;

/**
 * TCK-633 lot F (ADR-0061 §3, interface C → F du plan maître) — l'empreinte d'un numéro : HMAC
 * sha256 de sa forme canonique, clé `app.key`. Même construction que
 * `AlertSubscriber::contactHash()` ; le numéro en clair n'est jamais conservé.
 */
final class PhoneFingerprint
{
    public static function of(string $e164): string
    {
        return hash_hmac('sha256', 'phone|'.CanonicalPhone::fold($e164), (string) config('app.key'));
    }
}
