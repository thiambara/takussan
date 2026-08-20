<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Search\SearchQueryRequest;
use App\Http\Resources\DocumentResource;
use App\Services\Search\DocumentSearchService;
use Illuminate\Http\JsonResponse;

class SearchDocumentController extends Controller
{
    public function __construct(
        protected DocumentSearchService $search,
    ) {}

    public function index(SearchQueryRequest $request): JsonResponse
    {
        $paginator = $this->search->search(
            $request->user(),
            $request->validated(),
        );

        return $this->paginated($paginator, DocumentResource::collection($paginator)->toArray($request));
    }
}
