<?php

namespace App\Http\Requests\Onboarding;

use App\Models\Enums\Currency;
use App\Models\Enums\PaymentProvider;
use App\Models\Enums\PropertyType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * TCK-255 — validates the body of `POST /api/host/individual/onboard`.
 *
 * Mirrors the wizard step contract (four-step flow — the "first property"
 * step has been moved out of the wizard, the user is routed to
 * `/app/properties/new` after onboarding instead):
 *   - Step 2 (Identité)  → `agency.*`, `phone_otp.*`, `preferences.*`
 *   - Step 3 (Paiement)  → `payment_setting.preferred_provider`
 *   - Step 4 (Récap)     → `cgu_accepted`
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
            // The wizard pre-verifies the OTP via PhoneVerificationController,
            // which consumes the cached code and sets `phone_verified_at`.
            // Already-verified users (registration, prior onboarding) also
            // skip the OTP UI. The service layer mirrors this: when the user
            // is already phone-verified, no fresh `code` is required.
            'phone_otp.code' => [
                $this->user()?->phone_verified_at === null ? 'required' : 'nullable',
                'string',
                'size:6',
            ],

            'preferences' => ['required', 'array'],
            'preferences.primary_property_type' => [
                'required',
                'string',
                Rule::in(array_map(fn (PropertyType $t) => $t->value, PropertyType::cases())),
            ],

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
