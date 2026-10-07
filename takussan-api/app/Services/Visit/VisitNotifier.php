<?php

namespace App\Services\Visit;

use App\Models\PropertyVisit;
use App\Models\User;
use App\Notifications\VisitCancelledNotification;
use App\Notifications\VisitConfirmedNotification;
use App\Notifications\VisitNotification;
use App\Notifications\VisitRequestedNotification;
use App\Notifications\VisitRescheduledNotification;
use App\Rules\PersonnelDeLAgence;
use App\Services\Lead\ContactLeadService;
use App\Services\Property\PrimaryPropertyContact;
use App\Support\TelephoneSaisi;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\RateLimiter;

/**
 * TCK-590 — qui est prévenu de quoi, pour une visite. Extrait de `PropertyVisitController`
 * (`notifyRequested`, `notifyConfirmed`, `managingUsers`) pour être partagé avec la demande
 * publique, qui ne prévenait PERSONNE : `PublicPropertyController::visitRequest` faisait un
 * `PropertyVisit::create` direct, sans agent, sans notification, sans quota — et c'était le chemin
 * que tous les clients empruntaient.
 *
 * **Vers l'agence** : l'agent assigné, le contact principal du bien, le propriétaire ; si la
 * visite est non attribuée, les admins de l'agence (le repli de `ContactLeadService`).
 *
 * **Vers le visiteur** : son compte s'il en a un ; sinon son e-mail et son téléphone saisis, par
 * `Notification::route()`, dans la langue enregistrée sur la visite. Un seul envoi par visite et
 * par événement.
 *
 * Un échec d'envoi ne casse jamais la requête qui l'a déclenché.
 */
class VisitNotifier
{
    /**
     * Vérification adverse (B2′, passe 3 R1) — SMS de visite vers un même numéro, par ÉMETTEUR :
     * l'agence du bien, ou le particulier pour un bien sans agence.
     */
    public const SMS_PAR_HEURE = 5;

    public const SMS_PAR_JOUR = 10;

    /** Passe 3 (R1) — le filet du destinataire, tous émetteurs confondus. */
    public const SMS_PAR_JOUR_PAR_NUMERO = 20;

    /** Passe 3 (n1′) — SMS de visite par jour pour un même UTILISATEUR émetteur, tous numéros. */
    public const SMS_PAR_JOUR_PAR_EMETTEUR = 20;

    /** Passe 3 (R1) — le code rendu à l'appelant quand le SMS au visiteur est retenu. */
    public const CODE_SMS_RETENU = 'visit_sms_capped';

    public function __construct(private readonly ContactLeadService $leads) {}

    public function requested(PropertyVisit $visit): void
    {
        $this->toAgency($visit, new VisitRequestedNotification($visit), withPrimaryAndOwner: true);
    }

    /**
     * Les événements vers le visiteur rendent le sort du SMS ({@see self::toVisitor()}) :
     * `true` parti, `false` retenu par une borne, `null` aucun SMS prévu.
     */
    public function confirmed(PropertyVisit $visit, ?User $emetteur = null): ?bool
    {
        return $this->toVisitor($visit, new VisitConfirmedNotification($visit), $emetteur);
    }

    /** L'agence a déplacé l'heure : le visiteur est prévenu. */
    public function rescheduledByAgency(PropertyVisit $visit, ?User $emetteur = null): ?bool
    {
        return $this->toVisitor($visit, new VisitRescheduledNotification($visit), $emetteur);
    }

    /** Le visiteur propose un autre créneau : l'agence est prévenue. */
    public function rescheduledByVisitor(PropertyVisit $visit): void
    {
        $this->toAgency($visit, new VisitRescheduledNotification($visit, parLeVisiteur: true));
    }

    public function cancelledByAgency(PropertyVisit $visit, ?User $emetteur = null): ?bool
    {
        return $this->toVisitor($visit, new VisitCancelledNotification($visit), $emetteur);
    }

