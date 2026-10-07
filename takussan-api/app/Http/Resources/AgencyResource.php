<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

class AgencyResource extends BaseResource
{
    public function toArray(Request $request): array
    {
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
            'payout_approval_threshold' => $this->payout_approval_threshold !== null ? (float) $this->payout_approval_threshold : null,
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
}
