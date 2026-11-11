<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Customer;
use App\Models\Enums\ContactGestureChannel;
use App\Models\PropertyContactLead;
use Illuminate\Validation\Rule;

/**
 * TCK-2583 — un geste de contact (appel, WhatsApp, e-mail, SMS) sur une demande ou une fiche.
 *
 * L'autorisation précède la validation : délégation à `PropertyContactLeadPolicy::contact` pour
 * une demande, à `CustomerPolicy::update` pour une fiche.
 */
class StoreContactGestureRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        $lead = $this->route('lead');
        if ($lead instanceof PropertyContactLead) {
            return $this->user()?->can('contact', $lead) === true;
        }

        $customer = $this->route('customer');

        return $customer instanceof Customer && $this->user()?->can('update', $customer) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'channel' => ['required', 'string', Rule::enum(ContactGestureChannel::class)],
        ];
    }

    public function channel(): ContactGestureChannel
    {
        return ContactGestureChannel::from((string) $this->validated('channel'));
    }
}
