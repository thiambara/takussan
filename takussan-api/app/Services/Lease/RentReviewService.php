<?php

namespace App\Services\Lease;

use App\Events\Lease\LeaseRentReviewed;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Setting;
use App\Models\User;
use App\Services\Admin\PlatformSettingService;
use App\Services\Payments\PaymentGatewayService;
use App\Support\ScopedSetting;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * TCK-091 — Rent review on an active lease.
 *
 * The new rent is applied immediately to the lease row, and effective_date is recorded in the
 * activity log. TCK-668 (P04.02) — the schedule is generated whole at activation, so the review
 * also rewrites the rent payments already generated whose period starts on or after
 * effective_date, while they are still `pending` and not being paid (no open checkout, no
 * recorded part-payment): {@see self::rewriteUpcomingRentPayments()}. A paid, part-paid or
 * in-progress payment keeps the rent it was issued at.
 *
 * Variations above the configured threshold (default 20 %) require the
 * `force=true` flag AND `Capability::LeasesRentReviewForce` — on a legacy lease only: a cap frozen
 * with the signed contract is never forced (VERIF-596 passe 3, m-b, ADR-0042 §1). The capability is
 * resolved by `MembershipCapabilityResolver` through the Gate derived from the enum
 * (TCK-278 / ADR-0003 — it is no longer a Spatie permission, the package is
 * uninstalled, ADR-0002). A tenant-facing notification fires on every
 * successful review.
 */
class RentReviewService
{
    public const SETTING_KEY = 'lease.rent_review_max_pct';

    public const DEFAULT_MAX_PCT = 20;

    public const REASON_MIN = 5;

    public const REASON_MAX = 500;

    /** @var list<LeaseStatus> */
    public const REVIEWABLE_STATUSES = [LeaseStatus::Active];

    /**
     * @param  array{new_rent: float|int|string, reason: string, effective_date?: ?string, force?: bool|int|string}  $data
     */
    public function review(Lease $lease, User $actor, array $data): Lease
    {
        $reason = trim((string) ($data['reason'] ?? ''));
        $newRent = round((float) ($data['new_rent'] ?? 0), 2);
        $force = filter_var($data['force'] ?? false, FILTER_VALIDATE_BOOLEAN);

        if ($reason === '' || mb_strlen($reason) < self::REASON_MIN || mb_strlen($reason) > self::REASON_MAX) {
            throw ValidationException::withMessages([
                'reason' => [__('messages.lease_rent_review_reason_required')],
            ])->status(422);
        }

        if ($newRent <= 0) {
            throw ValidationException::withMessages([
                'new_rent' => [__('messages.lease_rent_review_invalid_amount')],
            ])->status(422);
        }

        $effectiveDate = $this->resolveEffectiveDate($data['effective_date'] ?? null);

        return DB::transaction(function () use ($lease, $actor, $reason, $newRent, $force, $effectiveDate) {
            $lease = Lease::query()->lockForUpdate()->findOrFail($lease->id);

            if (! in_array($lease->status, self::REVIEWABLE_STATUSES, true)) {
                throw ValidationException::withMessages([
                    'status' => [__('messages.lease_rent_review_status_not_reviewable')],
                ])->status(422);
            }

            $oldRent = round((float) ($lease->monthly_rent ?? 0), 2);
            if ($oldRent <= 0) {
                throw ValidationException::withMessages([
                    'monthly_rent' => [__('messages.lease_rent_review_no_baseline')],
                ])->status(422);
            }

            $variationPct = abs($newRent - $oldRent) / $oldRent * 100;
            $maxPct = $this->maxPctFor($lease);
            if ($variationPct > $maxPct + 0.0001) {
                if (! $force) {
                    throw ValidationException::withMessages([
                        'new_rent' => [__('messages.lease_rent_review_variation_excessive', [
                            'max' => (string) $maxPct,
                            'variation' => number_format($variationPct, 2),
                        ])],
                    ])->status(422);
                }
                // VERIF-596 passe 3 (m-b, ADR-0042 §1) — un plafond FIGÉ est imprimé au contrat signé,
                // sans réserve : `force` ne le dépasse pas, capacité ou non. Le dépassement d'un
                // plafond contractuel passe par un renouvellement ou un avenant signé. `force` ne vaut
                // plus que pour un bail antérieur, dont le plafond est le réglage de son agence, sinon le global.
                abort_code_if($lease->rent_review_max_pct !== null, 422, 'lease.rent_review_above_contract_cap', [
                    'max' => (string) $maxPct,
                ]);
                if (! $actor->can('leases.rent_review_force')) {
                    throw ValidationException::withMessages([
                        'force' => [__('messages.lease_rent_review_force_not_allowed')],
                    ])->status(422);
                }
            }

            $lease->forceFill(['monthly_rent' => $newRent])->save();
            $this->rewriteUpcomingRentPayments($lease, $newRent, $effectiveDate);

            activity('Lease')
                ->performedOn($lease)
                ->causedBy($actor)
                ->withProperties([
                    'old_rent' => $oldRent,
                    'new_rent' => $newRent,
                    'reason' => $reason,
                    'effective_date' => $effectiveDate,
                    'variation_pct' => round($variationPct, 2),
                    'forced' => (bool) $force,
                ])
                ->event('lease_rent_reviewed')
                ->log('lease_rent_reviewed');

            $lease->refresh();
            LeaseRentReviewed::dispatch(
                $lease,
                $actor,
                $oldRent,
                $newRent,
                $reason,
                $effectiveDate,
                (bool) $force,
            );

            return $lease;
        });
    }

