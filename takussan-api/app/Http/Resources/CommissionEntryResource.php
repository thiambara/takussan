<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

/** TCK-595 (ADR-0049 §3) — une ligne du grand livre des commissions. */
class CommissionEntryResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'agency_id' => $this->agency_id,
            'lease_id' => $this->lease_id,
            'beneficiary_id' => $this->beneficiary_id,
            'origin' => $this->origin?->value,
            'base_amount' => (float) $this->base_amount,
            'share_percent' => (float) $this->share_percent,
            'amount' => (float) $this->amount,
            'currency' => $this->currency?->value,
            'status' => $this->status?->value,
            'earned_at' => $this->iso($this->earned_at),
            'paid_at' => $this->iso($this->paid_at),
            'paid_by_id' => $this->paid_by_id,
            'cancelled_at' => $this->iso($this->cancelled_at),
            'cancelled_by_id' => $this->cancelled_by_id,
            'beneficiary' => $this->whenLoaded('beneficiary', fn () => $this->beneficiary ? [
                'id' => $this->beneficiary->id,
                'name' => trim($this->beneficiary->first_name.' '.$this->beneficiary->last_name) ?: $this->beneficiary->username,
            ] : null),
            'lease' => $this->whenLoaded('lease', fn () => $this->lease ? [
                'id' => $this->lease->id,
                'reference_number' => $this->lease->reference_number,
                'type' => $this->lease->type?->value,
            ] : null),
            'created_at' => $this->iso($this->created_at),
        ];
    }
}
