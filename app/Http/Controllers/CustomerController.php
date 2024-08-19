<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\StoreCustomerRequest;
use App\Http\Requests\UpdateCustomerRequest;
use App\Models\Bases\Enums\UserRoles;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;

class CustomerController extends Controller
{

    public function __construct()
    {
    }

    public function index(): JsonResponse
    {
        $query = User::allThroughRequest()->where('type', UserRoles::CUSTOMER);
        if (auth()->user()->type !== 'admin') {
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
        $customer = User::create($data);
        $customer->save();
        return $this->json($customer);
    }

    public function show(User $customer): JsonResponse
    {
        return $this->json($customer);
    }

    public function update(UpdateCustomerRequest $request, User $customer): JsonResponse
    {
        $customer->update($request->validationData());
        return $this->json($customer);
    }

    public function destroy(User $customer): JsonResponse
    {
        $customer->delete();
        return $this->json($customer);
    }

}
