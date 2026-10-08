<?php

namespace App\Services\Notifications;

use App\Models\Customer;
use App\Models\Invitation;
use App\Models\PropertyVisit;
use App\Services\Model\NotificationService;
use App\Services\Notifications\Sms\PhoneNumber;

/**
 * TCK-588 (ADR-0032 §3) — un destinataire SANS COMPTE : un locataire saisi par l'agence, un
 * visiteur anonyme. Il n'a qu'un téléphone ; il ne reçoit que des messages transactionnels,
 * sur WhatsApp s'il y a consenti, sinon par SMS ({@see NotificationService::send()}).
 *
 * Sa langue est celle de son compte lié s'il en a un, sinon `fr` EXPLICITEMENT — jamais la
 * langue du processus (`app()->getLocale()`), qui est celle de l'acteur ou du worker.
 */
final class ContactSansCompte
{
    public const DEFAULT_LOCALE = 'fr';

    /**
     * @param  string|null  $phone  E.164 normalisé, ou null quand le numéro est absent/invalide
     */
    private function __construct(
        public readonly ?string $phone,
        public readonly ?string $name,
        public readonly string $locale,
        public readonly ?int $customerId,
    ) {}

    public static function fromCustomer(Customer $customer): self
    {
        $customer->loadMissing('user');

        return new self(
            self::normalize($customer->phone),
            trim(($customer->first_name ?? '').' '.($customer->last_name ?? '')) ?: null,
            $customer->user?->preferredLocale() ?? self::DEFAULT_LOCALE,
            $customer->getKey(),
        );
    }

    /** Le visiteur d'une visite : `visitor_phone`, sinon le téléphone du client lié. */
    public static function fromVisit(PropertyVisit $visit): self
    {
        $visit->loadMissing('customer.user');
        $customer = $visit->customer;

        return new self(
            self::normalize($visit->visitor_phone) ?? self::normalize($customer?->phone),
            $visit->visitor_name ?: null,
            $customer?->user?->preferredLocale() ?? self::DEFAULT_LOCALE,
            $customer?->getKey(),
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

    public function hasPhone(): bool
    {
        return $this->phone !== null;
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
