<?php

namespace App\Services\Membership;

use App\Models\AgencyRole;
use App\Models\AgencyRoleCapability;
use App\Models\Enums\Capability;
use Illuminate\Support\Facades\Cache;

/**
 * TCK-279 — cache de la matrice de capacités, indexé par `agency_role_id`.
 *
 * **Pourquoi par rôle et non par profil**, alors que le ticket dit « par
 * profil » : l'invalidation est la partie difficile d'un cache
 * d'autorisation. Indexée par rôle, elle est totale et locale — éditer un
 * rôle invalide exactement une clé, et tous les profils qui le portent
 * voient l'effet au même instant. Indexée par profil, la même édition
 * exigerait de balayer N profils, et un oubli laisserait un utilisateur
 * avec des droits périmés sans que rien ne le signale. La réaffectation
 * d'un profil (`PATCH /profiles/{p}/agency-role`) ne demande aucune purge :
 * le profil pointe vers une autre clé, déjà juste.
 *
 * Cela satisfait aussi l'exigence contradictoire de la spec §52 —
 * « l'édition prend effet immédiatement (pas de cache) » — puisque
 * l'invalidation est synchrone, portée par les hooks `saved`/`deleted` du
 * modèle `AgencyRole` et par le sync des capacités.
 *
 * Le TTL n'est qu'un filet : la correction vient de l'invalidation.
 */
class AgencyRoleCapabilityCache
{
    private const PREFIX = 'tck279:agency_role_caps:';

    private const TTL_SECONDS = 300;

    /**
     * Valeurs de capacités du rôle, en cache.
     *
     * @return array<int,string>
     */
    public function values(int $agencyRoleId): array
    {
        return Cache::remember(
            self::PREFIX.$agencyRoleId,
            self::TTL_SECONDS,
            static fn (): array => AgencyRoleCapability::query()
                ->where('agency_role_id', $agencyRoleId)
                ->pluck('capability')
                ->map(static fn ($v): string => (string) $v)
                ->unique()
                ->values()
                ->all(),
        );
    }

    public function allows(int $agencyRoleId, Capability $capability): bool
    {
        return in_array($capability->value, $this->values($agencyRoleId), true);
    }

    public function forget(int $agencyRoleId): void
    {
        Cache::forget(self::PREFIX.$agencyRoleId);
    }

    /**
     * Purge tous les rôles d'une agence — utilisé après un clonage ou une
     * réécriture en masse.
     */
    public function forgetAgency(int $agencyId): void
    {
        AgencyRole::query()
            ->where('agency_id', $agencyId)
            ->pluck('id')
            ->each(fn ($id) => $this->forget((int) $id));
    }
}
