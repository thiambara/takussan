<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

/**
 * TCK-594 (ADR-0039 §6) — la forme masquée pour tous ; la forme claire au TITULAIRE seul.
 *
 * `verified` dit si la destination peut servir AU LECTEUR (VERIF-594 M-6) : pour le personnel d'une
 * agence, vérifiée par son agence ; pour le titulaire, vérifiée par au moins une agence. Le lecteur
 * ne voit jamais quelles autres agences ont vérifié.
 */
class PayoutMethodResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        $holder = $request->user()?->id === $this->user_id;
        $agencyId = $holder ? null : $request->user()?->staffAgencyId();
        $verification = $holder
            ? ($this->resource->relationLoaded('verifications')
                ? $this->resource->verifications->sortByDesc('verified_at')->first()
                : $this->resource->verifications()->latest('verified_at')->first())
            : ($agencyId !== null ? $this->resource->verificationFor((int) $agencyId) : null);

        return [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'kind' => $this->kind?->value,
            'masked_identifier' => $this->masked_identifier,
            'account_identifier' => $this->when($holder, fn () => $this->account_identifier),
            'account_holder_name' => $this->when($holder, fn () => $this->account_holder_name),
            'is_default' => (bool) $this->is_default,
            'verified' => $verification !== null,
            'verified_at' => $this->iso($verification?->verified_at),
            'created_at' => $this->iso($this->created_at),
        ];
    }
}
