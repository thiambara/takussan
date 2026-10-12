<?php

namespace App\Http\Resources\Credits;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/** TCK-633 lot F (ADR-0061 §1) — un espace vu par son portefeuille (solde posé par le contrôleur). */
class CreditWalletResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'status' => $this->status?->value,
            'balance' => (int) ($this->credit_balance ?? 0),
            'next_expiry_at' => $this->iso($this->credit_next_expiry_at ? Carbon::parse($this->credit_next_expiry_at) : null),
        ];
    }
}
