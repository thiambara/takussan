<?php

namespace App\Http\Controllers\Api\Me;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\Api\Admin\PlatformPayoutResource;
use App\Models\PlatformPayout;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PlatformPayoutController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $agencyId = $request->activeProfile()?->agency_id ?? $request->user()->agency_id;
        abort_unless($agencyId, 404, 'No active agency profile.');

        // Force the agency scope before handing off to spatie — agency_admin
        // can read their own payouts, never any other agency's.
        $base = PlatformPayout::query()->where('agency_id', $agencyId);

        $payouts = PlatformPayout::buildQuery(baseQuery: $base, request: $request)
            ->defaultSort('-period_end')
            ->paginate($request->integer('per_page', 20));

        return $this->json([
            'data' => PlatformPayoutResource::collection($payouts->items())->resolve($request),
            'meta' => [
                'current_page' => $payouts->currentPage(),
                'last_page' => $payouts->lastPage(),
                'per_page' => $payouts->perPage(),
                'total' => $payouts->total(),
            ],
        ]);
    }
}
