<?php

namespace App\Services\Lease;

use App\Events\Lease\LeaseRentReviewed;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * TCK-091 — Rent review on an active lease.
 *
 * The new rent is applied immediately to the lease row; effective_date
 * is recorded in the activity log so the rent-schedule generator (TCK-027)
 * can use it as a cut-off when materializing future {@see LeasePayment}
 * rows. Already-issued rent payments are NOT amended retroactively.
 *
 * Variations above the configured threshold (default 20 %) require the
 * `force=true` flag AND the `leases.rent_review_force` Spatie permission;
 * a tenant-facing notification fires on every successful review.
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
            $maxPct = $this->resolveMaxPct();
            if ($variationPct > $maxPct + 0.0001) {
                if (! $force) {
                    throw ValidationException::withMessages([
                        'new_rent' => [__('messages.lease_rent_review_variation_excessive', [
                            'max' => (string) $maxPct,
                            'variation' => number_format($variationPct, 2),
                        ])],
                    ])->status(422);
                }
                if (! $actor->can('leases.rent_review_force')) {
                    throw ValidationException::withMessages([
                        'force' => [__('messages.lease_rent_review_force_not_allowed')],
                    ])->status(422);
                }
            }

            $lease->forceFill(['monthly_rent' => $newRent])->save();

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
     * Resolve the lease.rent_review_max_pct setting (numeric, percentage).
     * Falls back to {@see self::DEFAULT_MAX_PCT} when missing or invalid.
     */
    public function resolveMaxPct(): float
    {
        $row = Setting::query()->where('key', self::SETTING_KEY)->first();
        if ($row === null) {
            return (float) self::DEFAULT_MAX_PCT;
        }

        $value = $row->value;
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