    public function cancelledByVisitor(PropertyVisit $visit): void
    {
        $this->toAgency($visit, new VisitCancelledNotification($visit, parLeVisiteur: true));
    }

    /**
     * Les humains à prévenir côté agence.
     *
     * Une demande neuve (`$withPrimaryAndOwner`) va aussi au contact principal et au propriétaire :
     * ce sont eux qui la voient arriver. Les événements suivants vont à l'agent assigné — à défaut,
     * aux admins de l'agence, puis au contact principal d'un bien sans agence.
     *
     * Vérification adverse (M2) — un agent assigné qui ne peut plus rien recevoir (bloqué,
     * supprimé, profil suspendu ou retiré de l'agence du bien) ne compte pas : l'événement part
     * vers le même repli qu'une visite non attribuée — les admins actifs, sinon le contact
     * principal (passe 2, n2). Le repli ne courait que si `agent_id` était nul, et l'annulation ou le
     * nouveau créneau proposé par le visiteur n'arrivait alors chez personne.
     *
     * @return Collection<int,User>
     */
    public function agencyRecipients(PropertyVisit $visit, bool $withPrimaryAndOwner = false): Collection
    {
        $visit->loadMissing(['agent', 'property']);
        $property = $visit->property;
        $property?->loadMissing(PrimaryPropertyContact::eagerLoads());

        $recipients = collect();
        $agentUtilisable = $visit->agent !== null && ($property?->agency_id === null
            ? PrimaryPropertyContact::joignable($visit->agent)
            : PersonnelDeLAgence::estPersonnel($visit->agent, $property->agency_id));
        if ($agentUtilisable) {
            $recipients->push($visit->agent);
        }

        if ($property !== null && $withPrimaryAndOwner) {
            $recipients->push(PrimaryPropertyContact::for($property));
            if (PrimaryPropertyContact::estProprietaire($property->owner, $property)) {
                $recipients->push($property->owner);
            }
        }

        // Le repli : visite non attribuée, ou agent qui ne peut plus rien recevoir (M2) — les
        // admins actifs de l'agence (à défaut, son personnel `crm.view_all` : n3), sinon le
        // contact principal. Passe 2 (n2) : l'agent
        // injoignable suit la règle de la visite non attribuée ; il partait vers le contact
        // principal, c'est-à-dire souvent vers le bailleur, et l'admin ne recevait rien.
        if (! $agentUtilisable && $property !== null) {
            $recipients = $recipients->merge($this->leads->agencyReaders($property->agency_id));
            if ($recipients->filter()->isEmpty()) {
                $recipients->push(PrimaryPropertyContact::for($property));
            }
        }

        return $recipients->filter()->unique('id')->values();
    }

    private function toAgency(PropertyVisit $visit, VisitNotification $notification, bool $withPrimaryAndOwner = false): void
    {
        $recipients = $this->agencyRecipients($visit, $withPrimaryAndOwner);
        if ($recipients->isEmpty()) {
            return;
        }

        try {
            Notification::send($recipients, $notification);
        } catch (\Throwable) {
            // Notification routing failures must never bubble up and break
            // the originating HTTP request.
        }
    }

    /**
     * Passe 3 (R1) — rend le sort du SMS, pour que l'action le dise à l'appelant : un SMS retenu
     * sans signal laissait l'agent croire le client prévenu.
     */
    private function toVisitor(PropertyVisit $visit, VisitNotification $notification, ?User $emetteur): ?bool
    {
        $visit->loadMissing(['visitor', 'property']);

        try {
            if ($visit->visitor !== null) {
                $sms = $this->borneLeSms($visit, $visit->visitor, $notification, $emetteur);
                $visit->visitor->notify($notification);

                return $sms;
            }

            $routes = array_filter([
                'mail' => $visit->visitor_email,
                'sms' => $visit->visitor_phone,
            ]);
            if ($routes === []) {
                return null;
            }

            $anonymous = Notification::routes($routes);
            $sms = $this->borneLeSms($visit, $anonymous, $notification, $emetteur);
            $anonymous->notify($notification->locale($visit->locale ?? config('app.locale')));

            return $sms;
        } catch (\Throwable) {
            // Silent — see toAgency().
            return null;
        }
    }

