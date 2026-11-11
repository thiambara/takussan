<?php

namespace App\Services\Payments;

use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use App\Services\Dashboard\CollectedPayments;
use App\Services\Payout\OwnerStatementService;
use App\Services\Reporting\OverdueInstalment;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * TCK-2649, TCK-2637 — l'état du loyer d'un bien sur un mois, sur ses échéances de LOYER non
 * annulées (jamais la caution ni les charges). Écrit pour le relevé du bailleur
 * ({@see OwnerStatementService}, `month_status`), lu aussi par l'occupation d'un bien
 * (`current_month`, TCK-2637) : une seule définition. Dans cet ordre :
 *
 * - `paid` : toutes soldées ;
 * - `late` : au moins une en retard ({@see OverdueInstalment::daysLate()}, la règle de
 *   l'historique et de la balance âgée) — `days_late` est le plus grand retard ;
 * - `partial` : une part versée, le reste pas encore échu ;
 * - `due` : rien de versé, rien d'échu (le loyer du mois n'est pas encore dû) ;
 * - `none` : un bail court, mais aucune échéance de loyer dans la période (pas encore émise) ;
 * - `vacant` : ni bail ni échéance.
 *
 * `due` et `none` s'ajoutent aux quatre états du ticket TCK-2649, avec le vocabulaire de TCK-2637
 * (`current_month.status`) : sans eux, un loyer pas encore échu se lirait « payé » ou « en
 * retard », et un bail sans échéancier « vacant ».
 */
final class RentMonthStatus
{
    /**
     * @param  Collection<int, LeasePayment>  $dues
     * @return array{month_status: string, days_late: ?int}
     */
    public static function of(Collection $dues, bool $occupied, ?string $today = null): array
    {
        if ($dues->isEmpty()) {
            return ['month_status' => $occupied ? 'none' : 'vacant', 'days_late' => null];
        }

        $remaining = self::owed($dues);
        if ($remaining->isEmpty()) {
            return ['month_status' => 'paid', 'days_late' => null];
        }

        $late = $remaining->map(fn (LeasePayment $p) => OverdueInstalment::daysLate($p, $today))->filter()->max();
        if ($late !== null) {
            return ['month_status' => 'late', 'days_late' => (int) $late];
        }

        $paidSomething = $dues->sum(fn (LeasePayment $p) => (float) $p->amount) > $remaining->sum(fn (LeasePayment $p) => (float) $p->remaining_amount);

        return ['month_status' => $paidSomething ? 'partial' : 'due', 'days_late' => null];
    }

    /**
     * Les échéances qui restent à payer : dues (`CollectedPayments::OWED_STATUSES`) et non soldées.
     *
     * @param  Collection<int, LeasePayment>  $dues
     * @return Collection<int, LeasePayment>
     */
    public static function owed(Collection $dues): Collection
    {
        return $dues->filter(fn (LeasePayment $p) => in_array($p->status, CollectedPayments::OWED_STATUSES, true) && (float) $p->remaining_amount > 0);
    }

    /**
     * TCK-2637 — les échéances de loyer non annulées dues dans le mois de `$today` (heure de Dakar),
     * les `dues` de {@see self::of()} pour le mois courant.
     *
     * @template TBuilder of Builder
     *
     * @param  TBuilder  $payments
     * @return TBuilder
     */
    public static function ofMonth(Builder $payments, ?string $today = null): Builder
    {
        $day = CarbonImmutable::parse($today ?? OverdueInstalment::today());

        return $payments
            ->where('lease_payments.payment_type', LeasePaymentType::Rent->value)
            ->where('lease_payments.status', '!=', PaymentStatus::Cancelled->value)
            ->whereBetween('lease_payments.due_date', [$day->startOfMonth()->toDateString(), $day->endOfMonth()->toDateString()]);
    }

    /**
     * TCK-2637 — le miroir SQL de `late` : parmi les échéances du mois, une due, non soldée
     * (`CollectedPayments::OWED_REMAINING_SQL`) et échue avant aujourd'hui. `PropertyOccupancyTest`
     * tient la parité avec {@see self::of()} (filtre `rent_late` ↔ `current_month.status`).
     *
     * @template TBuilder of Builder
     *
     * @param  TBuilder  $payments
     * @return TBuilder
     */
    public static function lateOfMonth(Builder $payments, ?string $today = null): Builder
    {
        $today ??= OverdueInstalment::today();

        return self::ofMonth($payments, $today)
            ->whereIn('lease_payments.status', CollectedPayments::owedStatusValues())
            ->whereRaw(CollectedPayments::OWED_REMAINING_SQL.' > 0')
            ->where('lease_payments.due_date', '<', $today);
    }
}
