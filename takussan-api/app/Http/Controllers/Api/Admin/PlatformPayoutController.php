<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\CancelPlatformPayoutRequest;
use App\Http\Requests\Api\Admin\ClosePlatformPayoutPeriodRequest;
use App\Http\Requests\Api\Admin\MarkPlatformPayoutPaidRequest;
use App\Http\Resources\Api\Admin\PlatformPayoutResource;
use App\Models\Agency;
use App\Models\PlatformPayout;
use App\Services\Billing\PlatformPayoutService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class PlatformPayoutController extends Controller
{
    public function __construct(private readonly PlatformPayoutService $payouts) {}

    public function index(Request $request): JsonResponse
    {
        $payouts = PlatformPayout::buildQuery(request: $request)
            ->defaultSort('-period_end')
            ->paginate($request->integer('per_page', 20));

        return $this->json([
            'data' => PlatformPayoutResource::collection($payouts->items())->resolve($request),
            'meta' => $this->paginationMeta($payouts),
        ]);
    }

    public function show(Request $request, PlatformPayout $payout): JsonResponse
    {
        $resource = (new PlatformPayoutResource($payout))
            ->additional(['breakdown' => $this->payouts->breakdown($payout)]);

        return $this->json(['data' => $resource->resolve($request)]);
    }

    public function closePeriod(ClosePlatformPayoutPeriodRequest $request): JsonResponse
    {
        $agency = $request->filled('agency_id')
            ? Agency::query()->findOrFail($request->integer('agency_id'))
            : null;

        $created = $this->payouts->closePeriod(
            $agency,
            Carbon::parse($request->input('period_end')),
            $request->user(),
        );

        return $this->json([
            'data' => array_map(
                fn (PlatformPayout $payout) => (new PlatformPayoutResource($payout))->resolve($request),
                $created,
            ),
        ], 201);
    }

    public function approve(Request $request, PlatformPayout $payout): JsonResponse
    {
        $payout = $this->payouts->approve($payout, $request->user());

        return $this->json(['data' => (new PlatformPayoutResource($payout))->resolve($request)]);
    }

    public function markPaid(MarkPlatformPayoutPaidRequest $request, PlatformPayout $payout): JsonResponse
    {
        $payout = $this->payouts->markPaid(
            $payout,
            $request->user(),
            Carbon::parse($request->input('processed_at')),
            $request->input('metadata'),
        );

        return $this->json(['data' => (new PlatformPayoutResource($payout))->resolve($request)]);
    }

    public function cancel(CancelPlatformPayoutRequest $request, PlatformPayout $payout): JsonResponse
    {
        $payout = $this->payouts->cancel($payout, $request->user(), $request->string('reason')->toString());

        return $this->json(['data' => (new PlatformPayoutResource($payout))->resolve($request)]);
    }
}
