<?php

namespace App\Services\Payout;

use App\Models\Agency;
use App\Models\BookingPayment;
use App\Models\Enums\Currency;
use App\Models\Enums\PayeeRole;
use App\Models\LeasePayment;
use App\Models\PayoutMethod;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

/**
 * TCK-594 (ADR-0039 §3) — préparer un reversement : choisir un bailleur et une période, puis LIRE
 * un calcul qu'on ne peut pas réécrire. Rien n'est écrit ici ; `POST /api/payouts` recalcule tout
 * depuis les identifiants des pièces que cette lecture rend.
 */
final class PayoutPreparationService
{
    public function __construct(
        private readonly PayoutCalculator $calculator,
        private readonly PayoutApprovalRule $approvalRule,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function prepare(User $issuer, User $landlord, CarbonInterface $start, CarbonInterface $end, ?int $agencyId = null): array
    {
        // Comme `PayoutService::create` : le super-admin désigne l'agence ; pour tout autre, c'est celle
        // de son profil actif.
        $agencyId = $issuer->isSuperAdmin() && $agencyId !== null ? $agencyId : $issuer->agency_id;
        abort_code_if($agencyId === null, 403, 'payout.agency_required');
        $agency = Agency::query()->findOrFail($agencyId);

        abort_code_unless(
            $landlord->hasProfileAt((int) $agency->id, OwnerProfile::class)
            || $landlord->hasProfileAt((int) $agency->id, AgentProfile::class)
            || $landlord->hasProfileAt((int) $agency->id, AgencyAdminProfile::class),
            403,
            'payout.landlord_not_in_agency',
        );

        // TCK-2064 (P178.01) — une pièce encaissée par la plateforme attend son `PlatformPayout` payé.
        $leasePayments = $this->calculator->exceptAwaitingPlatform($this->calculator->leasePayments((int) $agency->id, (int) $landlord->id, $start, $end), $agency)->get();
        $bookingPayments = $this->calculator->exceptAwaitingPlatform($this->calculator->bookingPayments((int) $agency->id, (int) $landlord->id, $start, $end), $agency)->get();

        $computation = $this->withPlatformFee($this->calculator->compute(
            $agency,
            $leasePayments,
            $bookingPayments,
            $this->calculator->rechargeableBills((int) $agency->id, (int) $landlord->id)->get(),
        ), $leasePayments, $bookingPayments);

        $threshold = $agency->payout_approval_threshold;

        return array_merge($computation, [
            'agency_id' => $agency->id,
            'landlord_id' => $landlord->id,
            'period_start' => $start->toDateString(),
            'period_end' => $end->toDateString(),
            // VERIF-594 M-1 — la même règle que la création : le cumul non approuvé compte.
            'requires_approval' => $this->approvalRule->requiresApproval($agency, (float) $computation['totals']['net'], PayeeRole::Landlord, (int) $landlord->id),
            'approval_threshold' => $threshold !== null ? (float) $threshold : null,
            'approval_window_days' => PayoutApprovalRule::WINDOW_DAYS,
            // TCK-2154 (P200.02) — les acomptes d'une réservation close dont le remboursement est à
            // traiter : écartés du calcul, et dits ici pour que l'agence sache pourquoi.
            'held_for_refund' => $this->calculator->bookingPaymentsHeldForRefund((int) $agency->id, (int) $landlord->id, $start, $end)
                ->get()
                ->map(fn (BookingPayment $p) => [
                    'id' => (int) $p->id,
                    'booking_id' => (int) $p->booking_id,
                    'booking_reference' => $p->booking?->reference_number,
                    'amount' => (float) $p->amount,
                    'paid_at' => $p->paid_at?->toIso8601String(),
                ])
                ->values()
                ->all(),
            // La forme masquée seule : l'agence ne lit jamais le numéro en clair (ADR-0039 §6).
            'payout_methods' => PayoutMethod::query()
                ->with('verifications')
                ->where('user_id', $landlord->id)
                ->orderByDesc('is_default')
                ->orderBy('id')
                ->get()
                ->map(fn (PayoutMethod $m) => [
                    'id' => $m->id,
                    'kind' => $m->kind?->value,
                    'masked_identifier' => $m->masked_identifier,
                    'is_default' => $m->is_default,
                    // VERIF-594 M-6 — vérifiée par CETTE agence, la seule qui paie.
                    'verified' => $m->isVerifiedFor((int) $agency->id),
                ])
                ->values()
                ->all(),
        ]);
    }

    /**
     * TCK-2074 (P178.03, décision du porteur du 2026-10-23) — l'agence porte la commission de la
     * plateforme (`features.md` § 1.5, « retenue à la source ») : le reversement au bailleur n'en
     * change pas. La préparation la MONTRE, ligne par ligne, sur les pièces soldées par la
     * plateforme : son taux (`platform_fee_pct_at_payment`), son montant arrondi comme la clôture
     * (`PlatformPayoutService::closeForAgency`) et ce que l'agence en a reçu. Quand le taux appliqué
     * au bailleur est inférieur, `commission_below_platform_fee` avertit, sans rien bloquer.
     *
     * Lecture de la préparation seule : le relevé de gérance emprunte `compute()` et n'en dit rien.
     *
     * @param  array<string, mixed>  $computation
     * @param  Collection<int, LeasePayment>  $leasePayments
     * @param  Collection<int, BookingPayment>  $bookingPayments
     * @return array<string, mixed>
     */
    private function withPlatformFee(array $computation, Collection $leasePayments, Collection $bookingPayments): array
    {
        $currency = (string) $computation['currency'];
        $total = 0.0;

        foreach (['lease_payments' => $leasePayments, 'booking_payments' => $bookingPayments] as $key => $payments) {
            $settled = $this->settledByPlatform($payments);
            $byId = $payments->keyBy('id');

            foreach ($computation['lines'][$key] as $i => $line) {
                $payment = $byId->get($line['id']);
                $isSettled = isset($settled[$line['id']]);
                $rate = $isSettled ? (float) ($payment?->platform_fee_pct_at_payment ?? 0) : null;
                $fee = $rate !== null ? Currency::roundAmount((float) $line['amount'] * $rate / 100, $currency) : null;
                $total += $fee ?? 0.0;

                $computation['lines'][$key][$i] += [
                    'settled_by_platform' => $isSettled,
                    'platform_fee_rate' => $rate,
                    'platform_fee' => $fee,
                    'agency_received' => $fee !== null ? Currency::roundAmount((float) $line['amount'] - $fee, $currency) : null,
                    'commission_below_platform_fee' => $rate !== null && (float) $line['commission_rate'] < $rate,
                ];
            }
        }

        $computation['totals']['platform_fee'] = Currency::roundAmount($total, $currency);

        return $computation;
    }

    /**
     * Les pièces soldées par une intégration globale, en une requête : le complément de
     * `whereNotSettledByPlatform` (TCK-1415), la lecture SQL de `isSettledByPlatform()`.
     *
     * @param  Collection<int, LeasePayment|BookingPayment>  $payments
     * @return array<int, true>
     */
    private function settledByPlatform(Collection $payments): array
    {
        if ($payments->isEmpty()) {
            return [];
        }

        $model = $payments->first();
        $notSettled = $model->newQuery()->whereKey($payments->modelKeys())->whereNotSettledByPlatform()->pluck('id')->all();

        return array_fill_keys(array_diff($payments->modelKeys(), $notSettled), true);
    }
}
