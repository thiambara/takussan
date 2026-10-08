<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\GlobalSearchRequest;
use App\Services\Admin\AdminGlobalSearchService;
use Illuminate\Http\JsonResponse;

/**
 * TCK-600 (S19) — la recherche transverse de la console : un compte, une agence, un bien, une
 * réservation, un bail, un paiement, une facture ou un reversement, depuis n'importe quelle page.
 */
class GlobalSearchController extends Controller
{
    public function __construct(private readonly AdminGlobalSearchService $search) {}

    public function __invoke(GlobalSearchRequest $request): JsonResponse
    {
        return $this->json(['data' => $this->search->search((string) $request->validated('q'), $request->user())]);
    }
}
