<?php

namespace App\Services\Invitation;

use App\Models\Agency;
use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Services\Property\TitulaireALaSaisie;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2665 — l'admin range ses invitations : celles qui sont EXPIRÉES dans son agence, des rôles
 * qu'il nomme, sont supprimées. « Expirée » est la définition de `InvitationResource::isExpired()` :
 * marquée `expired` par le balayage horaire, ou encore `sent` mais dont `expires_at` est passé (le
 * balayage ne l'a pas encore vue, l'écran la montre déjà expirée). Rien d'autre ne part.
 *
 * Une invitation de bailleur close délie ses biens (TCK-1000, `TitulaireALaSaisie::delier()`) : le
 * balayage le fait à l'expiration, la purge le fait pour celles qu'il n'a pas encore vues
 * (idempotent pour les autres). Aucune notification : supprimer n'est pas expirer.
 *
 * Journalisée en UNE ligne d'activité, causée par l'admin, sur l'agence : le nombre et les rôles,
 * jamais une adresse.
 */
final class ExpiredInvitationPurge
{
    /** @param  list<string>  $roles */
    public function purge(Agency $agency, array $roles, User $actor): int
    {
        return DB::transaction(function () use ($agency, $roles, $actor): int {
            $rows = Invitation::query()
                ->where('agency_id', $agency->getKey())
                ->whereIn('role', $roles)
                ->where(fn (Builder $q) => $q
                    ->where('status', InvitationStatus::Expired->value)
                    ->orWhere(fn (Builder $sent) => $sent
                        ->where('status', InvitationStatus::Sent->value)
                        ->where('expires_at', '<=', now())))
                ->lockForUpdate()
                ->get(['id', 'invitable_type', 'invitable_id']);

            if ($rows->isEmpty()) {
                return 0;
            }

            TitulaireALaSaisie::delier($rows
                ->filter(fn (Invitation $i) => $i->invitable_type === OwnerProfile::class && $i->invitable_id !== null)
                ->pluck('invitable_id'));
            $deleted = Invitation::query()->whereKey($rows->modelKeys())->toBase()->delete();

            activity('Invitation')
                ->performedOn($agency)
                ->causedBy($actor)
                ->event('invitations_expired_purged')
                ->withProperties(['count' => $deleted, 'roles' => $roles])
                ->log('invitations_expired_purged');

            return $deleted;
        });
    }
}
