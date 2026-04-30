<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Search\SearchQueryRequest;
use App\Http\Resources\MessageResource;
use App\Services\Search\MessageSearchService;
use Illuminate\Http\JsonResponse;

class SearchMessageController extends Controller
{
    public function __construct(
        protected MessageSearchService $search,
    ) {}

    public function index(SearchQueryRequest $request): JsonResponse
    {
        $paginator = $this->search->search(
            $request->user(),
            $request->validated(),
        );

        return $this->json([
            'data' => MessageResource::collection($paginator)->toArray($request),
            'meta' => [
                'total' => $paginator->total(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
            ],
        ]);
    }
}
