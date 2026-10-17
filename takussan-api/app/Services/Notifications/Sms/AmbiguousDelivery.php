<?php

namespace App\Services\Notifications\Sms;

use Illuminate\Http\Client\ConnectionException;

/**
 * TCK-766 (P27.02) — un échec d'envoi est AMBIGU quand le fournisseur a pu
 * accepter le message avant que la réponse se perde : délai dépassé, ou
 * réponse 5xx. Le renvoyer par le fournisseur suivant ferait recevoir (et
 * payer) deux SMS. Un échec SÛR — connexion refusée, hôte introuvable,
 * refus 4xx — ne laisse aucun doute : le message n'est pas parti.
 *
 * Le routeur SMS et le canal WhatsApp ne se replient pas sur un échec ambigu,
 * sauf pour un code à usage unique (`is_otp`), qui doit arriver.
 */
final class AmbiguousDelivery
{
    public static function fromThrowable(\Throwable $e): bool
    {
        if (! $e instanceof ConnectionException) {
            return false;
        }
        $message = $e->getMessage();

        // cURL 28 : le délai de connexion ou de lecture est dépassé.
        return str_contains($message, 'cURL error 28') || stripos($message, 'timed out') !== false;
    }

    public static function fromStatus(int $status): bool
    {
        return $status >= 500;
    }
}
