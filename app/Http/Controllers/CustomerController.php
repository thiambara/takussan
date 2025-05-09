<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\StoreCustomerRequest;
use App\Http\Requests\UpdateCustomerRequest;
use App\Models\Bases\Enums\UserRole;
use App\Models\Customer;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;

class CustomerController extends Controller
{

    public function __construct()
    {
    }

    public function index(): JsonResponse
    {
        $query = Customer::allThroughRequest();
        if (!auth()->user()->hasRoles(UserRole::Admin->value)) {
            $query->where('added_by_id', auth()->user()->id);
        }

        if ($search_query = request()->search_query) {
            $query->where(fn(Builder $query) => $query
                ->where('first_name', 'like', "%$search_query%")
                ->orWhere('last_name', 'like', "%$search_query%")
                ->orWhere('username', 'like', "%$search_query%")
                ->orWhere('email', 'like', "%$search_query%")
                ->orWhere('phone', 'like', "%$search_query%")
            );
        }
        return $this->json($query->paginatedThroughRequest());
    }

    public function store(StoreCustomerRequest $request)
    {
        $data = $request->validationData();
        $data['added_by_id'] = auth()->user()->id;

        $customer = Customer::create($data);
        $customer->save();
        return $this->json($customer);
    }

    public function show(Customer $customer): JsonResponse
    {
        return $this->json($customer);
    }

    public function update(UpdateCustomerRequest $request, Customer $customer): JsonResponse
    {
        $customer->update($request->validationData());
        return $this->json($customer);
    }

    public function destroy(Customer $customer): JsonResponse
    {
        $customer->delete();
        return $this->json($customer);
    }

}
