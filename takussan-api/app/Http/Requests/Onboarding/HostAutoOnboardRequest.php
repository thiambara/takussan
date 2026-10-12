<?php

namespace App\Http\Requests\Onboarding;

use App\Http\Requests\BaseFormRequest;

/** TCK-633 (lot C) — le corps de `POST /api/host/individual/auto-onboard` : une ville, facultative. */
class HostAutoOnboardRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'primary_city' => ['sometimes', 'nullable', 'string', 'max:120'],
        ];
    }
}
