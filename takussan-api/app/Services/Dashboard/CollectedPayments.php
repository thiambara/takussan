<?php

namespace App\Services\Dashboard;

use App\Models\BookingPayment;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use Illuminate\Database\Eloquent\Builder;

/**
 * TCK-595 (ADR-0057 §2) — LA définition de l'*Encaissé* et de l'*Impayé*, une fois, pour tous les
 * lecteurs : tableaux de bord bailleur, agence et client, balance âgée, métriques et instantanés
 * plateforme.
 *
 * - *Encaissé* = `LeasePayment` payés de type `rent | charges | regularization | penalty`, plus
 *   `BookingPayment` `paid`, montant − `refund_amount`. Jamais `deposit` (de l'argent détenu, pas un
 *   revenu) ni `deposit_refund` (de l'argent qui SORT vers le locataire, TCK-594).
 * - *Impayé* = `LeasePayment` `pending | late` échus, hors `deposit_refund`, quel que soit le statut
 *   `late` ou non : un bail sans pénalité ne passe jamais `late` (`LateFeeCalculator`).
 *
 * Chaque lecteur recopiait son filtre ; trois d'entre eux comptaient le dépôt comme revenu et la
 * caution rendue comme une dette du locataire.
 */
final class CollectedPayments
{
    /** Les types de loyer qui sont un revenu encaissé. */
    public const LEASE_INCOME_TYPES = [
        LeasePaymentType::Rent,
        LeasePaymentType::Charges,
        LeasePaymentType::Regularization,
        LeasePaymentType::Penalty,
    ];

    /** Les statuts d'une échéance due et non réglée. */
    public const OWED_STATUSES = [PaymentStatus::Pending, PaymentStatus::Late];

    /** Montant encaissé d'une ligne de réservation : ce qui a été payé, moins ce qui a été rendu. */
    public const BOOKING_NET_SQL = 'booking_payments.amount - COALESCE(booking_payments.refund_amount, 0)';

    /** @return list<string> */
    public static function leaseIncomeTypeValues(): array
    {
        return array_map(static fn (LeasePaymentType $t): string => $t->value, self::LEASE_INCOME_TYPES);
    }

    /** @return list<string> */
    public static function owedStatusValues(): array
    {
        return array_map(static fn (PaymentStatus $s): string => $s->value, self::OWED_STATUSES);
    }

    /** Loyers encaissés : payés, de type revenu. */
    public static function leaseIncome(?Builder $query = null): Builder
    {
        $query ??= LeasePayment::query();

        return $query
            ->where('lease_payments.status', PaymentStatus::Paid->value)
            ->whereIn('lease_payments.payment_type', self::leaseIncomeTypeValues());
    }

    /** Paiements de réservation encaissés. À sommer par {@see self::BOOKING_NET_SQL}. */
    public static function bookingIncome(?Builder $query = null): Builder
    {
        $query ??= BookingPayment::query();

        return $query->where('booking_payments.status', PaymentStatus::Paid->value);
    }

    /**
     * Échéances dues et non réglées (sans la condition d'échéance, que le lecteur pose : échue pour un
     * impayé, à venir pour un « prochain loyer »). Jamais une restitution de caution.
     */
    public static function leaseOwed(?Builder $query = null): Builder
    {
        $query ??= LeasePayment::query();

        // Le scope de TCK-594 reste la définition de « ce n'est pas une restitution » : on le lit.
        return $query
            ->whereIn('lease_payments.status', self::owedStatusValues())
            ->exceptDepositRefunds();
    }
}
