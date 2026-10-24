<?php

namespace App\Notifications\Channels;

use App\Notifications\CodedNotification;
use App\Services\Model\NotificationService;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Notifications\Notification;

/**
 * P203.01, P203.02 (TCK-2161) — l'agence dont un SMS ou un WhatsApp prend l'intégration
 * (`docs/features.md`, § Canal WhatsApp sortant, « Émetteur ») : celle de l'objet notifié (bail,
 * visite, réservation, fiche client), que le destinataire ait un compte ou non.
 *
 * Dans l'ordre :
 *  1. l'agence que l'appelant a passée à {@see NotificationService::send()},
 *     portée par {@see CodedNotification::$agencyId} ;
 *  2. pour un contact sans compte, la route `agency` que pose `ContactSansCompte` ;
 *  3. sinon l'accesseur `agency_id` du destinataire, comme avant : un appelant qui ne passe pas
 *     encore l'agence garde ce comportement jusqu'à sa migration (décision du porteur).
 *
 * `null` : l'intégration de la plateforme.
 */
final class AgenceDeLEnvoi
{
    public const ROUTE = 'agency';

    public static function resolve(object $notifiable, Notification $notification): ?int
    {
        if ($notification instanceof CodedNotification && $notification->agencyId !== null) {
            return $notification->agencyId;
        }
        if ($notifiable instanceof AnonymousNotifiable) {
            return self::entier($notifiable->routes[self::ROUTE] ?? null);
        }

        return self::entier($notifiable->agency_id ?? null);
    }

    private static function entier(mixed $val): ?int
    {
        return is_int($val) ? $val : (ctype_digit((string) $val) && (string) $val !== '' ? (int) $val : null);
    }
}
