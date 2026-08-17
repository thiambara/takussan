<?php

namespace App\Http\Requests\Public;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-304/305 — extrait de PublicPropertyController::compare(), ou les regles etaient inline.
 */
class ComparePublicPropertyRequest extends BaseFormRequest
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
            'ids' => ['required', 'string', 'max:200'],
        ];
    }
}
