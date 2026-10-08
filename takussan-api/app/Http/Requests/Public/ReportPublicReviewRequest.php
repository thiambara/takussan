<?php

namespace App\Http\Requests\Public;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-597 (ADR-0043 §6) — signaler un avis public sans compte : un motif, et un champ piège.
 */
class ReportPublicReviewRequest extends BaseFormRequest
{
    /**
     * Route publique : pas d'autorisation à porter. `BaseFormRequest` refuse par défaut — sans
     * cette surcharge, l'endpoint rendrait 403 à tout le monde.
     */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'reason' => ['required', 'string', 'max:500'],
            'company' => ['nullable', 'string', 'max:120'], // champ piège (cf. ContactLeadPublicRequest)
        ];
    }
}
