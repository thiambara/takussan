<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Services\Dashboard\DashboardOwnerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * GET /api/dashboard/owner — landlord portfolio KPIs (TCK-032 P1).
 */
class DashboardOwnerController extends Controller
{
    public function __construct(private readonly DashboardOwnerService $service) {}

    public function show(Request $request): JsonResponse
    {
        $user = $request->user();

        abort_unless(
            $user->hasRole('owner')
                || $user->hasRole(['super_admin', 'admin', 'agency_admin']),
            403,
        );

        $data = $this->service->summary($user);

        $fieldsParam = $request->input('fields.summary');
        if (is_string($fieldsParam) && $fieldsParam !== '') {
            $keep = array_map('trim', explode(',', $fieldsParam));
            $keep[] = 'owner_id';
            $keep[] = 'period';
            $data = array_intersect_key($data, array_flip($keep));
        }

        $includes = array_filter(array_map('trim', explode(',', (string) $request->input('include', ''))));

        $payload = ['data' => $data];

        if (in_array('timeseries', $includes, true)) {
            $months = (int) $request->input('months', 12);
            $payload['timeseries'] = $this->service->monthlyTimeseries($user, $months);
        }

        return $this->json($payload);
    }
}
