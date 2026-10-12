<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\ReplacePropertyContactsRequest;
use App\Models\Property;
use App\Models\PropertyContact;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** TCK-633 (lot C) — lire et REMPLACER les contacts sur place d'un bien. */
class PropertyContactController extends Controller
{
    public function index(Request $request, Property $property): JsonResponse
    {
        $this->authorize('update', $property);

        return $this->json(['data' => $this->lignes($property)]);
    }

    public function replace(ReplacePropertyContactsRequest $request, Property $property): JsonResponse
    {
        $contacts = array_values((array) $request->validated('contacts'));

        DB::transaction(function () use ($property, $contacts): void {
            // Deux remplacements simultanés se sérialisent sur la ligne du bien (piège n° 2) :
            // sans ce verrou, deux listes de 3 pouvaient en faire 6.
            Property::query()->whereKey($property->getKey())->lockForUpdate()->firstOrFail();
            $property->contacts()->delete();

            foreach ($contacts as $position => $contact) {
                $label = isset($contact['label']) ? trim((string) $contact['label']) : '';
                $property->contacts()->create([
                    'label' => $label !== '' ? $label : null,
                    'phone' => (string) $contact['phone'],
                    'has_whatsapp' => (bool) ($contact['has_whatsapp'] ?? false),
                    'position' => $position,
                ]);
            }
        });

        return $this->json(['data' => $this->lignes($property)]);
    }

    /** @return list<array{id: int, label: ?string, phone: string, has_whatsapp: bool, position: int}> */
    private function lignes(Property $property): array
    {
        return $property->contacts()->get()
            ->map(fn (PropertyContact $c) => [
                'id' => $c->id,
                'label' => $c->label,
                'phone' => $c->phone,
                'has_whatsapp' => $c->has_whatsapp,
                'position' => $c->position,
            ])
            ->values()
            ->all();
    }
}
