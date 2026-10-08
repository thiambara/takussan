<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\LeaseSignature;
use App\Models\User;
use App\Services\Lease\LandlordSignatory;
use App\Services\Lease\LeaseSignatureService;
use Illuminate\Http\Request;

class LeaseResource extends BaseResource
{
    private ?User $viewer = null;

    /**
     * TCK-596 §4B — ce que l'utilisateur courant peut faire de la signature : les rôles pour
     * lesquels il signe, et s'il peut lancer la demande. Seulement sur le détail.
     */
    public function forViewer(?User $viewer): static
    {
        $this->viewer = $viewer;

        return $this;
    }

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference_number' => $this->reference_number,
            'property_id' => $this->property_id,
            'landlord_id' => $this->landlord_id,
            'tenant_id' => $this->tenant_id,
            'agency_id' => $this->agency_id,
            'booking_id' => $this->booking_id,
            'renewed_from_lease_id' => $this->renewed_from_lease_id,
            'type' => $this->type?->value,
            'status' => $this->status?->value,
            'start_date' => $this->calendarDate($this->start_date),
            'end_date' => $this->calendarDate($this->end_date),
            'renewal_date' => $this->calendarDate($this->renewal_date),
            'monthly_rent' => $this->monthly_rent !== null ? (float) $this->monthly_rent : null,
            'sale_price' => $this->sale_price !== null ? (float) $this->sale_price : null,
            'currency' => $this->currency?->value,
            'deposit_amount' => $this->deposit_amount !== null ? (float) $this->deposit_amount : null,
            'deposit_refunded_amount' => $this->deposit_refunded_amount !== null ? (float) $this->deposit_refunded_amount : null,
            'deposit_refunded_at' => $this->iso($this->deposit_refunded_at),
            'deposit_refund_reason' => $this->deposit_refund_reason,
            'commission_rate' => $this->commission_rate !== null ? (float) $this->commission_rate : null,
            'payment_frequency' => $this->payment_frequency?->value,
            'payment_day' => $this->payment_day,
            'signed_at' => $this->iso($this->signed_at),
            'terminated_at' => $this->iso($this->terminated_at),
            // TCK-090 — early termination workflow exposed for the dashboard
            // banner / countdown / cancel button. Kept inline rather than
            // gated behind whenLoaded() because the columns are always on
            // the row, so the round-trip cost is zero.
            'early_termination_requested_at' => $this->iso($this->early_termination_requested_at),
            'early_termination_requested_by' => $this->early_termination_requested_by,
            'early_termination_effective_date' => $this->calendarDate($this->early_termination_effective_date),
            'early_termination_penalty_amount' => $this->early_termination_penalty_amount !== null
                ? (float) $this->early_termination_penalty_amount
                : null,
            'early_termination_reason' => $this->early_termination_reason,
            'early_termination_invoice_id' => $this->early_termination_invoice_id,
            'notice_period_days' => $this->notice_period_days,
            'property' => $this->whenLoaded('property', fn () => PropertyResource::make($this->property)),
            'tenant' => $this->whenLoaded('tenant', fn () => CustomerResource::make($this->tenant)),
            'renewed_from' => $this->whenLoaded('renewedFrom', fn () => self::make($this->renewedFrom)),
            'renewals' => $this->whenLoaded('renewals', fn () => self::collection($this->renewals)),
            'renewals_count' => $this->whenCounted('renewals'),
            // TCK-596 §4B (ADR-0042) — le contrat figé et les preuves de consentement. Jamais l'IP ni
            // l'agent utilisateur : ce sont des pièces de preuve, pas des données d'écran.
            'contract_sha256' => $this->contract_sha256,
            'signature_requested_at' => $this->iso($this->signature_requested_at),
            'signatures' => $this->whenLoaded('signatures', fn () => $this->signatures
                ->sortBy('signed_at')
                ->values()
                ->map(fn (LeaseSignature $s): array => [
                    'id' => $s->id,
                    'role' => $s->role,
                    'method' => $s->method,
                    'signed_at' => $this->iso($s->signed_at),
                    'document_sha256' => $s->document_sha256,
                    'current' => $this->contract_sha256 !== null && $s->document_sha256 === $this->contract_sha256,
                    'signer_name' => $s->relationLoaded('signer') ? $s->signer?->getFullNameAttribute() : null,
                    'on_behalf_of_name' => $s->relationLoaded('onBehalfOf') ? $s->onBehalfOf?->getFullNameAttribute() : null,
                    'otp_channel' => $s->otp_channel,
                ])
                ->all()),
            'can_sign_as' => $this->when($this->viewer !== null, fn (): array => LeaseSignatureService::rolesFor($this->viewer, $this->resource)),
            'can_request_signature' => $this->when($this->viewer !== null, fn (): bool => $this->viewer->can('requestSignature', $this->resource)),
            // VERIF-596 M1 — la voie papier : gestionnaire ET signataire possible pour le bailleur.
            'can_activate_on_paper' => $this->when($this->viewer !== null, fn (): bool => $this->viewer->can('update', $this->resource)
                && LandlordSignatory::allows($this->viewer, $this->resource)),
            'created_at' => $this->iso($this->created_at),
        ];
    }
}
