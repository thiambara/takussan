<?php

namespace App\Services\Model;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Events\NewNotification;
use App\Models\AppNotification;
use App\Models\Enums\NotificationChannel;
use App\Models\User;
use App\Notifications\Channels\AgenceDeLEnvoi;
use App\Notifications\Channels\SmsChannel;
use App\Notifications\CodedNotification;
use App\Services\Notifications\ContactSansCompte;
use App\Services\Notifications\NotificationRenderer;
use App\Services\Notifications\Sms\DeferredSmsGuard;
use App\Services\Notifications\Sms\SmsOutcome;
use App\Services\Property\PrimaryPropertyContact;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use LogicException;

class NotificationService
{
    public function __construct(
        private readonly NotificationRenderer $renderer,
    ) {}

    /**
     * TCK-588 (ADR-0032) — émettre une notification par CODE.
     *
     * Pour un `User` : la ligne `app_notifications` est écrite en synchrone (code, paramètres
     * bruts, cible, et `title`/`body` rendus dans SA langue, qui servent de repli), puis
     * {@see CodedNotification} part en file pour l'e-mail, le broadcast et un canal mobile,
     * chacun selon l'interrupteur du code.
     *
     * Pour un {@see ContactSansCompte} : aucune ligne (`user_id` vise `users`), un envoi routé
     * sur son numéro, dans sa langue — WhatsApp s'il y a consenti, sinon SMS. Un code non
     * transactionnel est refusé : c'est une faute de programmation, pas un cas à taire.
     *
     * TCK-590 — `$mobileBorne` : `null`, le code suit ses propres règles et la limite générique
     * des canaux mobiles ; `true`, l'appelant a DÉJÀ borné le SMS au point d'envoi (`VisitNotifier`)
     * et les canaux ne le recomptent pas ; `false`, aucun canal mobile (SMS retenu, ou pas prévu).
     *
     * TCK-602 (VERIF-602 M2, ADR-0051 §1) — un paramètre PORTEUR
     * ({@see NotificationCode::bearerParams()}) n'atteint jamais un compte : il est retiré ici, avant
     * la ligne `app_notifications` (cloche) et l'envoi. Le locataire avec compte va à la page
     * authentifiée de son échéance ; seul un contact sans compte reçoit le lien, par un canal
     * sortant, dans une notification mise en file chiffrée.
     *
     * P05.08 (TCK-941) — `$data` : écrit sur la ligne `app_notifications` à sa création, donc
     * AVANT l'envoi. Une clé d'idempotence s'y pose : écrite après, un envoi qui échoue en route la
     * laissait absente, et le rejeu renvoyait. Ignoré pour un contact sans compte (aucune ligne).
     *
     * TCK-1346 (P132.04) — `$deferredSmsGuard` : pour un contact sans compte, ce que son SMS relit
     * s'il est reporté par les heures calmes ({@see DeferredSmsGuard}). Un compte n'a pas de lien porteur.
     *
     * P207.01 (TCK-2157) — `$smsRefusalSubject` : pour un contact sans compte, l'objet auquel le
     * canal SMS rattache l'activité `ops_critical_job_failed` quand tous les fournisseurs refusent
     * le message ({@see SmsChannel}). L'appelant qui marque l'envoi
     * « au plus une fois » sait ainsi lequel est perdu. Ignoré pour un compte.
     *
     * P203.01, P203.02 (TCK-2161) — `$agencyId` : l'agence de l'objet notifié (bail, visite,
     * réservation), dont les SMS et les WhatsApp prennent l'intégration. Pour un contact sans
     * compte, à défaut, celle que porte {@see ContactSansCompte}. Sans elle, l'accesseur du
     * destinataire, comme avant ({@see AgenceDeLEnvoi}).
     *
     * @param  array<string, mixed>  $params  paramètres BRUTS (cf. {@see NotificationCode::params()})
     * @param  array<string, mixed>|null  $data
     */
    public function send(
        User|ContactSansCompte $to,
        NotificationCode $code,
        array $params,
        ?NotificationTarget $target = null,
        ?bool $mobileBorne = null,
        ?array $data = null,
        ?array $deferredSmsGuard = null,
        ?Model $smsRefusalSubject = null,
        ?int $agencyId = null,
    ): ?AppNotification {
        if ($to instanceof ContactSansCompte) {
            $this->sendToContact($to, $code, $params, $target, $mobileBorne, $deferredSmsGuard, smsRefusalSubject: $smsRefusalSubject, agencyId: $agencyId);

            return null;
        }

        // TCK-1350 (P88.04) — un compte bloqué ou supprimé ne reçoit que les codes de son compte.
        if (! PrimaryPropertyContact::joignable($to) && ! $code->reachesUnreachableAccount()) {
            Log::info('[notifications] compte non joignable — rien n\'est envoyé', ['code' => $code->value, 'user_id' => $to->id]);

            return null;
        }

        $params = array_diff_key($params, array_flip($code->bearerParams()));
        $locale = $to->preferredLocale() ?? (string) config('app.locale');
        $timezone = $to->timezone ?: NotificationRenderer::DEFAULT_TIMEZONE;

        $notification = AppNotification::create([
            'user_id' => $to->id,
            'type' => $code->type(),
            'code' => $code->value,
            'params' => $params,
            'target' => $target?->toArray(),
            'data' => $data,
            'delivery_channel' => NotificationChannel::App,
            'title' => $this->renderer->render($code, $params, $locale, $timezone, 'title', $to->first_name),
            'body' => $this->renderer->render($code, $params, $locale, $timezone, 'body', $to->first_name),
            'sent_at' => now(),
        ]);

        $to->notify(
            (new CodedNotification($code, $params, $target?->toArray(), $notification->id, $mobileBorne, agencyId: $agencyId))->locale($locale)
        );

        if (class_exists(NewNotification::class)) {
            try {
                event(new NewNotification($notification));
            } catch (\Throwable) {
                // Broadcasting not configured — silently skip.
            }
        }

        return $notification;
    }

