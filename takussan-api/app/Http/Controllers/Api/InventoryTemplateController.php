<?php

namespace App\Http\Controllers\Api;

use App\Domain\Inventory\InventoryTemplates;
use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\InventoryTemplateRequest;
use App\Models\Enums\PropertyType;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2646 — le modèle Takussan d'état des lieux d'un bien, ou d'un type de bien
 * ({@see InventoryTemplates}). Il propose des pièces et leurs éléments ; l'état des lieux les garde
 * en texte libre.
 */
class InventoryTemplateController extends Controller
{
    public function index(InventoryTemplateRequest $request): JsonResponse
    {
        $property = $request->property();
        if ($property !== null) {
            $type = $property->type instanceof PropertyType ? $property->type : PropertyType::tryFrom((string) $property->type);
            $bedrooms = $property->bedrooms === null ? null : (int) $property->bedrooms;
        } else {
            $type = PropertyType::from((string) $request->validated('property_type'));
            $bedrooms = $request->validated('bedrooms') === null ? null : (int) $request->validated('bedrooms');
        }

        $key = InventoryTemplates::keyFor($type, $bedrooms);

        return $this->json([
            'data' => [
                'key' => $key,
                'property_type' => $type?->value,
                'rooms' => InventoryTemplates::rooms($key, $bedrooms),
            ],
        ]);
    }
}
