<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\UpsertPropertyAddressRequest;
use App\Models\Property;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PropertyAddressController extends Controller
{
    public function upsert(UpsertPropertyAddressRequest $request, Property $property): JsonResponse
    {

        $data = $request->validated();

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
        $this->authorize('update', $property);

        $property->address?->delete();

        return $this->json(null, 204);
    }
}
