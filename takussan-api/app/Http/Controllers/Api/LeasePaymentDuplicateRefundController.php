<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\MarkLeaseDuplicateRefundedRequest;
use App\Http\Resources\LeasePaymentResource;
use App\Models\LeasePayment;
use App\Services\Payments\DuplicatePayments;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * TCK-608 — `POST /api/lease-payments/{payment}/duplicate-refunded` : « Doublon remboursé ».
 *
 * Pose `refunded_at` sur chaque doublon d'encaissement non remboursé de l'échéance (part pénalité
 * comprise), sous le verrou de la ligne, et journalise le geste (`activity('LeasePayment')`). La page
 * de retour cesse alors d'annoncer « l'agence vous remboursera » ; un doublon inscrit ensuite rallume le
 * drapeau. 409 `lease_payment.no_duplicate_to_refund` s'il n'y a rien à constater.
 *
 * De l'argent qui SORT : contrôleur de la famille protégée (`ProtectedActions::FAMILY_CONTROLLERS`),
 * second facteur exigé (`AGENCY_TWO_FACTOR`), comme le remboursement d'une réservation.
 */
class LeasePaymentDuplicateRefundController extends Controller
{
    public function store(MarkLeaseDuplicateRefundedRequest $request, LeasePayment $payment): JsonResponse
    {
        $note = $request->validated()['note'] ?? null;

        $payment = DB::transaction(function () use ($payment, $request, $note): LeasePayment {
            /** @var LeasePayment $locked */
            $locked = LeasePayment::query()->whereKey($payment->getKey())->lockForUpdate()->firstOrFail();

            $metadata = is_array($locked->metadata) ? $locked->metadata : [];
            [$metadata, $marked] = DuplicatePayments::markAllRefunded($metadata, now()->toIso8601String());
            abort_code_if($marked === 0, 409, 'lease_payment.no_duplicate_to_refund');

            $locked->forceFill(['metadata' => $metadata])->save();

            activity('LeasePayment')
                ->causedBy($request->user())
                ->performedOn($locked)
                ->withProperties(['marked' => $marked, 'note' => $note])
                ->event('duplicate_refunded')
                ->log('duplicate_refunded');

            return $locked->refresh();
        });

        return $this->json([
            'data' => LeasePaymentResource::make($payment)->resolve($request),
        ]);
    }
}