    /**
     * TCK-668 (P04.02) — à `effective_date`, les échéances de loyer `pending` dont la période
     * commence à cette date ou après passent au nouveau loyer, × le nombre de mois de leur période
     * (P04.01 : une échéance trimestrielle couvre trois mois). Jamais une échéance payée, ni en
     * cours de paiement : checkout ouvert (le montant y est figé), ou acompte déjà enregistré.
     * Appelée sous le verrou du bail ; les échéances sont verrouillées à leur tour.
     */
    private function rewriteUpcomingRentPayments(Lease $lease, float $newRent, string $effectiveDate): void
    {
        $gateway = app(PaymentGatewayService::class);

        $payments = LeasePayment::query()
            ->where('lease_id', $lease->id)
            ->where('payment_type', LeasePaymentType::Rent->value)
            ->where('status', PaymentStatus::Pending->value)
            ->where('period_start', '>=', $effectiveDate)
            ->lockForUpdate()
            ->get();

        foreach ($payments as $payment) {
            $paidAmount = (float) (is_array($payment->metadata) ? ($payment->metadata['paid_amount'] ?? 0) : 0);
            if ($paidAmount > 0 || $gateway->openCheckout($payment) !== null) {
                continue;
            }

            $payment->forceFill(['amount' => round($newRent * $this->monthsOf($payment), 2)])->save();
        }
    }

    /**
     * Le nombre de mois que couvre la période de l'échéance, un au moins.
     */
    private function monthsOf(LeasePayment $payment): int
    {
        if ($payment->period_start === null || $payment->period_end === null) {
            return 1;
        }

        $start = Carbon::parse($payment->period_start)->startOfDay();
        $endExclusive = Carbon::parse($payment->period_end)->startOfDay()->addDay();

        return max(1, (int) round($start->floatDiffInMonths($endExclusive)));
    }

    /**
     * VERIF-596 passe 2 (N1, ADR-0042 §1) — le plafond que CE bail exécute : celui figé avec son
     * contrat, imprimé et signé ; le réglage de l'agence du bail, sinon le global (TCK-600, verif-600
     * H1), seulement pour un bail antérieur (colonne nulle).
     */
    public function maxPctFor(Lease $lease): float
    {
        return $lease->rent_review_max_pct !== null
            ? (float) $lease->rent_review_max_pct
            : $this->resolveMaxPct($lease->agency_id); // TCK-600 (verif-600 H1)
    }

    /**
     * Resolve the lease.rent_review_max_pct setting (numeric, percentage).
     * Falls back to {@see self::DEFAULT_MAX_PCT} when missing or invalid.
     */
    public function resolveMaxPct(?int $agencyId = null): float
    {
        // TCK-600 (verif-600 H1) — le réglage de l'agence du bail, sinon le global.
        // TCK-651 (ADR-0065) — le global et le défaut viennent du catalogue.
        $value = ScopedSetting::agencyRow(self::SETTING_KEY, $agencyId)?->value
            ?? app(PlatformSettingService::class)->getValue('lease.rent_review_max_pct');
        if (is_array($value)) {
            $value = $value['value'] ?? array_values($value)[0] ?? null;
        }

        $pct = (float) $value;

        return $pct > 0 ? $pct : (float) self::DEFAULT_MAX_PCT;
    }

    /**
     * `effective_date` defaults to today when omitted; back-dating is rejected.
     */
    private function resolveEffectiveDate(?string $raw): string
    {
        if ($raw === null || trim($raw) === '') {
            return now()->toDateString();
        }

        try {
            $parsed = Carbon::parse($raw)->startOfDay();
        } catch (\Throwable) {
            throw ValidationException::withMessages([
                'effective_date' => [__('messages.lease_rent_review_effective_date_invalid')],
            ])->status(422);
        }

        if ($parsed->lt(now()->startOfDay())) {
            throw ValidationException::withMessages([
                'effective_date' => [__('messages.lease_rent_review_no_back_dating')],
            ])->status(422);
        }

        return $parsed->toDateString();
    }
}
