<?php

namespace App\Http\Requests;

use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * TCK-591 §7 — `POST /api/properties/bulk-visibility` : DÉPUBLIER en lot, et seulement cela.
 *
 * Pas de publication en lot : la modération s'applique bien par bien (Contraintes 2). Un
 * identifiant inconnu n'est pas une erreur de validation : il revient en `not_found` dans le bilan,
 * comme un refus — le front garde sélectionnés les seuls refus.
 */
class PropertyBulkVisibilityRequest extends FormRequest
{
    /** TCK-817 (P22.02) — la capacité de l'action unitaire à l'agence active, avant toute validation. */
    public function authorize(): bool
    {
        return $this->user()?->can('bulkPublish', Property::class) === true;
    }

    public function rules(): array
    {
        return [
            'property_ids' => ['required', 'array', 'min:1', 'max:100'],
            'property_ids.*' => ['integer', 'distinct'],
            'visibility' => ['required', Rule::in([PropertyVisibility::Private->value])],
        ];
    }
}
