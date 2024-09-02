<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\StoreCustomerRequest;
use App\Http\Requests\UpdateCustomerRequest;
use App\Models\Bases\Enums\UserRoles;
use App\Models\User as Customer;
use Hash;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Str;

class CustomerController extends Controller
{

    public function __construct()
    {
    }

    public function index(): JsonResponse
    {
        $query = Customer::allThroughRequest()->whereJsonContains('roles', UserRoles::CUSTOMER);
        if (!auth()->user()->hasRoles(UserRoles::ADMIN)) {
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
        if (!isset($data['roles'])) {
            $data['roles'] = [];
        }
        $data['roles'][] = UserRoles::CUSTOMER;
        if (!isset($data['added_by_id'])) {
//            if (!auth()->user()->id) {
//                abort(403, 'You are not allowed to add a customer 1');
//            }
            $data['added_by_id'] = auth()->user()->id;
        }
//        abort(403, 'You are not allowed to add a customer 2');

        // define a default random password
        if (!isset($data['password'])) {
            $data['password'] = Hash::make(Str::password(15));
        }
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
