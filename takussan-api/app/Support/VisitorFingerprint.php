<?php

namespace App\Support;

use Illuminate\Http\Request;

/**
 * TCK-597 (ADR-0043 §6) — l'empreinte d'un visiteur sans compte : `HMAC-SHA256(IP, clé
 * applicative)`, jamais l'IP en clair.
 *
 * Elle sert à dédoublonner un signalement anonyme et à repérer des avis déposés depuis la même
 * adresse. Le sel est la clé de l'application : sans elle, l'empreinte d'une IP se recalcule par
 * force brute sur l'espace IPv4 entier en quelques minutes.
 */
final class VisitorFingerprint
{
    public static function of(Request $request): ?string
    {
        $ip = $request->ip();

        return $ip === null || $ip === '' ? null : self::ofIp($ip);
    }

    public static function ofIp(string $ip): string
    {
        return hash_hmac('sha256', $ip, (string) config('app.key'));
    }
}
