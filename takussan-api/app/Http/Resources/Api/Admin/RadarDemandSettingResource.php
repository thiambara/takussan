<?php

namespace App\Http\Resources\Api\Admin;

use App\Http\Resources\Bases\BaseResource;
use App\Models\RadarDemandSetting;
use App\Models\RadarTargetRevision;
use Illuminate\Http\Request;

/**
 * TCK-2470 (ADR-0087 §6) — le réglage des cibles de la demande, pour l'encart « Demande » de la console : allumé ou non,
 * l'opérateur au nom duquel l'IA est jugée, ce qui empêche un passage (`blocked_reason`), le dernier passage et la dernière
 * révision, et le plafond des cibles de la demande (`max_demand`, de la configuration).
 *
 * @mixin RadarDemandSetting
 */
class RadarDemandSettingResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        $operator = $this->operator;

        return [
            'enabled' => $this->enabled,
            'operator' => $operator === null ? null : ['id' => $operator->id, 'name' => $operator->nameWithoutContact()],
            'enabled_at' => $this->iso($this->enabled_at),
            'blocked_reason' => $this->blockedReason(),
            'last_run_at' => $this->iso($this->last_run_at),
            'last_run_outcome' => $this->last_run_outcome,
            'last_revision_at' => $this->iso(RadarTargetRevision::query()->orderByDesc('id')->first(['created_at'])?->created_at),
            // Le plafond des cibles `demand` actives (`radar.targets.max_demand`) : la console le lit ici, sans le recopier.
            'max_demand' => (int) config('radar.targets.max_demand', 20),
        ];
    }
}
