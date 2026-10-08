<?php

namespace App\Services\Audit;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * TCK-601 (ADR-0044 §3) — le périmètre de lecture du journal, écrit une fois pour la liste, l'historique
 * d'un objet et l'export : le super-admin lit tout ; tout autre lecteur autorisé lit les lignes
 * dont `agency_id` est l'agence de son profil ACTIF, et rien d'autre — l'acteur n'y entre jamais.
 */
final class AuditScope
{
    public static function apply(Builder $query, User $user, ?int $agencyId): Builder
    {
        if ($user->isSuperAdmin()) {
            return $query;
        }

        return $agencyId === null
            ? $query->whereRaw('0 = 1')
            : $query->where($query->qualifyColumn('agency_id'), $agencyId);
    }
}
