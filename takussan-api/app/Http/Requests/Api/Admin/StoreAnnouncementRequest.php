<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Http\Requests\Concerns\ConvertitLesInstantsRecus;
use App\Rules\InstantIso;
use Illuminate\Validation\Rule;

class StoreAnnouncementRequest extends BaseFormRequest
{
    use ConvertitLesInstantsRecus;

    public function authorize(): bool
    {
        return $this->user()?->isSuperAdmin() ?? false;
    }

    public function rules(): array
    {
        return [
            'title' => ['required', 'array'],
            'title.fr' => ['required', 'string', 'max:160'],
            'title.en' => ['required', 'string', 'max:160'],
            'title.wo' => ['required', 'string', 'max:160'],
            'body' => ['required', 'array'],
            'body.fr' => ['required', 'string', 'max:4000'],
            'body.en' => ['required', 'string', 'max:4000'],
            'body.wo' => ['required', 'string', 'max:4000'],
            'severity' => ['required', Rule::in(['info', 'success', 'warning', 'critical'])],
            'segment' => ['nullable', 'array'],
            // TCK-2488 — borne technique : 5 cases dans `announcements.tsx`, et `profileTypes()` rend au plus 7 slugs.
            'segment.roles' => ['nullable', 'array', 'max:100'],
            'segment.roles.*' => ['string', 'max:80'],
            // TCK-2488 — borne technique : sélection multiple sans limite dans `announcements.tsx` (une requête SQL par élément).
            'segment.agency_ids' => ['nullable', 'array', 'max:1000'],
            'segment.agency_ids.*' => ['integer', Rule::exists('agencies', 'id')->withoutTrashed()],
            'segment.rollout_percentage' => ['nullable', 'integer', 'min:0', 'max:100'],
            'starts_at' => ['required', 'date', new InstantIso],
            'ends_at' => ['nullable', 'date', new InstantIso, 'after:starts_at'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }

    /** TCK-2743 — {@see ConvertitLesInstantsRecus}. */
    protected function instantsRecus(): array
    {
        return ['starts_at', 'ends_at'];
    }
}
