<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Support\InstantRecu;
use Carbon\CarbonImmutable;

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

    /**
     * TCK-2743 — l'heure reçue, ramenée à l'instant qu'elle désigne ({@see InstantRecu}) : la règle, la
     * comparaison et l'écriture lisent le même instant.
     */
    public function scheduledAt(): ?CarbonImmutable
    {
        return InstantRecu::ouNul($this->validated('scheduled_at'));
    }
}
