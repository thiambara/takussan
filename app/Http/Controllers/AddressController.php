<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\StoreAddressRequest;
use App\Http\Requests\UpdateAddressRequest;
use App\Models\Address;
use App\Models\Bases\Enums\UserRole;
use App\Services\Model\AddressService;
use Illuminate\Http\JsonResponse;

class AddressController extends Controller
{
    public function __construct(private AddressService $addressService)
    {
        $this->addressService = $addressService;
        $this->middleware('permission:addresses.view')->only(['index', 'show']);
        $this->middleware('permission:addresses.create')->only(['store']);
        $this->middleware('permission:addresses.edit')->only(['update']);
        $this->middleware('permission:addresses.delete')->only(['destroy']);
    }


    public function index(): JsonResponse
    {
        $query = Address::allThroughRequest();
        if (!auth()->user()->hasRole(UserRole::Admin->value)) {
            $query->whereRelation('addressable', auth()->user());
        }
        if ($search_query = request()->search_query) {
            $query->where(fn($query) => $query
                ->where('address', 'like', "%$search_query%")
                ->orWhere('city', 'like', "%$search_query%")
                ->orWhere('state', 'like', "%$search_query%")
                ->orWhere('country', 'like', "%$search_query%")
                ->orWhere('zip', 'like', "%$search_query%")
            );
        }

        return $this->json($query->paginatedThroughRequest());
    }


    public function store(StoreAddressRequest $request): JsonResponse
    {
        $data = $request->validationData();
        $address = $this->addressService->store($data);
        return $this->json($address);
    }


    public function show(Address $address): JsonResponse
    {
        return $this->json($address);
    }


    public function update(UpdateAddressRequest $request, Address $address): JsonResponse
    {
        $address = $this->addressService->update($address, $request->validationData());
        return $this->json($address);
    }


    public function destroy(Address $address): JsonResponse
    {
        $this->addressService->delete($address);
        return $this->json($address);
    }
}
