<?php

namespace Database\Seeders\Activity;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PayeeRole;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PayoutStatus;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Services\Billing\PlatformPayoutService;
use App\Services\Payout\ObservedRefundPayout;
use App\Services\Payout\PayoutClawbacks;
use Carbon\CarbonImmutable;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Database\Seeders\Support\Tirage;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * TCK-2381 — un trop-perçu rendu au locataire APRÈS que le bailleur a été payé : la reprise au bailleur
 * (`payout_clawbacks`, TCK-2151) et le reversement « constaté » du remboursement (TCK-2052).
 *
 * Le geste de l'application, écrit dans le même ordre que `PaymentGatewayService` : la part rendue sur
 * l'échéance (`refund_amount`, partielle — l'échéance reste `paid`), le constaté, puis la reprise, à la
 * date du remboursement. Le remboursement suit le DERNIER reversement du bailleur : aucun reversement
 * semé ne vient après lui, la reprise reste donc due — l'état exact qu'un reversement suivant
 * imputerait (`PayoutClawbacks::plan`), et non une imputation que les reversements semés ne portent pas.
 */
class PayoutClawbackSeeder extends Seeder
{
    /** Bailleurs remboursés par agence. */
    private const PAR_AGENCE = 2;

    public function __construct(
        private readonly SeedingContext $ctx,
        private readonly PayoutClawbacks $clawbacks,
        private readonly ObservedRefundPayout $observed,
        private readonly PlatformPayoutService $platformPayouts,
    ) {}

    public function run(): void
    {
        foreach ($this->ctx->agencies as $agency) {
            // Une agence sans échéance remboursable (aucun reversement émis) n'a rien d'où dériver une
            // reprise ; une agence qui en a et n'en écrit aucune signale un pivot sans copie.
            [$candidates, $ecrites] = $this->agence($agency);
            if ($candidates > 0 && $ecrites === 0 && $agency->kind === AgencyKind::Standard) {
                throw new RuntimeException("PayoutClawbackSeeder : aucune reprise pour l'agence standard {$agency->id}.");
            }
        }
    }

    /** @return array{0: int, 1: int} échéances remboursées, reprises écrites */
    private function agence(Agency $agency): array
    {
        $maintenant = CarbonImmutable::now();

        // Le dernier reversement au bailleur de chaque bailleur, déjà émis.
        $derniers = Payout::query()
            ->where('agency_id', $agency->id)
            ->where('payee_role', PayeeRole::Landlord->value)
            ->where('status', PayoutStatus::Completed->value)
            ->where('processed_at', '<', $maintenant->subDay())
            ->orderBy('landlord_id')
            ->orderByDesc('processed_at')
            ->orderByDesc('id')
            ->get()
            ->unique('landlord_id')
            ->values();

        $ecrites = 0;
        $candidates = 0;
        foreach (Tirage::melanger($derniers) as $payout) {
            if ($candidates >= self::PAR_AGENCE) {
                break;
            }
            $payment = $this->echeanceRemboursable($payout);
            if ($payment === null) {
                continue;
            }

            $part = max(1000.0, round((float) $payment->amount * Tirage::un([5, 10, 15]) / 100 / 1000) * 1000);
            $le = Timeline::businessHour(Timeline::randomDateBetween(
                CarbonImmutable::parse($payout->processed_at)->addDay(),
                $maintenant->subDay(),
            ));
            if ($le->greaterThan($maintenant)) {
                continue;
            }

            $candidates++;
            $agentId = $this->ctx->agentAu((int) $agency->id, $le);
            Timeline::aLaDate($le, function () use ($payment, $part, $agentId): void {
                DB::transaction(function () use ($payment, $part, $agentId): void {
                    $payment->forceFill(['refund_amount' => (float) ($payment->refund_amount ?? 0) + $part])->save();
                    $this->observed->record($payment, $part, now(), $agentId);
                    $this->clawbacks->recordRefund($payment, $part, now());
                });
            });

            if (DB::table(PayoutClawbacks::TABLE)->where('refunded_payment_type', LeasePayment::class)->where('refunded_payment_id', $payment->id)->exists()) {
                $ecrites++;
            }
        }

        return [$candidates, $ecrites];
    }

    /** Une échéance de loyer ou de charges portée par ce reversement, encaissée par l'agence, jamais remboursée. */
    private function echeanceRemboursable(Payout $payout): ?LeasePayment
    {
        $ids = DB::table('payout_lease_payment')
            ->where('payout_id', $payout->id)
            ->whereNotNull('amount')
            ->whereNotNull('commission_rate')
            ->orderBy('lease_payment_id')
            ->pluck('lease_payment_id');

        return LeasePayment::query()
            ->whereKey($ids)
            ->where('status', PaymentStatus::Paid->value)
            ->whereIn('payment_type', [LeasePaymentType::Rent->value, LeasePaymentType::Charges->value])
            ->whereNull('refund_amount')
            ->orderBy('id')
            ->get()
            ->first(fn (LeasePayment $p) => (float) $p->amount >= 20000 && ! $this->platformPayouts->isSettledByPlatform($p));
    }
}
