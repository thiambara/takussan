<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

/**
 * TCK-594 (ADR-0039 §6) — la forme masquée pour tous ; la forme claire au TITULAIRE seul.
 */
class PayoutMethodResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        $holder = $request->user()?->id === $this->user_id;

        return [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'kind' => $this->kind?->value,
            'masked_identifier' => $this->masked_identifier,
            'account_identifier' => $this->when($holder, fn () => $this->account_identifier),
            'account_holder_name' => $this->when($holder, fn () => $this->account_holder_name),
            'is_default' => (bool) $this->is_default,
            'verified' => $this->verified_at !== null,
            'verified_at' => $this->iso($this->verified_at),
            'created_at' => $this->iso($this->created_at),
        ];
    }
}