    /**
     * P179.01 (TCK-2155) — comme {@see send()} vers un contact sans compte, mais HORS FILE, et le
     * sort du SMS rendu à l'appelant : le rappel d'une invitation ne se tient pour posé que si un
     * fournisseur a pu recevoir le message. Mis en file, l'envoi réussissait toujours (le routeur
     * change tout refus en `SmsResult::failed`, sans lever), et l'appelant ne voyait rien.
     *
     * @param  array<string, mixed>  $params  paramètres BRUTS
     */
    public function sendToContactNow(
        ContactSansCompte $to,
        NotificationCode $code,
        array $params,
        ?NotificationTarget $target = null,
        ?array $deferredSmsGuard = null,
    ): SmsOutcome {
        $outcome = new SmsOutcome;
        $this->sendToContact($to, $code, $params, $target, null, $deferredSmsGuard, $outcome);

        return $outcome;
    }

    private function sendToContact(ContactSansCompte $to, NotificationCode $code, array $params, ?NotificationTarget $target, ?bool $mobileBorne = null, ?array $deferredSmsGuard = null, ?SmsOutcome $outcome = null, ?Model $smsRefusalSubject = null, ?int $agencyId = null): void
    {
        if (! $code->reachesContacts()) {
            throw new LogicException(sprintf(
                '%s n\'est pas transactionnel : il ne peut pas viser un contact sans compte (ADR-0032 §3).',
                $code->value,
            ));
        }
        // TCK-590 — un contact peut n'avoir laissé qu'un e-mail (accusé d'une demande, visiteur
        // sans téléphone) : il le reçoit. Ni numéro ni e-mail : rien à envoyer.
        if (! $to->hasPhone() && ! $to->hasEmail()) {
            Log::info('[notifications] contact sans compte sans numéro ni e-mail valides — rien n\'est envoyé', [
                'code' => $code->value,
                'customer_id' => $to->customerId,
            ]);

            return;
        }

        $routes = array_filter([
            'mail' => $to->email,
            'sms' => $to->phone,
            'whatsapp' => $to->phone,
            // P203.02 (TCK-2161) — l'agence de la fiche, de la visite ou de l'objet, lue par les
            // canaux mobiles : seulement quand un numéro peut en faire partir un.
            AgenceDeLEnvoi::ROUTE => $to->hasPhone() ? ($agencyId ?? $to->agencyId) : null,
        ]);
        $refusalSubject = $smsRefusalSubject !== null
            ? ['type' => $smsRefusalSubject::class, 'id' => $smsRefusalSubject->getKey()]
            : null;
        $notification = (new CodedNotification($code, $params, $target?->toArray(), null, $mobileBorne, $deferredSmsGuard, $refusalSubject))->locale($to->locale);
        if ($outcome !== null) {
            $notification->smsOutcome = $outcome;
            Notification::routes($routes)->notifyNow($notification);

            return;
        }
        Notification::routes($routes)->notify($notification);
    }
}
