<?php

namespace App\Services\Visit;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Notifications\CodedNotification;
use App\Rules\PersonnelDeLAgence;
use App\Services\Lead\ContactLeadService;
use App\Services\Model\NotificationService;
use App\Services\Notifications\ContactSansCompte;
use App\Services\Notifications\NotificationRenderer;
use App\Services\Property\PrimaryPropertyContact;
use App\Support\TelephoneSaisi;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
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
 * **Vers le visiteur** : son compte s'il en a un ; sinon un {@see ContactSansCompte} — son e-mail
 * et son téléphone saisis, dans la langue enregistrée sur la visite. Un seul envoi par visite et
 * par événement.
 *
 * TCK-588 (ADR-0032) — chaque événement est un CODE envoyé par {@see NotificationService::send()} :
 * la ligne de la cloche, l'e-mail, le push et le SMS sont rendus dans la langue du destinataire,
 * l'heure dans son fuseau (Dakar par défaut) suivie de ce fuseau (`timezone`).
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

    public function __construct(
        private readonly ContactLeadService $leads,
        private readonly NotificationService $notifications,
    ) {}

    public function requested(PropertyVisit $visit): void
    {
        $this->toAgency($visit, NotificationCode::VisitRequested, withPrimaryAndOwner: true);
    }

    /**
     * Les événements vers le visiteur rendent le sort du SMS ({@see self::toVisitor()}) :
     * `true` parti, `false` retenu par une borne, `null` aucun SMS prévu.
     */
    public function confirmed(PropertyVisit $visit, ?User $emetteur = null): ?bool
    {
        return $this->toVisitor($visit, NotificationCode::VisitConfirmed, $emetteur);
    }

    /**
     * Passe 4 (X2) — le rappel de visite de TCK-588 (`SendPropertyVisitReminders`) vers un contact
     * SANS COMPTE passe par la même borne que les autres SMS de visite ({@see self::borneLeSms()}) :
     * il compte contre le numéro × l'agence et contre le filet du numéro, et ne part plus par le
     * canal mobile une fois une borne atteinte. Il n'était soumis qu'à la limite générique du
     * canal, et le filet « qui protège le destinataire » ne le voyait pas.
     *
     * @param  array<string, mixed>  $params  les paramètres de `visit.reminder`
     * @return bool|null le sort du SMS, comme {@see self::confirmed()}
     */
    public function reminderToContact(PropertyVisit $visit, ContactSansCompte $contact, array $params): ?bool
    {
        $code = NotificationCode::VisitReminder;
        $sms = $this->borneLeSms($visit, $this->numeroMobile($contact, $code), $code, null);
        $this->notifications->send($contact, $code, $params, null, mobileBorne: $sms === true);

        return $sms;
    }

    /** L'agence a déplacé l'heure : le visiteur est prévenu. */
    public function rescheduledByAgency(PropertyVisit $visit, ?User $emetteur = null): ?bool
    {
        return $this->toVisitor($visit, NotificationCode::VisitRescheduled, $emetteur);
    }

    /** Le visiteur propose un autre créneau : l'agence est prévenue. */
    public function rescheduledByVisitor(PropertyVisit $visit): void
    {
        $this->toAgency($visit, NotificationCode::VisitRescheduledByVisitor);
    }

    public function cancelledByAgency(PropertyVisit $visit, ?User $emetteur = null): ?bool
    {
        return $this->toVisitor($visit, NotificationCode::VisitCancelled, $emetteur);
    }

    public function cancelledByVisitor(PropertyVisit $visit): void
    {
        $this->toAgency($visit, NotificationCode::VisitCancelledByVisitor);
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

    private function toAgency(PropertyVisit $visit, NotificationCode $code, bool $withPrimaryAndOwner = false): void
    {
        foreach ($this->agencyRecipients($visit, $withPrimaryAndOwner) as $recipient) {
            try {
                $this->notifications->send(
                    $recipient,
                    $code,
                    $this->params($visit, $code, $recipient->timezone),
                    NotificationTarget::of('visit', $visit->id),
                );
            } catch (\Throwable) {
                // Notification routing failures must never bubble up and break
                // the originating HTTP request.
            }
        }
    }

    /**
     * Passe 3 (R1) — rend le sort du SMS, pour que l'action le dise à l'appelant : un SMS retenu
     * sans signal laissait l'agent croire le client prévenu.
     */
    private function toVisitor(PropertyVisit $visit, NotificationCode $code, ?User $emetteur): ?bool
    {
        $visit->loadMissing(['visitor', 'property']);

        try {
            $to = $visit->visitor ?? ContactSansCompte::fromVisit($visit);
            if ($to instanceof ContactSansCompte && ! $to->hasPhone() && ! $to->hasEmail()) {
                return null;
            }

            $sms = $this->borneLeSms($visit, $this->numeroMobile($to, $code), $code, $emetteur);
            $this->notifications->send(
                $to,
                $code,
                $this->params($visit, $code, $to instanceof User ? $to->timezone : null),
                $to instanceof User ? NotificationTarget::of('visit', $visit->id) : null,
                // Le SMS est borné ICI, seule source du plafond : `true` dit aux canaux mobiles de
                // ne pas le recompter, `false` (retenu, ou pas de mobile) n'en ouvre aucun.
                mobileBorne: $sms === true,
            );

            return $sms;
        } catch (\Throwable) {
            // Silent — see toAgency().
            return null;
        }
    }

    /**
     * Les paramètres BRUTS d'un code de visite. Aucun texte libre du visiteur : ni son message, ni
     * le nom qu'il a saisi (contrainte 4) ; une demande neuve porte de quoi le joindre.
     *
     * @return array<string, mixed>
     */
    private function params(PropertyVisit $visit, NotificationCode $code, ?string $timezone): array
    {
        $params = [
            'property' => $visit->property?->title ?? '#'.$visit->id,
            'scheduled_at' => $visit->scheduled_at?->toIso8601String(),
            'timezone' => $timezone ?: NotificationRenderer::DEFAULT_TIMEZONE,
        ];
        if ($code === NotificationCode::VisitRequested) {
            $params['contact'] = implode(' · ', array_filter([$visit->visitor_phone, $visit->visitor_email])) ?: null;
        }

        return $params;
    }

    /**
     * Le numéro vers lequel un canal mobile partirait, ou `null` s'il n'en part aucun : code non
     * mobile, préférences du compte, numéro absent ou fixe (vérification adverse, m7).
     */
    private function numeroMobile(User|ContactSansCompte $to, NotificationCode $code): ?string
    {
        if (! $code->mobile()) {
            return null;
        }

        if ($to instanceof ContactSansCompte) {
            return TelephoneSaisi::recoitLesSms($to->phone) ? $to->phone : null;
        }

        $sonde = new CodedNotification($code, []);
        if (array_intersect($sonde->via($to), ['sms', 'whatsapp']) === []) {
            return null;
        }

        return TelephoneSaisi::normaliser($to->routeNotificationFor('sms', $sonde) ?? $to->phone);
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
     * TCK-588 — c'est la SEULE borne d'un SMS de visite. Les canaux SMS et WhatsApp ont leur propre
     * limite horaire par numéro (5/h, `sms-channel:phone:<e164>`) pour les codes qui ne sont pas
     * bornés en amont ; un SMS qui a passé celle-ci la saute ({@see CodedNotification::mobileDejaBorne()}).
     * Compté deux fois, le plafond global par numéro reviendrait par la porte du canal, et un
     * particulier qui l'épuise couperait de nouveau les SMS des agences (R1).
     *
     * @return bool|null `true` le SMS part, `false` il est retenu, `null` aucun SMS prévu
     */
    private function borneLeSms(PropertyVisit $visit, ?string $numero, NotificationCode $code, ?User $emetteur): ?bool
    {
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
            Log::notice('visit.sms_retenu', [
                'visit_id' => $visit->id,
                'code' => $code->value,
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
