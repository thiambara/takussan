<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\AlertSubscriber;
use App\Services\Notifications\Sms\PhoneNumber;
use App\Support\SavedSearchCriteria;
use Closure;

/**
 * TCK-599 (ADR-0050 §4) — une alerte demandée sans compte. Même vocabulaire fermé que la
 * recherche d'un compte ; WhatsApp n'est accepté que derrière son drapeau.
 *
 * ⚠ Aucune règle ne consulte la base : une erreur de validation ne doit jamais dire si un contact
 * est déjà connu (contrainte 4).
 */
class StorePublicSearchAlertRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $channels = config('search_alerts.whatsapp_enabled')
            ? AlertSubscriber::CHANNELS
            : [AlertSubscriber::CHANNEL_EMAIL];

        return SavedSearchCriteria::rules('required') + [
            'name' => ['sometimes', 'nullable', 'string', 'max:100'],
            'frequency' => ['required', 'in:daily,weekly'],
            'channel' => ['required', 'in:'.implode(',', $channels)],
            'email' => ['required_if:channel,'.AlertSubscriber::CHANNEL_EMAIL, 'nullable', 'email:rfc', 'max:254'],
            'phone' => [
                'required_if:channel,'.AlertSubscriber::CHANNEL_WHATSAPP, 'nullable', 'string', 'max:20',
                function (string $attribute, mixed $value, Closure $fail): void {
                    if (is_string($value) && $value !== '' && ! PhoneNumber::isValid(preg_replace('/\s+/', '', $value) ?? '')) {
                        $fail('validation.rules.phone_e164')->translate();
                    }
                },
            ],
            'locale' => ['required', 'in:fr,en,wo'],
            'consent' => ['accepted'],
        ];
    }

    /** Le contact du canal choisi, tel que saisi. */
    public function contact(): string
    {
        return (string) ($this->validated('channel') === AlertSubscriber::CHANNEL_WHATSAPP
            ? $this->validated('phone')
            : $this->validated('email'));
    }
}
