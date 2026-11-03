<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-2388 (ADR-0077 §4) — retoucher les deux parties écrites d'un message préparé. Un corps sans aucune des deux
 * est refusé ; chacune est ramenée à une ligne et bornée par le composeur (`ConsentMessageComposer::part()`).
 * Les bornes d'ici ne servent qu'à refuser l'absurde avant le repli.
 */
class UpdateRadarOutreachRequest extends BaseFormRequest
{
    /** Gardée par `super-admin` + `platform-can:platform.radar.operate` sur la route. */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'salutation' => ['sometimes', 'required', 'string', 'min:1', 'max:400'],
            'resume' => ['sometimes', 'required', 'string', 'min:1', 'max:1500'],
        ];
    }

    protected function passedValidation(): void
    {
        abort_code_if($this->validated() === [], 422, 'radar.outreach.nothing_to_update');
    }

    /** @return array{salutation?: string, resume?: string} */
    public function changes(): array
    {
        return $this->validated();
    }
}
