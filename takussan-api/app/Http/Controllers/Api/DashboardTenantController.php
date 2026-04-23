<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Services\Dashboard\DashboardTenantService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * GET /api/dashboard/tenant — next payments, lease, recent docs (TCK-032 P1).
 */
class DashboardTenantController extends Controller
{
    public function __construct(private readonly DashboardTenantService $service) {}

    public function show(Request $request): JsonResponse
    {
        $user = $request->user();

        $data = $this->service->summary($user);

        $fieldsParam = $request->input('fields.summary');
        if (is_string($fieldsParam) && $fieldsParam !== '') {
            $keep = array_map('trim', explode(',', $fieldsParam));
            $keep[] = 'tenant_id';
            $keep[] = 'customer_id';
            $keep[] = 'has_customer_profile';
            $data = array_intersect_key($data, array_flip($keep));
        }

        return $this->json(['data' => $data]);
    }
}
