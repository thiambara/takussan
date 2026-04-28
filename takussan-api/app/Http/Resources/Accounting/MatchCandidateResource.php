<?php

namespace App\Http\Resources\Accounting;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MatchCandidateResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'label' => $this->label,
            'amount' => $this->amount,
            'currency' => $this->currency,
            'reference' => $this->reference,
            'paid_at' => $this->paidAt,
            'payer_name' => $this->payerName,
        ];
    }
}
