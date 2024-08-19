<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\StoreAddressRequest;
use App\Http\Requests\UpdateAddressRequest;
use App\Models\Address;
use Illuminate\Http\JsonResponse;

class AddressController extends Controller
{

    public function __construct()
    {
    }


    public function index(): JsonResponse
    {
//        $key = (new Address)->cashBaseKey();
//        $responseData = cache()->tags([Address::class])->remember($key, 60 * 60, fn() => Address::allThroughRequest());
        $responseData = Address::allThroughRequest()->paginatedThroughRequest();
        return $this->json($responseData);
    }


    public function store(StoreAddressRequest $request): JsonResponse
    {
        $data = $request->validationData();
        $address = Address::create($data);
        return $this->json($address);
    }


    public function show(Address $address): JsonResponse
    {
        return $this->json($address);
    }


    public function update(UpdateAddressRequest $request, Address $address): JsonResponse
    {
        $address->update($request->validationData());
        return $this->json($address);
    }


    public function destroy(Address $address): JsonResponse
    {
        $address->delete();
        return $this->json($address);
    }
}
