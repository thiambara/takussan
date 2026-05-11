<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * TCK-267 — JSON envelope for `AgencyUpgradeRequest`.
 *
 * Pure read model — the FE consumes the same shape from `index` and
 * `submit`. Sensitive document URLs are intentionally not exposed here;
 * the super-admin review surface (TCK-268) will fetch them via the
 * media endpoints with a stricter policy.
 */
class AgencyUpgradeRequestResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'agency_id' => $this->agency_id,
            'submitted_by' => $this->submitted_by,
            'rc' => $this->rc,
            'ninea' => $this->ninea,
            'rib_pro' => $this->rib_pro,
            'company_legal_name' => $this->company_legal_name,
            'address_fiscale' => $this->address_fiscale,
            'planned_agents_count' => $this->planned_agents_count,
            'status' => $this->status?->value,
            'submitted_at' => $this->submitted_at?->toIso8601String(),
            'reviewed_by' => $this->reviewed_by,
            'reviewed_at' => $this->reviewed_at?->toIso8601String(),
            'review_comment' => $this->review_comment,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
