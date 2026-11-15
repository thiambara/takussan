<?php

namespace App\Services\Reporting;

use App\Models\Enums\LeasePaymentType;
use App\Models\LeasePayment;
use App\Services\Dashboard\CollectedPayments;
use Carbon\CarbonImmutable;

/**
 * TCK-2657, TCK-2658 — une échéance EN RETARD, et de combien de jours : la règle *Impayé*
 * ({@see CollectedPayments::leaseOwed()} — due et non soldée, hors restitution de caution) échue
 * AVANT aujourd'hui, heure de Dakar. Celle de la balance âgée, du point du mois et de la tuile
 * « Impayés ». Lue par `days_late` de l'historique et par la relance notée : une seule définition.
 */
final class OverdueInstalment
{
    public const TIMEZONE = 'Africa/Dakar';

    public static function today(): string
    {
        return now(self::TIMEZONE)->toDateString();
    }

    /** Les jours de retard (≥ 1), ou `null` si l'échéance n'est pas en retard. */
    public static function daysLate(LeasePayment $payment, ?string $today = null): ?int
    {
        if ($payment->payment_type === LeasePaymentType::DepositRefund
            || ! in_array($payment->status, CollectedPayments::OWED_STATUSES, true)
            || $payment->due_date === null) {
            return null;
        }
        $today ??= self::today();
        $due = $payment->due_date->toDateString();

        return $due < $today
            ? (int) CarbonImmutable::parse($due)->diffInDays(CarbonImmutable::parse($today))
            : null;
    }
}
