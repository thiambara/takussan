<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\StoreLandRequest;
use App\Http\Requests\UpdateLandRequest;
use App\Models\Land;
use Illuminate\Http\JsonResponse;

class LandController extends Controller
{

    public function __construct()
    {
    }


    public function index(): JsonResponse
    {
//        $key = (new Land)->cashBaseKey();
//        $responseData = cache()->tags([Land::class])->remember($key, 60 * 60, fn() => Land::allThroughRequest());
        $responseData = Land::allThroughRequest()->paginatedThroughRequest();
        return $this->json($responseData);
    }


    public function store(StoreLandRequest $request): JsonResponse
    {
        $data = $request->validationData();
        $land = Land::create($data);
        return $this->json($land);
    }


    public function show(Land $land): JsonResponse
    {
        return $this->json($land);
    }


    public function update(UpdateLandRequest $request, Land $land): JsonResponse
    {
        $land->update($request->validationData());
        return $this->json($land);
    }


    public function destroy(Land $land): JsonResponse
    {
        $land->delete();
        return $this->json($land);
    }
}
