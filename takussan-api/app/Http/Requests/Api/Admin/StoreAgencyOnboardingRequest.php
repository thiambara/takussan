<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\Currency;
use App\Rules\TelephoneJoignable;
use App\Support\TelephoneSaisi;
use Illuminate\Validation\Rule;

class StoreAgencyOnboardingRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * P251.02 (TCK-2365) — le numéro du gérant se tape comme ailleurs (« +221 77 123 45 67 ») : il
     * est ramené à l'E.164 avant d'être jugé, comme à l'invitation d'un agent (TCK-1283).
     */
    protected function prepareForValidation(): void
    {
        parent::prepareForValidation();

        $admin = $this->input('admin');
        if (is_array($admin) && array_key_exists('phone', $admin)) {
            $this->merge(['admin' => [...$admin, 'phone' => TelephoneSaisi::normaliser($admin['phone'])]]);
        }
    }

    public function rules(): array
    {
        return [
            'agency' => ['required', 'array'],
            'agency.name' => ['required', 'string', 'max:255'],
            'agency.slug' => ['nullable', 'string', 'max:255', 'alpha_dash:ascii', 'unique:agencies,slug'],
            'agency.email' => ['nullable', 'email', 'max:255'],
            // TCK-1106 (P91.01) — `agencies.phone` est un `varchar(30)` : 50 laissait passer un 500.
            'agency.phone' => ['nullable', 'string', 'max:30'],
            'agency.address' => ['nullable', 'string', 'max:500'],
            // TCK-270 — let the super-admin pick the agency display currency
            // at provisioning time instead of forcing a later edit. Falls back
            // to XOF in the service when omitted.
            'agency.currency' => ['nullable', 'string', Rule::in(array_column(Currency::cases(), 'value'))],
            'admin' => ['required', 'array'],
            'admin.first_name' => ['required', 'string', 'max:255'],
            'admin.last_name' => ['required', 'string', 'max:255'],
            'admin.email' => ['required', 'email', 'max:255'],
            // P251.02 (TCK-2365, décision du porteur du 2026-10-25) — facultatif : il sert à
            // trouver le compte que le gérant aurait créé par son numéro (409 s'il est vérifié).
            'admin.phone' => ['nullable', 'string', 'max:30', new TelephoneJoignable],
            'admin.language' => ['nullable', 'string', Rule::in(['fr', 'en', 'wo'])],
        ];
    }
}
