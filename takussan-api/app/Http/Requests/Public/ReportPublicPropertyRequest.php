<?php

namespace App\Http\Requests\Public;

use App\Http\Requests\BaseFormRequest;
use Illuminate\Validation\Rule;

/**
 * TCK-304/305 — extrait de PublicPropertyController::report(), ou les regles etaient inline.
 */
class ReportPublicPropertyRequest extends BaseFormRequest
{
    /**
     * L'autorisation reste dans le controleur / la policy (principes 1 et 2, TCK-306).
     * `BaseFormRequest` refuse par defaut : sans cette surcharge, l'endpoint rendrait 403.
     */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'reason' => ['required', Rule::in(['spam', 'misleading', 'fraud', 'inappropriate_content', 'other'])],
            'details' => ['nullable', 'string', 'max:1000'],
        ];
    }
}
