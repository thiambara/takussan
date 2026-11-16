<?php

namespace App\Jobs\Concerns;

use Illuminate\Notifications\Notification;

/**
 * TCK-615 (ADR-0050, amendement du 2026-11-16, A) — envoyer une notification canal par canal, pour
 * savoir lesquels sont partis quand l'un d'eux lève.
 *
 * `notify()` envoie tous les canaux de `via()` d'un seul appel : quand la cloche (en dernier) levait
 * après l'e-mail, l'appelant ne pouvait pas distinguer « rien n'est parti » de « l'e-mail est
 * parti », et rendait sa réservation dans les deux cas — l'e-mail repartait à chaque passage. Ici,
 * `$sortant` dit si un canal SORTANT (tout canal autre que la cloche `database` : e-mail, WhatsApp)
 * a abouti avant l'exception, qui est relancée telle quelle.
 *
 * L'ordre de `via()` est respecté : la cloche en dernier (verif-599 m11).
 */
trait EnvoieCanalParCanal
{
    /** La cloche : écrite en base, jamais « partie » vers le destinataire. */
    private const CANAL_INTERNE = 'database';

    /**
     * @param  object  $destinataire  un modèle `Notifiable`
     * @param  bool  $sortant  vrai dès qu'un canal sortant a abouti — lisible après une exception
     */
    private function envoyerCanalParCanal(object $destinataire, Notification $notification, bool &$sortant): void
    {
        $sortant = false;
        foreach ($notification->via($destinataire) as $canal) {
            $destinataire->notifyNow($notification, [$canal]);
            if ($canal !== self::CANAL_INTERNE) {
                $sortant = true;
            }
        }
    }
}
