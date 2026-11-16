<?php

namespace App\Http\Resources\Credits;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

/**
 * TCK-633 lot F (ADR-0061 §2) — un lot de crédits.
 *
 * TCK-2924 — `whenHas` : sous `fields[credit_lots]` (`GET /api/credits/lots`), une colonne non lue est
 * omise au lieu d'un `null` inventé ; `GET /api/credits` lit toutes les colonnes et rend la même forme
 * qu'avant. `state` (`spent` | `expired`) n'existe que dans l'historique, qui le calcule
 * (`CreditLot::stateSql()`).
 */
class CreditLotResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'origin' => $this->whenHas('origin', fn () => $this->origin?->value),
            'initial_amount' => $this->whenHas('initial_amount'),
            'remaining_amount' => $this->whenHas('remaining_amount'),
            'expires_at' => $this->whenHas('expires_at', fn () => $this->iso($this->expires_at)),
            'reason' => $this->whenHas('reason'),
            'created_at' => $this->whenHas('created_at', fn () => $this->iso($this->created_at)),
            'state' => $this->whenHas('state'),
        ];
    }
}
