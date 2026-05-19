<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Base\Controller;
use App\Models\Enums\PropertyType;
use App\Models\Property;
use Illuminate\Http\JsonResponse;

class PublicPropertyTypeController extends Controller
{
    public function index(): JsonResponse
    {
        $counts = Property::query()
            ->public()
            ->selectRaw('type, count(*) as cnt')
            ->groupBy('type')
            ->pluck('cnt', 'type')
            ->toArray();

        $data = array_map(
            fn (PropertyType $type) => [
                'value' => $type->value,
                'count' => (int) ($counts[$type->value] ?? 0),
            ],
            PropertyType::cases(),
        );

        return response()->json(['data' => $data]);
    }
}
