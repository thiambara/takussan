<?php

namespace Tests\Support;

use App\Domain\Notifications\NotificationCode;
use App\Notifications\CodedNotification;
use Closure;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Notification;

/**
 * TCK-590 — les notifications de visite et de demande sont des CODES (TCK-588, ADR-0032) : une
 * seule classe, {@see CodedNotification}, porte tous les événements. Une assertion sur la classe
 * ne dit donc plus QUEL événement est parti ; ces aides filtrent sur le code.
 */
trait EnvoisParCode
{
    /** Le filtre d'une assertion `Notification::assert*` : une notification de l'un de ces codes. */
    protected static function deCode(NotificationCode ...$codes): Closure
    {
        return fn (object $n) => $n instanceof CodedNotification && in_array($n->code, $codes, true);
    }

    /** Le même filtre, restreint à un objet cible (`target.id` : la visite, la demande). */
    protected static function deCodeSur(NotificationCode $code, int $id): Closure
    {
        return fn (object $n) => $n instanceof CodedNotification && $n->code === $code && ($n->target['id'] ?? null) === $id;
    }

    protected static function nombreDEnvois(object $notifiable, NotificationCode $code): int
    {
        return Notification::sent($notifiable, CodedNotification::class, self::deCode($code))->count();
    }

    /**
     * Les envois à un contact sans compte pour un code : `[notification, canaux, destinataire]`.
     *
     * @return Collection<int, array{0: CodedNotification, 1: list<string>, 2: AnonymousNotifiable}>
     */
    protected static function envoisALaDemande(NotificationCode $code): Collection
    {
        $envois = collect();
        Notification::sent(new AnonymousNotifiable, CodedNotification::class, function ($n, array $channels, $notifiable) use ($code, $envois) {
            if ($n->code === $code) {
                $envois->push([$n, $channels, $notifiable]);
            }

            return false;
        });

        return $envois;
    }
}
