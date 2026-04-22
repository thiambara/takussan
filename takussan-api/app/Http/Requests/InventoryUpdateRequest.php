<?php

namespace App\Http\Requests;

use App\Models\Enums\InventoryCondition;
use App\Models\Enums\InventoryElementState;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validates edition of a draft inventory. Any subset of fields may be provided;
 * `rooms` schema follows InventoryStoreRequest (see ELEMENT_STATES).
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
            'general_condition' => ['nullable', Rule::enum(InventoryCondition::class)],
            'rooms' => ['nullable', 'array', 'min:1'],
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
