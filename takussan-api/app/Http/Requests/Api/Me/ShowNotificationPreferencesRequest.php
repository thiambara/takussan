<?php

namespace App\Http\Requests\Api\Me;

use App\Domain\Notifications\PreferenceCatalog;
use App\Http\Requests\BaseFormRequest;
use Illuminate\Validation\Rule;

/**
 * TCK-2863 — `GET /api/me/notification-preferences` : `?persona=` filtre le catalogue sur ce que la
 * persona active reçoit. Ses propres préférences : tout compte connecté.
 */
class ShowNotificationPreferencesRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'persona' => ['sometimes', 'string', Rule::in(PreferenceCatalog::PERSONAS)],
        ];
    }
}
