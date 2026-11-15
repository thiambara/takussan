<?php

namespace App\Http\Requests\Agency;

use App\Http\Requests\BaseFormRequest;
use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Models\Enums\AgencyUpgradeRequestStatus;
use Closure;

/**
 * TCK-267 — payload validation for
 * `POST /api/agencies/{agency}/upgrade-requests`.
 *
 * The agency-side authorization (kind=individual, role=agency_admin
 * scoped to team_id) is performed by the controller via
 * {@see \App\Policies\AgencyUpgradeRequestPolicy@create} so super_admin
 * keeps the global Gate::before bypass.
 *
 * Multipart-only: the legal `statuts_doc` upload is mandatory (PDF or
 * image, max 10 MB). Spatie media library handles the on-disk storage
 * via the polymorphic Document attached to the request.
 *
 * TCK-2669 (ADR-0104 § 5) — `resubmit_of` reprend la DERNIÈRE demande refusée de la même agence :
 * les champs deviennent facultatifs (repris côté serveur quand ils manquent), `statuts_doc` reste
 * exigé. Toute autre demande — d'une autre agence, non refusée, ou refusée mais plus ancienne —
 * rend 422 sur `resubmit_of`.
 */
class SubmitAgencyUpgradeRequestRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $required = $this->filled('resubmit_of') ? 'nullable' : 'required';

        return [
            'resubmit_of' => ['nullable', 'integer', function (string $attribute, mixed $value, Closure $fail): void {
                if ($this->resubmitted() === null) {
                    $fail(__('agency_upgrade.submit.errors.resubmit_not_allowed'));
                }
            }],
            'rc' => [$required, 'string', 'max:60'],
            'ninea' => [$required, 'string', 'max:30'],
            'rib_pro' => [$required, 'string', 'max:60'],
            'company_legal_name' => [$required, 'string', 'max:160'],
            'address_fiscale' => [$required, 'string', 'max:255'],
            'planned_agents_count' => ['nullable', 'integer', 'min:1', 'max:10000'],
            'statuts_doc' => ['required', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:10240'],
        ];
    }

    /**
     * TCK-2669 — la demande reprise : celle que `resubmit_of` désigne, si c'est la dernière demande
     * refusée de l'agence de la route ; sinon `null`.
     */
    public function resubmitted(): ?AgencyUpgradeRequest
    {
        $agency = $this->route('agency');
        $id = $this->input('resubmit_of');
        if (! $agency instanceof Agency || ! is_numeric($id)) {
            return null;
        }

        $latest = AgencyUpgradeRequest::query()
            ->where('agency_id', $agency->id)
            ->where('status', AgencyUpgradeRequestStatus::Rejected->value)
            ->orderByDesc('submitted_at')
            ->orderByDesc('id')
            ->first();

        return $latest !== null && (int) $latest->id === (int) $id ? $latest : null;
    }

    /**
     * BaseFormRequest::prepareForValidation() trims string inputs to null
     * which would also try to recursively normalize the uploaded file.
     * We intercept and only normalize the textual fields.
     */
    protected function prepareForValidation(): void
    {
        $textOnly = collect($this->input())
            ->reject(fn ($_, string $key) => $key === 'statuts_doc')
            ->all();

        $normalized = collect($textOnly)->map(function ($value) {
            if (is_string($value)) {
                $trimmed = trim($value);

                return $trimmed === '' ? null : $trimmed;
            }

            return $value;
        })->all();

        $this->merge($normalized);
    }
}
