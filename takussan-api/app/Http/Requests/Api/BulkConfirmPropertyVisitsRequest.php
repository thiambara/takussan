<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Rules\InstantIso;
use App\Support\InstantRecu;
use Carbon\CarbonImmutable;

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
            'visits.*.scheduled_at' => ['nullable', 'date', new InstantIso, 'after:now'],
        ];
    }

    /**
     * TCK-2743 — l'heure reçue, ramenée à l'instant qu'elle désigne ({@see InstantRecu}) : la règle, la
     * comparaison et l'écriture lisent le même instant.
     *
     * @return list<array{id: int|string, scheduled_at: ?CarbonImmutable}>
     */
    public function lignes(): array
    {
        return array_map(
            fn (array $ligne): array => ['id' => $ligne['id'], 'scheduled_at' => InstantRecu::ouNul($ligne['scheduled_at'] ?? null)],
            array_values((array) $this->validated('visits')),
        );
    }
}
