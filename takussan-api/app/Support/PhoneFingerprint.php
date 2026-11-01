<?php

namespace App\Support;

/**
 * TCK-633 lot F (ADR-0061 §3, interface C → F du plan maître) — l'empreinte d'un numéro : HMAC
 * sha256 de sa forme canonique, clé `app.key`. Même construction que
 * `AlertSubscriber::contactHash()` ; le numéro en clair n'est jamais conservé.
 *
 * TCK-2430 (ADR-0084) — `of()` écrit sous la clé courante ; `all()` est ce qu'une lecture cherche, `APP_PREVIOUS_KEYS`
 * compris : le numéro d'un compte anonymisé n'existe plus, son empreinte ne se recalcule pas sous une clé neuve.
 */
final class PhoneFingerprint
{
    public static function of(string $e164): string
    {
        return AppKeyHmac::of('phone|'.CanonicalPhone::fold($e164));
    }

    /** @return list<string> */
    public static function all(string $e164): array
    {
        return AppKeyHmac::all('phone|'.CanonicalPhone::fold($e164));
    }
}
