<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Enums\Capability;
use App\Models\User;
use App\Services\Payout\PayoutApprovalThreshold;
use Illuminate\Http\Request;

class AgencyResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        $seesMoneyOut = $this->seesMoneyOut($request);

        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'kind' => $this->kind?->value,
            'license_number' => $this->license_number,
            'description' => $this->description,
            'email' => $this->email,
            'phone' => $this->phone,
            'website' => $this->website,
            'commission_rate' => $this->commission_rate !== null ? (float) $this->commission_rate : null,
            'currency' => $this->currency?->value ?? 'XOF',
            // TCK-594 (ADR-0039 §4, §5) — le seuil des quatre yeux (`null` = désactivé), la TVA par
            // défaut des factures et les mentions légales que le PDF imprime.
            // VERIF-594 m-2 — le seuil ne se lit que par qui prépare ou approuve les reversements de
            // l'agence : le connaître aide à fractionner sous lui. Un étalement et non `when()` :
            // `show` appelle `toArray()` sans `resolve()`, qui laisserait la clé en place.
            ...($seesMoneyOut ? [
                'payout_approval_threshold' => $this->payout_approval_threshold !== null ? (float) $this->payout_approval_threshold : null,
                // VERIF-594 M-2 — un relâchement en attente d'un second détenteur de `payouts.approve`.
                // VERIF-594 passe 2, N-4 — une demande expirée ne se montre plus : elle ne se confirme plus.
                'pending_payout_threshold_change' => $this->pending_payout_threshold_requested_at !== null
                    && ! PayoutApprovalThreshold::isExpired($this->pending_payout_threshold_requested_at) ? [
                        'threshold' => $this->pending_payout_threshold !== null ? (float) $this->pending_payout_threshold : null,
                        'requested_by_id' => $this->pending_payout_threshold_requested_by_id,
                        'requested_at' => $this->iso($this->pending_payout_threshold_requested_at),
                        'expires_at' => $this->iso($this->pending_payout_threshold_requested_at->copy()->addDays(PayoutApprovalThreshold::REQUEST_TTL_DAYS)),
                    ] : null,
            ] : []),
            'default_tax_rate' => $this->default_tax_rate !== null ? (float) $this->default_tax_rate : null,
            'legal_name' => $this->legal_name,
            'ninea' => $this->ninea,
            'rccm' => $this->rccm,
            'legal_address' => $this->legal_address,
            'is_verified' => (bool) $this->is_verified,
            'status' => $this->status?->value,
            'properties_count' => $this->properties_count,
            'active_leases_count' => $this->active_leases_count,
            'average_rating' => $this->average_rating !== null ? (float) $this->average_rating : null,
            'reviews_count' => (int) ($this->reviews_count ?? 0), // TCK-597 — avis publiés seulement
            'logo_url' => $this->getFirstMediaUrl('logo') ?: null,
            'settings' => $this->settings ?? null,
            // TCK-269 — metadata carries `welcome.standard_unlocked_at` (read by
            // the agency-standard welcome modale) and `legal_info.*` (legal
            // fields backfilled at upgrade approval). Exposed verbatim so the
            // frontend hook can detect both without a dedicated endpoint.
            'metadata' => $this->metadata ?? null,
            'moderation_required' => (bool) ($this->moderation_required ?? false),
            'primary_admin_id' => $this->primary_admin_id,
            'created_at' => $this->iso($this->created_at),
        ];
    }

    /** VERIF-594 m-2 — détenteur de `payouts.approve` ou de `payouts.create` DANS cette agence. */
    private function seesMoneyOut(Request $request): bool
    {
        $user = $request->user();

        return $user instanceof User
            && ($user->canActAt(Capability::PayoutsApprove, $this->resource) || $user->canActAt(Capability::PayoutsCreate, $this->resource));
    }
}
