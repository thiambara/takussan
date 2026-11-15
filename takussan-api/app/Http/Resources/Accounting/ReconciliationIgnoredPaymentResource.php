<?php

namespace App\Http\Resources\Accounting;

use App\Http\Resources\Bases\BaseResource;
use App\Models\ReconciliationIgnoredPayment;
use Illuminate\Http\Request;

/**
 * TCK-2932 — un paiement sorti du reste à rapprocher : le geste (motif, note, qui, quand) et le
 * paiement, sous la forme d'une ligne du reste à rapprocher (`ReconciliationPendingPaymentResource`,
 * sans ligne proposée). `id` est celui du geste, que `DELETE …/ignored-payments/{id}` défait.
 *
 * @property ReconciliationIgnoredPayment $resource
 */
class ReconciliationIgnoredPaymentResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        $row = $this->resource;
        $by = $row->ignoredBy;

        return [
            'id' => $row->id,
            'reason' => $row->reason?->value,
            'note' => $row->note,
            'ignored_at' => $this->iso($row->created_at),
            'ignored_by' => $by === null ? null : ['id' => $by->id, 'first_name' => $by->first_name, 'last_name' => $by->last_name],
            'payment' => $row->payable === null ? null : ReconciliationPendingPaymentResource::make($row->payable)->resolve($request),
        ];
    }
}
