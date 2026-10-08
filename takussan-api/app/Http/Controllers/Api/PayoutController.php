<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\ApprovePayoutRequest;
use App\Http\Requests\Api\MarkFailedPayoutRequest;
use App\Http\Requests\Api\MarkProcessedPayoutRequest;
use App\Http\Requests\Api\StorePayoutRequest;
use App\Http\Resources\PayoutResource;
use App\Models\Enums\Capability;
use App\Models\Payout;
use App\Models\User;
use App\Services\Model\PayoutService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PayoutController extends Controller
{
    public function __construct(protected PayoutService $payouts) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $base = Payout::query()->with(['landlord', 'payoutMethod:id,masked_identifier']);

        if (! $user->isSuperAdmin()) {
            $base->where(function ($q) use ($user) {
                $q->where('landlord_id', $user->id)
                    ->orWhere('issued_by_id', $user->id);
                // TCK-587 — les versements de l'agence : le personnel tenant `payouts.create`, comme
                // `PayoutPolicy::view` (ADR-0031). Un bailleur de l'agence listait ceux des autres.
                if (($staffAgencyId = $user->staffAgencyId()) !== null
                    && $user->can(Capability::PayoutsCreate->value)) {
                    $q->orWhere('agency_id', $staffAgencyId);
                }
            });
        }

        $paginator = Payout::buildQuery($base, $request)
            ->defaultSort('-created_at')
            ->paginate();

        return $this->paginated($paginator, PayoutResource::collection($paginator)->toArray($request));
    }

    public function store(StorePayoutRequest $request): JsonResponse
    {
        $data = $request->validated();

        $landlord = User::findOrFail($data['landlord_id']);
        $payout = $this->payouts->create($request->user(), $landlord, $data);

        return $this->json([
            'data' => PayoutResource::make($payout)->toArray($request),
        ], 201);
    }

    public function show(Request $request, Payout $payout): JsonResponse
    {
        $this->authorize('view', $payout);

        return $this->json([
            // TCK-594 — l'approbateur lit qui a préparé avant d'engager l'argent.
            'data' => PayoutResource::make($payout->load(['landlord', 'issuer', 'payoutMethod:id,masked_identifier']))->toArray($request),
        ]);
    }

    /**
     * TCK-594 (ADR-0039 §4) — le second geste d'un reversement au-dessus du seuil de l'agence.
     */
    public function approve(ApprovePayoutRequest $request, Payout $payout): JsonResponse
    {
        $payout = $this->payouts->approve($payout, $request->user(), $request->validated('payout_method_id'));

        return $this->json([
            'data' => PayoutResource::make($payout)->toArray($request),
        ]);
    }

    public function markProcessed(MarkProcessedPayoutRequest $request, Payout $payout): JsonResponse
    {

        $data = $request->validated();

        $payout = $this->payouts->markProcessed($payout, $data, $request->user());

        return $this->json([
            'data' => PayoutResource::make($payout)->toArray($request),
        ]);
    }

    public function markFailed(MarkFailedPayoutRequest $request, Payout $payout): JsonResponse
    {

        $data = $request->validated();

        $payout = $this->payouts->markFailed($payout, $data, $request->user());

        return $this->json([
            'data' => PayoutResource::make($payout)->toArray($request),
        ]);
    }

    public function cancel(Request $request, Payout $payout): JsonResponse
    {
        $this->authorize('update', $payout);
        $payout = $this->payouts->cancel($payout, $request->user());

        return $this->json([
            'data' => PayoutResource::make($payout)->toArray($request),
        ]);
    }
}
