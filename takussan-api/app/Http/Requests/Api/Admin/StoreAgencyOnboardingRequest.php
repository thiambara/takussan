<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\Currency;
use Illuminate\Validation\Rule;

class StoreAgencyOnboardingRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'agency' => ['required', 'array'],
            'agency.name' => ['required', 'string', 'max:255'],
            'agency.slug' => ['nullable', 'string', 'max:255', 'alpha_dash:ascii', 'unique:agencies,slug'],
            'agency.type' => ['nullable', 'string', 'max:80'],
            'agency.email' => ['nullable', 'email', 'max:255'],
            'agency.phone' => ['nullable', 'string', 'max:50'],
            'agency.address' => ['nullable', 'string', 'max:500'],
            // TCK-270 — let the super-admin pick the agency display currency
            // at provisioning time instead of forcing a later edit. Falls back
            // to XOF in the service when omitted.
            'agency.currency' => ['nullable', 'string', Rule::in(array_column(Currency::cases(), 'value'))],
            'admin' => ['required', 'array'],
            'admin.first_name' => ['required', 'string', 'max:255'],
            'admin.last_name' => ['required', 'string', 'max:255'],
            'admin.email' => ['required', 'email', 'max:255'],
            'admin.language' => ['nullable', 'string', Rule::in(['fr', 'en', 'wo'])],
        ];
    }
}
