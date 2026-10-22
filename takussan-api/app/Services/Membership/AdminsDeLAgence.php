<?php

namespace App\Services\Membership;

use App\Models\Profiles\AgencyAdminProfile;
use App\Models\User;
use App\Services\Lead\ContactLeadService;
use App\Services\Property\PrimaryPropertyContact;
use Illuminate\Support\Collection;

/**
 * TCK-1318 (P126.05) — LA liste des admins d'une agence à qui l'on écrit : profil d'admin ACTIF
 * dans l'agence, et compte JOIGNABLE ({@see PrimaryPropertyContact::joignable()} : ni bloqué ni
 * supprimé). Elle s'écrivait six fois, et une seule écartait le compte bloqué.
 *
 * Chaque appelant garde son filtre propre (l'auteur du geste écarté, par exemple). Les délégués
 * du rôle `agency_admin` n'y sont pas : {@see ContactLeadService::agencyReaders()}
 * les ajoute là où ils comptent.
 */
final class AdminsDeLAgence
{
    /** @return Collection<int, User> */
    public static function destinataires(?int $agencyId): Collection
    {
        if ($agencyId === null) {
            return collect();
        }

        return AgencyAdminProfile::query()
            ->where('agency_id', $agencyId)
            ->active()
            ->with('user')
            ->get()
            ->pluck('user')
            ->filter(fn (?User $user): bool => PrimaryPropertyContact::joignable($user))
            ->unique('id')
            ->values();
    }
}
