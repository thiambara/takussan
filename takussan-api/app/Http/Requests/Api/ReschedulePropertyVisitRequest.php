<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Rules\CreneauDeVisite;

/**
 * TCK-590 — le visiteur propose un autre créneau. Seul le gestionnaire pouvait replanifier : le
 * client annulait et redemandait, et le quota de visites actives pouvait l'en empêcher.
 *
 * Délégation à `PropertyVisitPolicy::reschedule` (le visiteur, par compte ou par fiche client
 * liée), avant la validation.
 */
class ReschedulePropertyVisitRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('reschedule', $this->route('visit')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'scheduled_at' => ['required', 'date', 'after:now', new CreneauDeVisite],
        ];
    }
}
