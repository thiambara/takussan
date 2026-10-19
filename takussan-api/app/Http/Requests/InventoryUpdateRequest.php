<?php

namespace App\Http\Requests;

use App\Models\Enums\InventoryCondition;
use App\Models\Enums\InventoryElementState;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validates edition of a draft inventory. Any subset of fields may be provided;
 * `rooms` schema follows InventoryStoreRequest (see InventoryElementState enum).
 *
 * `general_condition` and `rooms` are `filled`, not `nullable`: both columns are NOT NULL
 * without default, so a null cannot clear them and must be a 422 (TCK-980). `notes` keeps
 * its nullable clear.
 */
class InventoryUpdateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'general_condition' => ['filled', Rule::enum(InventoryCondition::class)],
            'rooms' => ['filled', 'array', 'min:1'],
            'rooms.*.name' => ['required_with:rooms', 'string', 'max:255'],
            'rooms.*.condition' => ['required_with:rooms', Rule::enum(InventoryCondition::class)],
            'rooms.*.notes' => ['nullable', 'string'],
            'rooms.*.elements' => ['nullable', 'array'],
            'rooms.*.elements.*.label' => ['required_with:rooms.*.elements', 'string', 'max:255'],
            'rooms.*.elements.*.state' => ['required_with:rooms.*.elements', Rule::enum(InventoryElementState::class)],
            'rooms.*.elements.*.notes' => ['nullable', 'string'],
            'notes' => ['nullable', 'string'],
        ];
    }
}
