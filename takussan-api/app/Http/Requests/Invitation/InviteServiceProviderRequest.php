<?php

namespace App\Http\Requests\Invitation;

use App\Http\Requests\BaseFormRequest;
use App\Models\MaintenanceRequest;
use App\Rules\TelephoneJoignable;
use App\Services\Maintenance\MaintenanceStateMachine;
use App\Support\TelephoneSaisi;
use Closure;

/**
 * TCK-260 — payload validation for
 * `POST /api/agencies/{agency}/service-providers/invite`.
 *
 * Authorization is performed by the controller via the policy
 * (`ServiceProviderProfilePolicy@invite`) rather than here, so super_admin
 * can short-circuit the same way it does on every other surface.
 */
class InviteServiceProviderRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * P125.04 (TCK-1283) — le numéro se tape comme le message d'erreur le montre
     * (« +221 77 123 45 67 ») ou au format national : il est ramené à l'E.164 avant que
     * `TelephoneJoignable` le juge, comme la visite et la demande de contact (TCK-590).
     */
    protected function prepareForValidation(): void
    {
        parent::prepareForValidation();

        if ($this->has('phone')) {
            $this->merge(['phone' => TelephoneSaisi::normaliser($this->input('phone'))]);
        }
    }

    public function rules(): array
    {
        return [
            // TCK-589 — drapeau `auth.phone_login.enabled` allumé, le numéro suffit
            // (lien par SMS) ; éteint, l'e-mail reste exigé.
            'email' => $this->phoneLoginEnabled()
                ? ['nullable', 'required_without:phone', 'email:rfc']
                : ['required', 'email:rfc'],
            'first_name' => ['required', 'string', 'max:80'],
            'last_name' => ['required', 'string', 'max:80'],
            // TCK-589 — un numéro qu'aucun SMS ne joint n'est plus stocké, drapeau
            // éteint comme allumé.
            'phone' => $this->phoneLoginEnabled()
                ? ['nullable', 'required_without:email', 'string', 'max:30', new TelephoneJoignable]
                : ['nullable', 'string', 'max:30', new TelephoneJoignable],
            'trades' => ['nullable', 'array'],
            'trades.*' => ['string', 'max:60'],
            'intervention_zones' => ['nullable', 'array'],
            'intervention_zones.*' => ['string', 'max:120'],
            'metadata' => ['nullable', 'array'],
            // TCK-592 (P18) — le lien profond n'emporte qu'une demande de CETTE agence, encore
            // ouverte. Un entier quelconque était renvoyé tel quel en fin d'onboarding, et le
            // prestataire atterrissait sur un 403.
            'metadata.from_maintenance_request_id' => ['nullable', 'integer', 'min:1', function (string $attribute, mixed $value, Closure $fail): void {
                $agency = $this->route('agency');
                $mr = MaintenanceRequest::query()->with('property')->find((int) $value);

                if ($mr === null
                    || $agency === null
                    || (int) $mr->property?->agency_id !== (int) $agency->id
                    || app(MaintenanceStateMachine::class)->isTerminal($mr->status)) {
                    $fail(__('maintenance.errors.invitation_request_invalid'));
                }
            }],
        ];
    }

    private function phoneLoginEnabled(): bool
    {
        return (bool) config('auth.phone_login.enabled');
    }
}
