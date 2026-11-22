<?php

namespace App\Http\Resources\Api\Admin;

use App\Http\Resources\Bases\BaseResource;
use App\Models\SearchAliasSetting;
use Illuminate\Http\Request;

/**
 * TCK-2476 (ADR-0088 §7, revue adverse du 2026-11-04) — le réglage des variantes d'écriture : allumé ou non, l'opérateur
 * au nom duquel l'IA est jugée, ce qui empêche un passage (`blocked_reason`), le dernier passage.
 *
 * @mixin SearchAliasSetting
 */
class SearchAliasSettingResource extends BaseResource
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
        ];
    }
}
