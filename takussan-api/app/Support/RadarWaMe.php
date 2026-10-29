<?php

namespace App\Support;

use InvalidArgumentException;

/**
 * ADR-0077 §5 — LE lien `wa.me` d'un message du Radar : le numéro de l'ANNONCEUR seul, et le texte exact. Le message
 * d'accord (TCK-2388) et le message de publication (TCK-2389) le construisent ici, d'une seule façon.
 */
final class RadarWaMe
{
    public static function url(string $e164, string $message): string
    {
        $digits = ltrim($e164, '+');
        if (preg_match('/^\d{6,15}$/', $digits) !== 1) {
            throw new InvalidArgumentException('radar.outreach.phone_invalid');
        }

        return 'https://wa.me/'.$digits.'?text='.rawurlencode($message);
    }
}
