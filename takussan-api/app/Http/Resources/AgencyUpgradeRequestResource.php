<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Services\Kyc\SharedLegalIdentifierDetector;
use App\Support\Masking;
use Illuminate\Http\Request;

/**
 * TCK-267 — JSON envelope for `AgencyUpgradeRequest`.
 *
 * Pure read model — the FE consumes the same shape from `index` and
 * `submit`. Sensitive document URLs are intentionally not exposed here;
 * the super-admin review surface (TCK-268) will fetch them via the
 * media endpoints with a stricter policy.
 *
 * TCK-601 (ADR-0044 §1, verif-601 M1) — `ninea` et `rib_pro` sortent MASQUÉS partout : listes,
 * soumission, décisions. Seul le détail de la console les rend en clair, par
 * {@see self::withClearIdentifiers()}, et il trace la consultation (`personal_data_viewed`).
 */
class AgencyUpgradeRequestResource extends BaseResource
{
    private bool $clearIdentifiers = false;

    /** Le détail console seulement, qui journalise la consultation avant de rendre. */
    public function withClearIdentifiers(): static
    {
        $this->clearIdentifiers = true;

        return $this;
    }

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'agency_id' => $this->agency_id,
            'submitted_by' => $this->submitted_by,
            'rc' => $this->rc,
            'ninea' => $this->identifier($this->ninea, Masking::tail(...)),
            'rib_pro' => $this->identifier($this->rib_pro, Masking::iban(...)),
            'company_legal_name' => $this->company_legal_name,
            'address_fiscale' => $this->address_fiscale,
            'planned_agents_count' => $this->planned_agents_count,
            'status' => $this->status?->value,
            'submitted_at' => $this->iso($this->submitted_at),
            'reviewed_by' => $this->reviewed_by,
            'reviewed_at' => $this->iso($this->reviewed_at),
            'review_comment' => $this->review_comment,
            'created_at' => $this->iso($this->created_at),
            'updated_at' => $this->iso($this->updated_at),
            // TCK-601 (C) — au super-admin SEUL : un autre identifiant d'agence qui coïncide est un
            // signal de revue, et l'admin de l'agence n'a pas à savoir qui d'autre porte ce RIB.
            'shared_identifiers' => $this->when(
                $request->user()?->isSuperAdmin() === true,
                fn () => SharedLegalIdentifierDetector::forRequestCycle($request)->forRequest($this->resource),
            ),
        ];
    }

    /** @param  callable(string): string  $mask */
    private function identifier(mixed $value, callable $mask): ?string
    {
        if (! is_string($value) || $value === '') {
            return null;
        }

        return $this->clearIdentifiers ? $value : $mask($value);
    }
}
