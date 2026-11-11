<?php

namespace App\Http\Requests\Api\Me;

use App\Http\Requests\BaseFormRequest;
use App\Http\Requests\Concerns\AuthorizesTransitionally;

/**
 * TCK-2612 — `PATCH /api/me/owner-profiles/{owner_profile}/tax-id` : le NINEA tapé par le bailleur.
 *
 * Espaces tolérés et lettre en minuscule acceptée ; la forme retenue est compacte et en majuscules : 7 chiffres, puis le
 * COFI — un chiffre, une lettre, un chiffre (`0123456 7G2` → `01234567G2`). Le contrôle de forme du NINEA d'une AGENCE
 * reste différé (D-68) : cette règle ne vaut que pour la saisie du bailleur.
 *
 * L'autorisation court AVANT la validation (la règle d'`uploadKyc` du même contrôleur) : un autre compte reçoit 403, même
 * avec un corps mal formé.
 */
class UpdateOwnerTaxIdRequest extends BaseFormRequest
{
    use AuthorizesTransitionally;

    public const FORMAT = '/^[0-9]{7}[0-9][A-Z][0-9]$/';

    public function authorize(): bool
    {
        return $this->ownsProfile($this->route('owner_profile'));
    }

    protected function prepareForValidation(): void
    {
        parent::prepareForValidation();
        if (is_string($this->input('tax_id'))) {
            $this->merge(['tax_id' => mb_strtoupper((string) preg_replace('/\s+/u', '', $this->input('tax_id')))]);
        }
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'tax_id' => ['required', 'string', 'regex:'.self::FORMAT],
        ];
    }
}
