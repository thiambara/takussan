<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-2585 — confirmer en lot : `visits[] = {id, scheduled_at?}`, 50 au plus, sans doublon.
 * L'autorisation se juge LIGNE PAR LIGNE dans le contrôleur, par la règle du geste unitaire
 * (`update` et `agitPourLeBien`) : une ligne refusée n'arrête pas les autres. L'heure suit
 * `ConfirmPropertyVisitRequest` (facultative, future ; exigée pour une tranche par le service).
 */
class BulkConfirmPropertyVisitsRequest extends BaseFormRequest
{
    public const MAX = 50;

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'visits' => ['required', 'array', 'min:1', 'max:'.self::MAX],
            'visits.*' => ['required', 'array:id,scheduled_at'],
            'visits.*.id' => ['required', 'integer', 'min:1', 'distinct'],
            'visits.*.scheduled_at' => ['nullable', 'date', 'after:now'],
        ];
    }
}
