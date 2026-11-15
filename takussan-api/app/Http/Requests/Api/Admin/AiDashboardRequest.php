<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Rules\JourIso;

/** TCK-2385 — la période du tableau de bord IA, en jours civils. */
class AiDashboardRequest extends BaseFormRequest
{
    /** Lecture gardée par `platform.ai.view` sur la route. */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'from' => ['required', 'date_format:Y-m-d', new JourIso],
            'to' => ['required', 'date_format:Y-m-d', new JourIso, 'after_or_equal:from'],
        ];
    }
}
