<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\StoreProprietyRequest;
use App\Http\Requests\UpdateProprietyRequest;
use App\Models\Bases\Enums\UserRole;
use App\Models\Propriety;
use Illuminate\Database\Eloquent\Builder;
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
        if (!auth()->user()->hasRoles(UserRole::Admin->value)) {
            $query = $query->where('user_id', auth()->user()->id);
        }

        if ($search_query = request()->search_query) {
            $query->where(fn(Builder $query) => $query
                ->where('title', 'like', "%$search_query%")
                ->orWhere('description', 'like', "%$search_query%")
                ->orWhereRelation('bookings.customer', 'first_name', 'like', "%$search_query%")
                ->orWhereRelation('bookings.customer', 'last_name', 'like', "%$search_query%")
                ->orWhereRelation('bookings.customer', 'email', 'like', "%$search_query%")
                ->orWhereRelation('bookings.customer', 'phone', 'like', "%$search_query%")
            );
        }
        return $this->json($query->paginatedThroughRequest());
    }


    public function store(StoreProprietyRequest $request): JsonResponse
    {
        $data = $request->validationData();
        $data['status'] ??= 'active';
        $data['customer_id'] ??= auth()->user()->id;
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
