<?php

namespace App\Listeners\Notifications;

use App\Models\User;
use App\Notifications\AccountDeletionExecutedNotification;
use App\Notifications\AccountDeletionReminderNotification;
use App\Notifications\AccountDeletionRequestedNotification;
use App\Notifications\AccountDeletionStepUpCodeNotification;
use App\Notifications\CodedNotification;
use App\Notifications\DataExportReadyNotification;
use App\Notifications\ResetPasswordNotification;
use App\Services\Property\PrimaryPropertyContact;
use Illuminate\Notifications\Events\NotificationSending;

/**
 * P239.01 (TCK-2363, ADR-0032 amendé le 2026-10-25) — un compte non joignable (`blocked`,
 * `deleted`, {@see PrimaryPropertyContact::joignable()}) ne reçoit que les avis de son compte, par
 * TOUS les chemins d'envoi. La règle de TCK-1350 ne vivait que dans `NotificationService::send()`
 * et `CodedNotification::via()` : un `Notification::send()` ou un `->notify()` direct (avis du
 * bail, rappels, alertes de seuil…) partait encore vers un locataire ou un administrateur bloqué.
 * Rendre `false` ici arrête chaque canal (`NotificationSender::shouldSendNotification`).
 *
 * La liste fermée : les codes de `NotificationCode::reachesUnreachableAccount()` (blocage,
 * réactivation, fin d'impersonation) et les classes de {@see self::AVIS_DU_COMPTE}. Toute autre
 * notification est coupée ; `RienPourUnCompteNonJoignableTest` exige que chaque notification de
 * `app/` soit classée.
 *
 * Posé à côté de {@see RienPourUnCompteEfface}, qui coupe TOUT vers un compte `trashed()`, avis du
 * compte compris : le premier `false` arrête l'envoi, l'ordre des deux n'importe pas.
 *
 * Découvert par Laravel (`app/Listeners`) : ne pas l'inscrire en plus par `listen()`.
 */
class RienPourUnCompteNonJoignable
{
    /**
     * Les avis de compte qui atteignent encore un compte non joignable : effacement (demande,
     * rappel, code de confirmation, exécution), réinitialisation du mot de passe, export prêt
     * (droit d'accès aux données).
     */
    public const AVIS_DU_COMPTE = [
        AccountDeletionExecutedNotification::class,
        AccountDeletionReminderNotification::class,
        AccountDeletionRequestedNotification::class,
        AccountDeletionStepUpCodeNotification::class,
        DataExportReadyNotification::class,
        ResetPasswordNotification::class,
    ];

    public function handle(NotificationSending $event): ?bool
    {
        if (! $event->notifiable instanceof User || PrimaryPropertyContact::joignable($event->notifiable)) {
            return null;
        }

        $notification = $event->notification;
        $permise = $notification instanceof CodedNotification
            ? $notification->code->reachesUnreachableAccount()
            : in_array($notification::class, self::AVIS_DU_COMPTE, true);

        return $permise ? null : false;
    }
}
