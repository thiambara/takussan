<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\PropertyType;
use App\Models\Property;
use Illuminate\Validation\Rule;

/**
 * TCK-2646 — `GET /api/inventory-templates?property_id=` (ou `?property_type=&bedrooms=`).
 *
 * `property_id` : le bien doit être lisible par l'appelant (`view`), sinon 403 — un bien absent
 * reçoit le même refus, sans dire s'il existe (patron TCK-1070). L'autorisation court avant la
 * validation ; un `property_id` qui n'est pas un entier n'est pas cherché.
 */
class InventoryTemplateRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();
        if ($user === null) {
            return false;
        }

        $id = $this->query('property_id');
        if ($id === null || ! is_string($id) || preg_match('/^[1-9][0-9]{0,17}$/', $id) !== 1) {
            return true;
        }

        $property = Property::query()->find((int) $id);

        return $property !== null && $user->can('view', $property);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'property_id' => ['required_without:property_type', 'prohibits:property_type', 'integer', 'min:1'],
            'property_type' => ['required_without:property_id', 'string', Rule::enum(PropertyType::class)],
            'bedrooms' => ['nullable', 'prohibits:property_id', 'integer', 'min:0', 'max:50'],
        ];
    }

    public function property(): ?Property
    {
        $id = $this->validated('property_id');

        return $id === null ? null : Property::query()->find((int) $id);
    }
}
