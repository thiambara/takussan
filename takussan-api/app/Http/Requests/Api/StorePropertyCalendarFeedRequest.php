<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-596 §3B (ADR-0041) — importer un flux iCal externe pour un bien. La forme de l'URL est jugée
 * ici ; sa destination (HTTPS, adresse publique) l'est par `SafeOutboundUrl`, sans requête.
 */
class StorePropertyCalendarFeedRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('update', $this->route('property')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'url' => ['required', 'string', 'max:2048', 'url:https'],
            'label' => ['nullable', 'string', 'max:120'],
        ];
    }
}