    /**
     * Vérification adverse (B2′) — la borne vit au POINT D'ENVOI, pas sur une route.
     *
     * Le limiteur de `POST /property-visits` ne voyait qu'une des quatre portes : une demande
     * anonyme déposée au numéro d'un tiers, confirmée, puis déplacée huit fois, faisait partir
     * 9 SMS en 9 requêtes. Ici, tout SMS de visite vers un même numéro E.164 — confirmation,
     * replanification, annulation, planification — compte. Au-delà d'une borne, le SMS est retenu
     * (l'e-mail et le fil partent) et l'événement est journalisé sous une empreinte : le numéro
     * n'apparaît ni dans le journal ni dans la clé du cache.
     *
     * Passe 3 (R1) — la clé était GLOBALE au numéro : un particulier qui l'épuisait coupait pour
     * 24 h les SMS de toute agence légitime vers ce client. Deux bornes désormais :
     *   - par (numéro, émetteur), l'émetteur étant l'agence du bien, ou le particulier pour un bien
     *     sans agence : {@see self::SMS_PAR_HEURE} par heure, {@see self::SMS_PAR_JOUR} par jour ;
     *   - par numéro, tous émetteurs : {@see self::SMS_PAR_JOUR_PAR_NUMERO} par jour, le filet du
     *     destinataire.
     *
     * Passe 3 (n1′) — et par UTILISATEUR qui agit (`$emetteur`), tous numéros :
     * {@see self::SMS_PAR_JOUR_PAR_EMETTEUR} par jour. Un particulier faisait partir 15 SMS vers
     * 3 numéros, 5 chacun, sans rien qui le borne lui.
     *
     * @return bool|null `true` le SMS part, `false` il est retenu, `null` aucun SMS prévu
     */
    private function borneLeSms(PropertyVisit $visit, object $notifiable, VisitNotification $notification, ?User $emetteur): ?bool
    {
        if (! in_array('sms', $notification->via($notifiable), true)) {
            return null;
        }

        $numero = TelephoneSaisi::normaliser($notifiable instanceof AnonymousNotifiable
            ? ($notifiable->routes['sms'] ?? null)
            : ($notifiable->routeNotificationFor('sms', $notification) ?? $notifiable->phone ?? null));
        if (! is_string($numero) || $numero === '') {
            return null;
        }

        $empreinte = hash_hmac('sha256', $numero, (string) config('app.key'));
        $property = $visit->property;
        $source = $property?->agency_id !== null
            ? 'a'.$property->agency_id
            : 'u'.($property?->user_id ?? 0);
        $heure = 'visit-sms:h:'.$source.':'.$empreinte;
        $jour = 'visit-sms:j:'.$source.':'.$empreinte;
        $filet = 'visit-sms:n:'.$empreinte;
        $acteur = $emetteur !== null ? 'visit-sms:u:'.$emetteur->id : null;

        if (RateLimiter::tooManyAttempts($heure, self::SMS_PAR_HEURE)
            || RateLimiter::tooManyAttempts($jour, self::SMS_PAR_JOUR)
            || RateLimiter::tooManyAttempts($filet, self::SMS_PAR_JOUR_PAR_NUMERO)
            || ($acteur !== null && RateLimiter::tooManyAttempts($acteur, self::SMS_PAR_JOUR_PAR_EMETTEUR))) {
            $notification->retenirLeSms();
            Log::notice('visit.sms_retenu', [
                'visit_id' => $visit->id,
                'notification' => class_basename($notification),
                'destinataire' => substr($empreinte, 0, 16),
            ]);

            return false;
        }

        RateLimiter::hit($heure, 3600);
        RateLimiter::hit($jour, 86400);
        RateLimiter::hit($filet, 86400);
        if ($acteur !== null) {
            RateLimiter::hit($acteur, 86400);
        }

        return true;
    }
}
