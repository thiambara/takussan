<?php

namespace App\Http\Resources\Api\Admin;

use App\Http\Resources\Bases\BaseResource;
use App\Models\RadarTargetRevision;
use Illuminate\Http\Request;

/**
 * TCK-2470 (ADR-0087 §6) — une révision des cibles de la demande, pour l'historique de la console : les opérations
 * appliquées (avec le motif donné par l'IA), les opérations écartées (avec le code du refus), l'état d'avant des cibles
 * touchées, et si elle a été défaite. Chaque colonne passe par `whenHas` (`fields[radar_target_revisions]=…`).
 *
 * @mixin RadarTargetRevision
 */
class RadarTargetRevisionResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->whenHas('id'),
            'operations' => $this->whenHas('operations', fn () => (array) $this->operations),
            'discarded' => $this->whenHas('discarded', fn () => (array) $this->discarded),
            'before' => $this->whenHas('before', fn () => (array) $this->before),
            'signals_count' => $this->whenHas('signals_count'),
            'ai_call_id' => $this->whenHas('ai_call_id'),
            'reverted_at' => $this->whenHas('reverted_at', fn () => $this->iso($this->reverted_at)),
            'reverted_by_id' => $this->whenHas('reverted_by_id'),
            'created_at' => $this->whenHas('created_at', fn () => $this->iso($this->created_at)),
            'updated_at' => $this->whenHas('updated_at', fn () => $this->iso($this->updated_at)),
            'reverted_by' => $this->whenLoaded('revertedBy', fn () => $this->revertedBy === null ? null : [
                'id' => $this->revertedBy->id,
                'name' => $this->revertedBy->nameWithoutContact(),
            ]),
        ];
    }
}
