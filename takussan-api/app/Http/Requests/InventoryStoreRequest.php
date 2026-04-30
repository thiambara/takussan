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
     * @deprecated Use {@see InventoryElementState} enum instead.
     */
    public const ELEMENT_STATES = ['bon', 'usé', 'endommagé', 'manquant'];

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'lease_id' => ['required', 'integer', 'exists:leases,id'],
            'type' => ['required', Rule::enum(InventoryType::class)],
            'conducted_at' => ['nullable', 'date'],
            'general_condition' => ['required', Rule::enum(InventoryCondition::class)],
            'rooms' => ['required', 'array', 'min:1'],
            'rooms.*.name' => ['required', 'string', 'max:255'],
            'rooms.*.condition' => ['required', Rule::enum(InventoryCondition::class)],
            'rooms.*.notes' => ['nullable', 'string'],
            'rooms.*.elements' => ['nullable', 'array'],
            'rooms.*.elements.*.label' => ['required_with:rooms.*.elements', 'string', 'max:255'],
            'rooms.*.elements.*.state' => ['required_with:rooms.*.elements', Rule::enum(InventoryElementState::class)],
            'rooms.*.elements.*.notes' => ['nullable', 'string'],
            'notes' => ['nullable', 'string'],
        ];
    }
}
