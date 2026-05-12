<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Property;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PropertyAddressController extends Controller
{
    public function upsert(Request $request, Property $property): JsonResponse
    {
        $this->authorizeManage($request, $property);

        $data = $request->validate([
            'label' => ['nullable', 'string', 'max:255'],
            'street' => ['nullable', 'string', 'max:255'],
            'neighborhood' => ['nullable', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:255'],
            'region' => ['nullable', 'string', 'max:255'],
            'country' => ['nullable', 'string', 'size:2'],
            'postal_code' => ['nullable', 'string', 'max:20'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'metadata' => ['nullable', 'array'],
        ]);

        $created = $property->address === null;

        $address = $property->address
            ? tap($property->address)->update($data)
            : $property->address()->create($data);

        return $this->json(
            ['data' => $address->refresh()],
            $created ? 201 : 200,
        );
    }

    public function destroy(Request $request, Property $property): JsonResponse
    {
        $this->authorizeManage($request, $property);

        $property->address?->delete();

        return $this->json(null, 204);
    }

    protected function authorizeManage(Request $request, Property $property): void
    {
        $user = $request->user();
        $ok = $user->id === $property->user_id
            || ($user->agency_id && $user->agency_id === $property->agency_id)
            || $user->hasRole('super_admin');
        abort_unless($ok, 403);
    }
}
