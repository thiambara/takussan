<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-2502 — confirmer une visite peut en fixer l'heure (`scheduled_at`, facultatif). Pour une
 * visite demandée par tranche (`preferred_window`), l'heure est exigée : c'est
 * `VisitSchedulingService::confirmOrFail` qui le dit (422 `visit.time_required`), sous le verrou de
 * la ligne, pas cette règle — elle ne voit pas la visite relue.
 *
 * L'heure fixée par l'agent n'est pas soumise à la grille des créneaux du visiteur
 * (`CreneauDeVisite`) : même règle que `UpdatePropertyVisitRequest`.
 */
class ConfirmPropertyVisitRequest extends BaseFormRequest
{
    /** Délégation : la règle de `update` que le contrôleur jugeait déjà avant tout. */
    public function authorize(): bool
    {
        return $this->user()?->can('update', $this->route('visit')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'scheduled_at' => ['nullable', 'date', 'after:now'],
        ];
    }
}
