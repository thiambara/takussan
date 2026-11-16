<?php

namespace Database\Seeders\Activity;

use App\Models\Agency;
use App\Models\BookingPayment;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use App\Models\User;
use App\Services\Payout\BeneficiaireDuReversement;
use App\Services\Payout\OwnerStatementService;
use App\Services\Payout\OwnerStatementSnapshots;
use App\Services\Payout\PayoutCalculator;
use Carbon\CarbonImmutable;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * TCK-2381 — le relevé de gérance ENVOYÉ des trois derniers mois clos : l'instantané que
 * `payouts:send-owner-statements` écrit le 1er du mois à 08:00 (TCK-2321), pour les mêmes couples
 * agence × bailleur que la commande, et calculé à cet instant par `OwnerStatementSnapshots::record()`.
 *
 * Joué AVANT `PayoutClawbackSeeder` : un remboursement daté après l'envoi n'est pas dans l'instantané, il se
 * lit en rectificatif (`OwnerStatementSnapshots::served()`), comme dans l'application.
 *
 * La commande elle-même n'est pas jouée : elle avise aussi le bailleur (un envoi sortant), et son
 * idempotence tient au cache (`Cache::add`, 40 jours), qui rendrait muet un second seed.
 */
class OwnerStatementSnapshotSeeder extends Seeder
{
    private const MOIS = 3;

    /** @var array<int, true> les agences dont un bailleur devait recevoir un relevé */
    private array $envoyes = [];

    public function __construct(
        private readonly SeedingContext $ctx,
        private readonly OwnerStatementSnapshots $snapshots,
    ) {}

    public function run(): void
    {
        $courant = CarbonImmutable::now()->startOfMonth();
        for ($i = self::MOIS; $i >= 1; $i--) {
            $mois = $courant->subMonths($i);
            $this->periode($mois->format('Y-m'), $mois->addMonth()->setTime(8, 0));
        }

        foreach ($this->ctx->agencies as $agency) {
            if ($agency->kind === AgencyKind::Standard && isset($this->envoyes[(int) $agency->id])
                && ! DB::table(OwnerStatementSnapshots::TABLE)->where('agency_id', $agency->id)->exists()) {
                throw new RuntimeException("OwnerStatementSnapshotSeeder : aucun relevé envoyé pour l'agence standard {$agency->id}.");
            }
        }
    }

    /** Les couples de la commande, et l'instantané de chacun, à l'heure de l'envoi. */
    private function periode(string $period, CarbonImmutable $envoi): void
    {
        [$start, $end] = OwnerStatementService::period($period);

        $pairs = LeasePayment::query()
            ->join('leases', 'leases.id', '=', 'lease_payments.lease_id')
            ->where('lease_payments.status', PaymentStatus::Paid->value)
            ->whereIn('lease_payments.payment_type', array_map(fn ($t) => $t->value, PayoutCalculator::LEASE_TYPES))
            ->whereBetween('lease_payments.paid_at', [$start, $end])
            ->whereNotNull('leases.agency_id')
            ->distinct()
            ->get(['leases.agency_id', 'leases.landlord_id'])
            ->concat(BookingPayment::query()
                ->join('bookings', 'bookings.id', '=', 'booking_payments.booking_id')
                ->join('properties', 'properties.id', '=', 'bookings.property_id')
                ->where('booking_payments.status', PaymentStatus::Paid->value)
                ->whereIn('booking_payments.payment_type', array_map(fn ($t) => $t->value, PayoutCalculator::BOOKING_TYPES))
                ->whereBetween('booking_payments.paid_at', [$start, $end])
                ->whereNotNull('bookings.agency_id')
                ->whereNotNull('properties.user_id')
                ->distinct()
                ->get(['bookings.agency_id', 'properties.user_id as landlord_id']))
            ->map(fn ($p) => [(int) $p->agency_id, (int) $p->landlord_id])
            ->unique(fn (array $p) => $p[0].':'.$p[1])
            ->sortBy(fn (array $p) => sprintf('%010d:%010d', $p[0], $p[1]))
            ->values();

        Timeline::aLaDate($envoi, function () use ($pairs, $period): void {
            foreach ($pairs as [$agencyId, $landlordId]) {
                $agency = Agency::query()->find($agencyId);
                $landlord = User::query()->find($landlordId);
                if ($agency === null || $landlord === null || ! BeneficiaireDuReversement::est($landlord, $agencyId)) {
                    continue;
                }
                $this->envoyes[$agencyId] = true;
                $this->snapshots->record($agency, $landlord, $period, now());
            }
        });
    }
}
