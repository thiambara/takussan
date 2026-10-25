<?php

namespace App\Console\Commands\Payouts;

use App\Domain\Notifications\NotificationCode;
use App\Models\Agency;
use App\Models\BookingPayment;
use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use App\Models\User;
use App\Services\Model\NotificationService;
use App\Services\Payout\BeneficiaireDuReversement;
use App\Services\Payout\OwnerStatementService;
use App\Services\Payout\OwnerStatementSnapshots;
use App\Services\Payout\PayoutCalculator;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;

/**
 * TCK-594 (ADR-0039 §3) — le 1er du mois, chaque bailleur qui a eu des encaissements le mois
 * précédent est avisé que son relevé de gérance est disponible (une fois par agence et par mois).
 *
 * Le relevé lui-même n'est pas joint : il se lit à la demande (`GET /api/owner-statements`).
 * TCK-2321 (P177.05 ; ADR-0039, amendement du 2026-10-25) — l'avis écrit l'instantané du relevé
 * envoyé, que le mois clos sert ensuite ; le premier reste ({@see OwnerStatementSnapshots::record()}).
 * L'idempotence d'une relance tient au cache (`Cache::add`, 40 jours) : un cache vidé entre deux
 * exécutions du même mois renverrait l'avis — c'est un avis, pas l'argent — mais pas l'instantané.
 */
class SendOwnerStatements extends Command
{
    protected $signature = 'payouts:send-owner-statements {--period= : YYYY-MM, le mois précédent par défaut}';

    protected $description = 'Avise les bailleurs que leur relevé de gérance du mois est disponible.';

    public function handle(NotificationService $notifications, OwnerStatementSnapshots $snapshots): int
    {
        $period = $this->option('period') ?: now()->subMonthNoOverflow()->format('Y-m');
        [$start, $end] = OwnerStatementService::period($period);
        $sent = 0;

        $pairs = LeasePayment::query()
            ->join('leases', 'leases.id', '=', 'lease_payments.lease_id')
            ->where('lease_payments.status', PaymentStatus::Paid->value)
            ->whereIn('lease_payments.payment_type', array_map(fn ($t) => $t->value, PayoutCalculator::LEASE_TYPES))
            ->whereBetween('lease_payments.paid_at', [$start, $end])
            ->whereNotNull('leases.agency_id')
            ->distinct()
            ->get(['leases.agency_id', 'leases.landlord_id']);

        // P177.04 (TCK-1783) — les acomptes de séjour sont des encaissements du relevé
        // (`PayoutCalculator::bookingPayments`) : leur bailleur est celui du bien.
        $pairs = $pairs->concat(BookingPayment::query()
            ->join('bookings', 'bookings.id', '=', 'booking_payments.booking_id')
            ->join('properties', 'properties.id', '=', 'bookings.property_id')
            ->where('booking_payments.status', PaymentStatus::Paid->value)
            ->whereIn('booking_payments.payment_type', array_map(fn ($t) => $t->value, PayoutCalculator::BOOKING_TYPES))
            ->whereBetween('booking_payments.paid_at', [$start, $end])
            ->whereNotNull('bookings.agency_id')
            ->whereNotNull('properties.user_id')
            ->distinct()
            ->get(['bookings.agency_id', 'properties.user_id as landlord_id']));

        foreach ($pairs as $pair) {
            $landlord = User::query()->find($pair->landlord_id);
            $agency = Agency::query()->find($pair->agency_id);
            // TCK-997 (P50.02, Q1) — l'avis suit le reversement : bailleur, ou personnel actif d'un
            // bien que l'agence garde ; jamais un compte qui n'est ni l'un ni l'autre.
            if ($landlord === null || $agency === null || ! BeneficiaireDuReversement::est($landlord, (int) $agency->id)) {
                continue;
            }

            if (! Cache::add("owner-statement-notified:{$period}:{$agency->id}:{$landlord->id}", true, now()->addDays(40))) {
                continue;
            }

            $snapshots->record($agency, $landlord, $period, now());
            $notifications->send($landlord, NotificationCode::OwnerStatementAvailable, ['period' => $period]);
            $sent++;
        }

        $this->info("{$sent} avis envoyé(s) pour {$period}.");

        return self::SUCCESS;
    }
}
