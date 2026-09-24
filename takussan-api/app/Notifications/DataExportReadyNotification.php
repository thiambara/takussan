<?php

namespace App\Notifications;

use App\Models\DataExport;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * L'archive de portabilité (TCK-225) est prête.
 *
 * TCK-575 — deux défauts corrigés ici, tous deux mesurés :
 *
 * - **La langue.** Le texte était écrit en français en dur : un utilisateur `en` ou `wo` le
 *   recevait en français. Il passe désormais par `lang/<locale>/notifications.php`, et la langue
 *   est celle du DESTINATAIRE — `User` implémente `HasLocalePreference` (`preferred_language`),
 *   que la pile de notification applique d'elle-même avant `toMail()`.
 *
 * - **Le lien.** Il visait `url('/api/data-exports/{id}/download')`, c'est-à-dire l'hôte de
 *   l'API, derrière `auth:sanctum` : un navigateur qui ouvre le lien d'un e-mail n'y porte aucun
 *   jeton Bearer, et le clic rendait **401** (mesuré). Il mène désormais à la page « Mes données »
 *   du front, protégée par la session, où l'export prêt porte son bouton de téléchargement ; sans
 *   session, le front renvoie à la connexion puis ramène à la page.
 *
 * La durée annoncée est celle de l'export lui-même (`expires_at`, posé à `ready_at + 7 j` par
 * `DataExportBuilder`, et refusée au-delà par `DataExportDownloadController` → 410) : elle ne
 * peut pas dire autre chose que ce que le serveur appliquera.
 */
class DataExportReadyNotification extends Notification
{
    use Queueable;

    /** Chemin, dans le front, de la page qui liste les exports de l'utilisateur. */
    public const PAGE_MES_DONNEES = '/app/account/privacy';

    public function __construct(private readonly DataExport $export) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $frontend = rtrim((string) (config('app.frontend_url') ?: config('app.url')), '/');

        $mail = (new MailMessage)
            ->subject(__('notifications.data_export_ready.subject'))
            ->greeting(__('notifications.data_export_ready.greeting'))
            ->line(__('notifications.data_export_ready.intro'))
            ->action(__('notifications.data_export_ready.action'), $frontend.self::PAGE_MES_DONNEES);

        $jours = $this->joursRestants();
        if ($jours !== null) {
            $mail->line(trans_choice('notifications.data_export_ready.expires', $jours, ['count' => $jours]));
        }

        return $mail->salutation(__('notifications.salutation'));
    }

    /**
     * Les jours pendant lesquels l'archive reste téléchargeable, lus sur l'export — jamais un
     * chiffre écrit dans le texte. Arrondi à l'entier le plus proche (l'e-mail part quelques
     * secondes après `ready_at`), au moins 1 ; `null` si l'export ne porte aucune échéance.
     */
    private function joursRestants(): ?int
    {
        if ($this->export->expires_at === null) {
            return null;
        }

        $heures = now()->diffInHours($this->export->expires_at, false);

        return max(1, (int) round($heures / 24));
    }
}
