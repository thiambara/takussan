<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\StoreProprietyRequest;
use App\Http\Requests\UpdateProprietyRequest;
use App\Models\Propriety;
use Illuminate\Http\JsonResponse;

class ProprietyController extends Controller
{

    public function __construct()
    {
    }


    public function index(): JsonResponse
    {
//        $key = (new Propriety)->cashBaseKey();
//        $responseData = cache()->tags([Propriety::class])->remember($key, 60 * 60, fn() => Propriety::allThroughRequest());
        $query = Propriety::allThroughRequest();
        return $this->json($query->paginatedThroughRequest());
    }


    public function store(StoreProprietyRequest $request): JsonResponse
    {
        $data = $request->validationData();
        $propriety = Propriety::create($data);
        return $this->json($propriety);
    }


    public function show(Propriety $propriety): JsonResponse
    {
        return $this->json($propriety);
    }


    public function update(UpdateProprietyRequest $request, Propriety $propriety): JsonResponse
    {
        $propriety->update($request->validationData());
        return $this->json($propriety);
    }


    public function destroy(Propriety $propriety): JsonResponse
    {
        $propriety->delete();
        return $this->json($propriety);
    }
}
