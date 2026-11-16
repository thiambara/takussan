<?php

namespace App\Models\Enums;

enum BookingPaymentType: string
{
    case Deposit = 'deposit';
    case Advance = 'advance';
    case Fee = 'fee';
    // TCK-2892 (ADR-0110 § 1) — la caution d'un séjour (rendue au départ) et un paiement « autre »,
    // qui dit ce qu'il est dans `notes` (exigé). Ni l'une ni l'autre n'est dans le total reversable
    // au bailleur : ni bornées par le reste dû, ni déduites de ce qu'il reste à payer.
    case SecurityDeposit = 'security_deposit';
    case Other = 'other';

    /**
     * TCK-2892 — les types qui règlent le total du séjour (acompte, solde) : les seuls bornés par le
     * reste dû et déduits de ce qu'il reste à payer.
     *
     * @return list<self>
     */
    public static function reglantLeTotal(): array
    {
        return [self::Deposit, self::Advance];
    }

    /** TCK-2892 — le libellé imprimé (reçu PDF), `bookings.payment_types.*`. */
    public function label(?string $locale = null): string
    {
        return __('bookings.payment_types.'.$this->value, [], $locale);
    }
}
