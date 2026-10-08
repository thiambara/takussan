<?php

namespace App\Services\Agency;

use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Models\Enums\AgencyKind;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * TCK-269 — Carries out the actual `Agency.kind = standard` flip when a
 * super-admin has approved an {@see AgencyUpgradeRequest}.
 *
 * Responsibilities:
 *  - Set `agency.kind = standard`.
 *  - Backfill missing legal fields from the approved request. TCK-594
 *    (ADR-0039 §7) — four of them are now first-class columns
 *    ({@see self::COLUMN_OF}), which the invoice PDF prints; `rib_pro` alone
 *    still lands in `agency.metadata.legal_info` (its removal is TCK-601).
 *  - Stamp `agency.metadata.welcome.standard_unlocked_at` so the frontend
 *    can fire the "welcome to your standard agency" modale on next login.
 *  - Log the activity (`agency_kind_flipped`) with `from`/`to` properties.
 *
 * Idempotence: a second call on an already-`standard` agency throws a
 * {@see RuntimeException} so the caller can decide whether that's an
 * error (direct invocation) or a no-op (event listener safety net).
 *
 * Transactionality: the calling service ({@see AgencyUpgradeReviewService}
 * for HTTP approval flows) is expected to wrap this call in its own
 * transaction so an exception here rolls back the approval too. We open a
 * nested transaction here as well so direct callers (jobs, console
 * commands) get atomicity by default.
 */
class AgencyKindFlipService
{
    /**
     * Legal fields carried by an upgrade request. When the Agency model
     * eventually gains real columns for these we will read them off
     * `Agency::$queryFields` — for now everything below lives in
     * `metadata.legal_info`.
     *
     * @var array<int,string>
     */
    public const LEGAL_FIELDS = [
        'rc',
        'ninea',
        'rib_pro',
        'company_legal_name',
        'address_fiscale',
    ];

    /**
     * TCK-594 (ADR-0039 §7) — champ de la demande → colonne d'`agencies`. Une valeur déjà posée à
     * la main (colonne, ou à défaut `metadata.legal_info` d'avant la migration) n'est jamais
     * écrasée : la demande amorce, elle ne fait pas foi.
     *
     * @var array<string,string>
     */
    public const COLUMN_OF = [
        'rc' => 'rccm',
        'ninea' => 'ninea',
        'company_legal_name' => 'legal_name',
        'address_fiscale' => 'legal_address',
    ];

    public function flip(AgencyUpgradeRequest $request): Agency
    {
        $agency = $request->agency()->firstOrFail();

        if ($agency->kind === AgencyKind::Standard) {
            // Already standard — nothing to do. Throwing keeps the contract
            // explicit for direct callers; the listener catches and turns it
            // into a no-op so an at-least-once event delivery stays safe.
            throw new RuntimeException(sprintf(
                'Agency %d is already kind=standard; cannot flip again.',
                $agency->id,
            ));
        }

        return DB::transaction(function () use ($agency, $request): Agency {
            $previousKind = $agency->kind;

            $agency->kind = AgencyKind::Standard;

            // Backfill missing legal fields. We never overwrite a value that
            // the agency-admin already curated by hand on the agency page —
            // the upgrade request is a one-shot bootstrap, not the source of
            // truth past the flip.
            $metadata = $agency->metadata ?? [];
            $legalInfo = $metadata['legal_info'] ?? [];

            foreach (self::LEGAL_FIELDS as $field) {
                $value = $request->{$field} ?? null;
                if ($value === null || $value === '') {
                    continue;
                }

                $column = self::COLUMN_OF[$field] ?? null;
                if ($column !== null) {
                    if ($agency->{$column} === null || $agency->{$column} === '') {
                        $curated = $legalInfo[$field] ?? null;
                        $agency->{$column} = $curated !== null && $curated !== '' ? $curated : $value;
                    }

                    continue;
                }

                if (! array_key_exists($field, $legalInfo) || $legalInfo[$field] === null || $legalInfo[$field] === '') {
                    $legalInfo[$field] = $value;
                }
            }

            $metadata['legal_info'] = $legalInfo;

            // Welcome trigger marker — read by the frontend hook so the
            // "Welcome to your standard agency" modale fires once for the
            // agency_admin (welcome_views still scopes per user).
            $welcome = $metadata['welcome'] ?? [];
            $welcome['standard_unlocked_at'] = now()->toIso8601String();
            $metadata['welcome'] = $welcome;

            $agency->metadata = $metadata;
            $agency->save();

            activity('Agency')
                ->performedOn($agency)
                ->causedBy($request->reviewer)
                ->withProperties([
                    'from' => $previousKind instanceof AgencyKind ? $previousKind->value : $previousKind,
                    'to' => AgencyKind::Standard->value,
                    'upgrade_request_id' => $request->id,
                ])
                ->event('agency_kind_flipped')
                ->log('agency_kind_flipped');

            return $agency->fresh() ?? $agency;
        });
    }
}
