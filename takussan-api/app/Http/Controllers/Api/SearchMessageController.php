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

        return $this->paginated($paginator, MessageResource::collection($paginator)->toArray($request));
    }
}
