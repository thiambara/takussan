<?php

namespace App\Http\Requests\Onboarding;

use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentProvider;
use App\Models\Enums\PropertyType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * TCK-255 — validates the body of `POST /api/host/individual/onboard`.
 *
 * Mirrors the wizard step contract:
 *   - Step 2 (Identité)         → `agency.*`, `phone_otp.*`, `preferences.*`
 *   - Step 3 (Premier bien)     → `first_property_draft.*`
 *   - Step 4 (Paiement)         → `payment_setting.preferred_provider`
 *   - Step 5 (Récap)            → `cgu_accepted`
 *
 * The `cgu_accepted` flag must be true — the wizard disables the publish
 * button until the user ticks the box; we reject server-side too because
 * the front contract isn't a security boundary.
 */
class HostIndividualOnboardRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'agency' => ['required', 'array'],
            'agency.name' => ['required', 'string', 'max:160'],
            'agency.primary_city' => ['required', 'string', 'max:120'],
            'agency.currency' => [
                'required',
                'string',
                Rule::in(array_map(fn (Currency $c) => $c->value, Currency::cases())),
            ],

            'phone_otp' => ['required', 'array'],
            'phone_otp.phone' => ['required', 'string', 'max:32'],
            'phone_otp.code' => ['required', 'string', 'size:6'],

            'preferences' => ['required', 'array'],
            'preferences.primary_property_type' => [
                'required',
                'string',
                Rule::in(array_map(fn (PropertyType $t) => $t->value, PropertyType::cases())),
            ],

            'first_property_draft' => ['required', 'array'],
            'first_property_draft.title' => ['required', 'string', 'max:200'],
            'first_property_draft.type' => [
                'required',
                'string',
                Rule::in(array_map(fn (PropertyType $t) => $t->value, PropertyType::cases())),
            ],
            'first_property_draft.city' => ['required', 'string', 'max:120'],
            'first_property_draft.contract_type' => [
                'required',
                'string',
                Rule::in(array_map(fn (ContractType $c) => $c->value, ContractType::cases())),
            ],
            'first_property_draft.price' => ['required', 'numeric', 'min:0'],

            'payment_setting' => ['required', 'array'],
            'payment_setting.preferred_provider' => [
                'required',
                'string',
                Rule::in(array_map(fn (PaymentProvider $p) => $p->value, PaymentProvider::cases())),
            ],

            'cgu_accepted' => ['required', 'accepted'],
        ];
    }

    public function messages(): array
    {
        return [
            'cgu_accepted.accepted' => __('onboarding.host_individual.errors.cgu_required'),
        ];
    }
}
