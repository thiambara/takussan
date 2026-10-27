<?php

namespace App\Services\Ai;

use App\Models\AiRoleAssignment;
use App\Models\AiUsageSetting;
use App\Models\Enums\AiModelRole;

/**
 * TCK-2383 (ADR-0076 §2, §4) — de l'usage à la chaîne de maillons : le modèle forcé de l'usage,
 * sinon l'affectation du rôle en base, sinon le repli de `config/ai.php`. Une base vide ne rend
 * jamais le socle inopérant.
 *
 * TCK-2386 — `$role` remplace le rôle de l'usage (le rôle `vision` d'une requête à pièces jointes,
 * `AttachmentsUseVision`) ; le modèle forcé de l'usage l'emporte toujours, avec le plafond de
 * tokens du rôle joué.
 */
final class ModelResolver
{
    /** @return list<ModelLink> */
    public function chainFor(AiUsage $usage, ?AiUsageSetting $setting = null, ?AiModelRole $role = null): array
    {
        $chain = $this->chainForRole($role ?? $usage->role());
        $forced = $setting?->forcedLink($chain[0]->maxTokens ?? null);

        return $forced !== null ? [$forced] : $chain;
    }

    /** @return list<ModelLink> */
    public function chainForRole(AiModelRole $role): array
    {
        $links = AiRoleAssignment::query()->where('role', $role->value)->first()?->chain
            ?? config('ai.roles.'.$role->value, []);

        return array_values(array_map(ModelLink::fromArray(...), $links));
    }
}
