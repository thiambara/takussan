<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-589 — `POST /auth/two-factor/step-up` : un code TOTP frais, porté ensuite par
 * le jeton de la requête pendant 10 minutes (ADR-0033, contrainte 9).
 */
class StepUpTwoFactorRequest extends BaseFormRequest
{
    /** L'autorisation reste au contrôleur (cf. `ConfirmTwoFactorRequest`). */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'code' => ['required', 'string'],
        ];
    }
}
