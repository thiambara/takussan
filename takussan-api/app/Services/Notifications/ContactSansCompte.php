<?php

namespace App\Services\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Models\Customer;
use App\Models\Invitation;
use App\Models\PropertyContactLead;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Model\NotificationService;
use App\Services\Notifications\Sms\PhoneNumber;
use App\Services\Property\PrimaryPropertyContact;

/**
 * TCK-588 (ADR-0032 §3) — un destinataire SANS COMPTE : un locataire saisi par l'agence, un
 * visiteur anonyme. Il n'a qu'un téléphone ; il ne reçoit que des messages transactionnels,
 * sur WhatsApp s'il y a consenti, sinon par SMS ({@see NotificationService::send()}).
 *
 * Sa langue est celle de son compte lié s'il en a un, sinon celle que l'agence a saisie sur sa
 * fiche (TCK-921), sinon `fr` EXPLICITEMENT — jamais la langue du processus
 * (`app()->getLocale()`), qui est celle de l'acteur ou du worker.
 */
final class ContactSansCompte
{
    public const DEFAULT_LOCALE = 'fr';

    /**
     * TCK-590 — un contact sans compte peut aussi avoir laissé un e-mail (le visiteur d'une
     * demande publique) : il le reçoit alors par e-mail, en plus du canal mobile.
     *
     * @param  string|null  $phone  E.164 normalisé, ou null quand le numéro est absent/invalide
     */
    private function __construct(
        public readonly ?string $phone,
        public readonly ?string $name,
        public readonly string $locale,
        public readonly ?int $customerId,
        public readonly ?string $email = null,
    ) {}

    public static function fromCustomer(Customer $customer): self
    {
        $customer->loadMissing('user');

        return new self(
            self::normalize($customer->phone),
            trim(($customer->first_name ?? '').' '.($customer->last_name ?? '')) ?: null,
            $customer->user?->preferredLocale() ?? ($customer->locale ?: self::DEFAULT_LOCALE),
            $customer->getKey(),
        );
    }

    /**
     * Le visiteur d'une visite : `visitor_phone`, sinon le téléphone du client lié.
     *
     * TCK-590 — sa langue est celle de son compte lié, sinon celle ENREGISTRÉE sur la visite à la
     * demande (`locale`, la langue de la page publique), sinon `fr` ; son e-mail saisi, sinon
     * celui de la fiche client.
     */
    public static function fromVisit(PropertyVisit $visit): self
    {
        $visit->loadMissing('customer.user');
        $customer = $visit->customer;

        return new self(
            self::normalize($visit->visitor_phone) ?? self::normalize($customer?->phone),
            $visit->visitor_name ?: null,
            $customer?->user?->preferredLocale() ?? ($visit->locale ?: self::DEFAULT_LOCALE),
            $customer?->getKey(),
            self::email($visit->visitor_email) ?? self::email($customer?->email),
        );
    }

    /**
     * TCK-589 — le destinataire d'une invitation adressée à un NUMÉRO : ce numéro, dans la
     * langue que l'invitation a résolue (celle du compte qui l'a vérifié s'il existe).
     */
    public static function fromInvitation(Invitation $invitation, string $locale): self
    {
        return new self(self::normalize($invitation->phone), null, $locale, null);
    }

    /**
     * TCK-589 p3-1 — l'ANCIEN numéro vérifié d'un compte, après son remplacement : il n'est plus
     * celui d'aucun compte, l'avis lui part donc comme à un contact sans compte (et sous la même
     * borne par numéro du canal SMS), dans la langue du compte qui l'a quitté.
     */
    public static function forPhone(string $phone, string $locale): self
    {
        return new self(self::normalize($phone), null, $locale, null);
    }

    /**
     * TCK-590 — l'auteur d'une demande de contact, pour son accusé de réception : son e-mail
     * SEULEMENT. Un numéro saisi par un tiers ne fait pas partir de SMS (contrainte 4).
     */
    public static function fromLead(PropertyContactLead $lead): self
    {
        return new self(null, $lead->name ?: null, $lead->locale ?: self::DEFAULT_LOCALE, null, self::email($lead->email));
    }

    /**
     * TCK-1493 (P107.01, porteur 2026-10-22) — « sans téléphone vérifié sur le compte, le canal
     * mobile part au contact de la fiche ». Les canaux mobiles d'un compte s'arrêtent sans
     * `phone_verified_at` (`SmsChannel`, `WhatsappChannel`) : avoir un compte faisait perdre au
     * locataire ou au visiteur le SMS que son numéro de fiche recevait sans compte.
     *
     * Rend la fiche RÉDUITE À SON NUMÉRO (l'e-mail, le compte le reçoit déjà), ou `null` : compte
     * absent, non joignable, au téléphone vérifié, ou fiche sans numéro. L'appelant n'y envoie
     * que les codes de {@see NotificationCode::reachesContacts()}, et les paramètres du COMPTE :
     * jamais de lien porteur (VERIF-602 M2), le compte lit sa quittance dans son espace.
     */
    public static function relaisMobileDuCompte(?User $user, self $fiche): ?self
    {
        if ($user === null || $user->phone_verified_at !== null || ! PrimaryPropertyContact::joignable($user) || ! $fiche->hasPhone()) {
            return null;
        }

        return new self($fiche->phone, $fiche->name, $fiche->locale, $fiche->customerId);
    }

    public function hasPhone(): bool
    {
        return $this->phone !== null;
    }

    public function hasEmail(): bool
    {
        return $this->email !== null;
    }

    private static function email(?string $email): ?string
    {
        return is_string($email) && filter_var(trim($email), FILTER_VALIDATE_EMAIL) ? trim($email) : null;
    }

    private static function normalize(?string $phone): ?string
    {
        if (! is_string($phone) || trim($phone) === '') {
            return null;
        }
        try {
            return PhoneNumber::normalize($phone);
        } catch (\InvalidArgumentException) {
            return null;
        }
    }
}
