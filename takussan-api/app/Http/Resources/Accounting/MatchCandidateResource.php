<?php

namespace App\Http\Resources\Accounting;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

class MatchCandidateResource extends BaseResource
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
