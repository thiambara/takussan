<?php

namespace App\Listeners\Notifications;

use App\Models\User;
use Illuminate\Notifications\Events\NotificationSending;

/**
 * TCK-1752 (P166.02) — rien ne part vers un compte effacé.
 *
 * Le destinataire d'un avis en file est sérialisé par son identifiant et relu au worker sans
 * portée : un compte supprimé en douceur et anonymisé entre la mise en file et le worker était
 * relu avec `deleted-<id>@takussan.local`, et le courriel partait. Rendre `false` ici arrête
 * chaque canal (`NotificationSender::shouldSendNotification`), sans échec du job.
 *
 * Le seul avis voulu vers un compte effacé, `AccountDeletionExecutedNotification`, part en
 * synchrone AVANT l'anonymisation (`AccountDeletionService::anonymize`) : le compte n'est pas
 * encore `trashed()`.
 *
 * Découvert par Laravel (`app/Listeners`) : ne pas l'inscrire en plus par `listen()`.
 */
class RienPourUnCompteEfface
{
    public function handle(NotificationSending $event): ?bool
    {
        if ($event->notifiable instanceof User && $event->notifiable->trashed()) {
            return false;
        }

        return null;
    }
}
