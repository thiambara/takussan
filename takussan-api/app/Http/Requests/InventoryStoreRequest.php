<?php

namespace App\Http\Requests;

use App\Models\Enums\InventoryCondition;
use App\Models\Enums\InventoryElementState;
use App\Models\Enums\InventoryType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validates creation of an inventory (check_in / check_out).
 *
 * The `rooms` JSON schema is:
 *   [
 *     {
 *       "name": "Salon",
 *       "condition": "good",           // top-level room state (InventoryCondition values)
 *       "notes": "optional",
 *       "elements": [                   // optional granular inventory of the room's items
 *         { "label": "Canapé", "state": "bon"|"usé"|"endommagé"|"manquant", "notes": "..." }
 *       ]
 *     }
 *   ]
 */
class InventoryStoreRequest extends FormRequest
{
    /**
     * P143.01 (TCK-1915) — décision du porteur (2026-10-23) : le PDF de l'état des lieux est recomposé
     * par dompdf à chaque téléchargement, et 40 × 40 éléments y épuisaient les 256M de `memory_limit`.
     * Au plafond (20 × 20, notes d'élément à 200, de pièce et générales à 1 000, libellés à 255) :
     * 25,4 s et 188 Mo mesurés. `InventoryUpdateRequest` et `takussan-web/src/lib/schemas/inventory.ts`
     * relisent ces bornes ; `InventorySizeLimitsTest` rend le PDF au plafond.
     */
    public const MAX_ROOMS = 20;

    public const MAX_ELEMENTS_PER_ROOM = 20;

    public const MAX_ELEMENT_NOTES = 200;

    public const MAX_NOTES = 1000;

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            // TCK-1070 (P62.04) — pas d'`exists:leases,id` : un bail absent rendait 422 sur ce champ là où
            // un bail tiers passait la validation. Le contrôleur rend le refus aux deux.
            'lease_id' => ['required', 'integer'],
            'type' => ['required', Rule::enum(InventoryType::class)],
            'conducted_at' => ['nullable', 'date'],
            'general_condition' => ['required', Rule::enum(InventoryCondition::class)],
            'rooms' => ['required', 'array', 'min:1', 'max:'.self::MAX_ROOMS],
            'rooms.*.name' => ['required', 'string', 'max:255'],
            'rooms.*.condition' => ['required', Rule::enum(InventoryCondition::class)],
            'rooms.*.notes' => ['nullable', 'string', 'max:'.self::MAX_NOTES],
            'rooms.*.elements' => ['nullable', 'array', 'max:'.self::MAX_ELEMENTS_PER_ROOM],
            'rooms.*.elements.*.label' => ['required_with:rooms.*.elements', 'string', 'max:255'],
            'rooms.*.elements.*.state' => ['required_with:rooms.*.elements', Rule::enum(InventoryElementState::class)],
            'rooms.*.elements.*.notes' => ['nullable', 'string', 'max:'.self::MAX_ELEMENT_NOTES],
            'notes' => ['nullable', 'string', 'max:'.self::MAX_NOTES],
        ];
    }
}
