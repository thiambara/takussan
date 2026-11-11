<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\PropertyContactLead;
use Illuminate\Validation\Rule;

/**
 * TCK-2583 — `GET /api/contact-leads/response-stats`. Délégation à
 * `PropertyContactLeadPolicy::viewResponseStats` : le personnel qui détient `crm.view_all`. Le
 * super-admin, qui n'a pas d'agence, la nomme par `agency_id`.
 */
class ContactLeadResponseStatsRequest extends BaseFormRequest
{
    public const DEFAULT_PERIOD_DAYS = 30;

    public function authorize(): bool
    {
        return $this->user()?->can('viewResponseStats', PropertyContactLead::class) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'period' => ['nullable', 'integer', 'min:1', 'max:365'],
            // Vérification adverse de TCK-2583 : hors super-admin, `agency_id` est INTERDIT (422) — la
            // portée est l'agence active de l'appelant, jamais un paramètre qu'il choisit.
            'agency_id' => $this->user()?->isSuperAdmin() === true
                ? ['required', 'integer', Rule::exists('agencies', 'id')->withoutTrashed()]
                : ['prohibited'],
        ];
    }

    public function periodDays(): int
    {
        return (int) ($this->validated('period') ?? self::DEFAULT_PERIOD_DAYS);
    }
}
