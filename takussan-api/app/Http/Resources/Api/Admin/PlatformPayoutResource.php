<?php

namespace App\Http\Resources\Api\Admin;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

class PlatformPayoutResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'agency_id' => $this->agency_id,
            // Castés « date » sur le modèle : une période comptable n'a pas d'heure (ADR-0018).
            // Ils sortaient en `2026-08-17T00:00:00+00:00` quand PayoutResource et
            // BankStatementResource émettaient `2026-08-17` sur exactement le même cast.
            'period_start' => $this->calendarDate($this->period_start),
            'period_end' => $this->calendarDate($this->period_end),
            'gross_amount' => (float) $this->gross_amount,
            'platform_fee_amount' => (float) $this->platform_fee_amount,
            'net_amount' => (float) $this->net_amount,
            'currency' => $this->currency,
            'status' => $this->status?->value,
            'approved_by' => $this->approved_by,
            'processed_at' => $this->iso($this->processed_at),
            'failure_reason' => $this->failure_reason,
            'metadata' => $this->metadata ?? [],
            'breakdown' => $this->additional['breakdown'] ?? null,
            'created_at' => $this->iso($this->created_at),
            'updated_at' => $this->iso($this->updated_at),
        ];
    }
}
