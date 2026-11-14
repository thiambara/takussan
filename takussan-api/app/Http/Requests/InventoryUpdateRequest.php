<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\BorneLesReglesDElement;
use App\Models\Enums\InventoryCondition;
use App\Models\Enums\InventoryElementState;
use App\Models\Enums\InventoryType;
use App\Models\Inventory;
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
    // TCK-2488 — une liste hors de sa borne ne fait pas valider ses éléments un à un (hérité de
    // BaseFormRequest pour les autres).
    use BorneLesReglesDElement;

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'general_condition' => ['filled', Rule::enum(InventoryCondition::class)],
            'rooms' => ['filled', 'array', 'min:1', 'max:'.InventoryStoreRequest::MAX_ROOMS],
            'rooms.*.name' => ['required_with:rooms', 'string', 'max:255'],
            'rooms.*.condition' => ['required_with:rooms', Rule::enum(InventoryCondition::class)],
            // TCK-2647 — la pièce cochée « terminée » par l'agent, à la pièce par écran ; rendue telle quelle.
            'rooms.*.completed' => ['nullable', 'boolean'],
            'rooms.*.notes' => ['nullable', 'string', 'max:'.InventoryStoreRequest::MAX_NOTES],
            'rooms.*.elements' => ['nullable', 'array', 'max:'.InventoryStoreRequest::MAX_ELEMENTS_PER_ROOM],
            'rooms.*.elements.*.label' => ['required_with:rooms.*.elements', 'string', 'max:255'],
            // TCK-2647 — un élément peut attendre son état (`null`) tant que l'état des lieux est un
            // brouillon : la création n'en fait que des brouillons, la mise à jour n'en touche pas
            // d'autre (`InventoryService::update()`, 422 `inventory.not_draft`). La soumission à
            // signature le refuse (`InventoryService::submit()`, 422 `inventory.unqualified_elements`).
            'rooms.*.elements.*.state' => ['nullable', Rule::enum(InventoryElementState::class)],
            'rooms.*.elements.*.notes' => ['nullable', 'string', 'max:'.InventoryStoreRequest::MAX_ELEMENT_NOTES],
            // TCK-2646 — la retenue proposée, sur une sortie seulement ; `entry_state` n'a pas de
            // règle : retiré par la validation, reposé par le serveur.
            'rooms.*.elements.*.retention_amount' => ['nullable', Rule::prohibitedIf(fn (): bool => ! $this->isExit()), 'numeric', 'min:0', 'max:'.InventoryStoreRequest::MAX_RETENTION],
            'rooms.*.elements.*.retention_reason' => ['nullable', Rule::prohibitedIf(fn (): bool => ! $this->isExit()), 'string', 'max:'.InventoryStoreRequest::MAX_ELEMENT_NOTES],
            'notes' => ['nullable', 'string', 'max:'.InventoryStoreRequest::MAX_NOTES],
        ];
    }

    private function isExit(): bool
    {
        $inventory = $this->route('inventory');

        return $inventory instanceof Inventory && $inventory->type === InventoryType::MoveOut;
    }
}
