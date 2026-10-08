<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Services\Calendar\CalendarEventCollector;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * TCK-305 — extrait de CalendarController::index(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class IndexCalendarRequest extends BaseFormRequest
{
    /**
     * L'autorisation NE migre PAS ici : elle appartient au contrôleur puis aux policies
     * (principes non négociables 1 et 2, et TCK-306). `BaseFormRequest` refuse par défaut —
     * *fail-closed* — donc sans cette surcharge l'endpoint rendrait 403 pour tout le monde.
     */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'property_id' => ['sometimes', 'integer', 'exists:properties,id'],
            // TCK-078 — admin multi-property view supports `property_ids[]`.
            'property_ids' => ['sometimes', 'array'],
            'property_ids.*' => ['integer', 'exists:properties,id'],
            // TCK-078 — admin-only cross-agency view.
            'agency_id' => ['sometimes', 'integer', 'exists:agencies,id'],
            'types' => ['sometimes', 'array'],
            // TCK-591 — tâches, échéances de bail et interventions s'ajoutent aux deux types d'origine.
            'types.*' => ['string', Rule::in(CalendarEventCollector::TYPES)],
            // TCK-591 — « Mes rendez-vous » : ce qui m'est assigné (visite, tâche, intervention).
            'mine' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * TCK-591 — une fenêtre de plus de {@see self::MAX_WINDOW_DAYS} jours est refusée : six mois
     * d'agenda suffisent à un écran comme à un abonnement, et la requête n'a pas de pagination.
     */
    public const MAX_WINDOW_DAYS = 186;

    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($validator->errors()->hasAny(['start_date', 'end_date'])) {
                    return;
                }
                $start = Carbon::parse((string) $this->input('start_date'));
                $end = Carbon::parse((string) $this->input('end_date'));
                if ($start->diffInDays($end) > self::MAX_WINDOW_DAYS) {
                    $validator->errors()->add('end_date', __('calendar.errors.window_too_long', ['days' => self::MAX_WINDOW_DAYS]));
                }
            },
        ];
    }
}
