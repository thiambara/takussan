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
        return hash_hmac('sha256', self::network($ip), (string) config('app.key'));
    }

    /**
     * verif-597 m6 — ce qui désigne UN visiteur : l'adresse IPv4 entière, mais le /64 d'une IPv6.
     * Un abonné IPv6 dispose d'un /64 entier, donc d'un nombre pratiquement illimité d'adresses :
     * hacher l'adresse complète lui donnait autant d'empreintes et de clés de limiteur qu'il voulait.
     *
     * verif-597 passe 2 n1 — une IPv4-mappée (`::ffff:0:0/96`, pile d'écoute double) est une IPv4 :
     * elle est déballée AVANT la troncature. Tronquée au /64, elle rendait `::/64` à tous ces
     * visiteurs, donc une seule empreinte et un seul compteur de limiteur pour tous.
     */
    public static function network(string $ip): string
    {
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) === false) {
            return $ip;
        }

        $packed = inet_pton($ip);
        if ($packed === false) {
            return $ip;
        }

        if (str_starts_with($packed, str_repeat("\0", 10)."\xff\xff")) {
            return inet_ntop(substr($packed, 12));
        }

        return inet_ntop(substr($packed, 0, 8).str_repeat("\0", 8)).'/64';
    }
}
