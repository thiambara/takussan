<?php

namespace App\Http\Requests\Agency;

use App\Http\Requests\BaseFormRequest;

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
 */
class SubmitAgencyUpgradeRequestRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'rc' => ['required', 'string', 'max:60'],
            'ninea' => ['required', 'string', 'max:30'],
            'rib_pro' => ['required', 'string', 'max:60'],
            'company_legal_name' => ['required', 'string', 'max:160'],
            'address_fiscale' => ['required', 'string', 'max:255'],
            'planned_agents_count' => ['nullable', 'integer', 'min:1', 'max:10000'],
            'statuts_doc' => ['required', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:10240'],
        ];
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
