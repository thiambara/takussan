<?php

namespace App\Services\Lecture;

use App\Models\Inventory;
use App\Models\Property;
use App\Models\User;
use App\Policies\BasePolicy;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Services\Property\BailleurDuBien;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\SoftDeletingScope;

/**
 * TCK-3006 (ADR-0138) — qui peut lire un état des lieux, pour la liste (`GET /api/inventories`) et
 * pour la fiche (`InventoryPolicy::view`). Deux faces côte à côte, branche par branche ;
 * `tests/Feature/Lecture/ListeEtFicheParityTest.php` les tient ensemble.
 *
 * Le super-admin lit tout. Sinon :
 *  1. celui qui l'a conduit, tant que le bien est hors agence, qu'il est encore membre de l'agence
 *     du bien, ou qu'il y tient un profil de bailleur de tout statut (P218.04, TCK-2198 ; TCK-2655) ;
 *  2. le bailleur du bien, de tout statut ({@see BailleurDuBien}, TCK-1928) ;
 *  3. le locataire (le compte de la fiche `tenant_id`) ;
 *  4. le personnel de l'agence du bien, celle de son profil actif (TCK-587).
 *
 * **Le bien supprimé en douceur se juge sur son agence** (ADR-0138 § 4). `Inventory::property()` ne
 * le charge pas : la fiche jugeait alors la branche 1 sur une agence `null` — vraie sans condition
 * d'appartenance (`BasePolicy::auteurEncoreMembre`), et l'agent parti gardait l'état des lieux que
 * la liste lui retirait ; la liste, elle, retirait aussi la ligne au personnel de l'agence. Les deux
 * faces lisent désormais le bien corbeille comprise ({@see self::bien()}). Un bien introuvable même
 * là ne laisse que la branche 3, qui ne passe pas par lui.
 */
final class InventairesLisibles
{
    /**
     * @param  Builder<Inventory>  $query
     * @return Builder<Inventory>
     */
    public static function restreindre(Builder $query, User $user): Builder
    {
        if ($user->isSuperAdmin()) {
            return $query;
        }

        $conducteurAgencyIds = collect(app(MembershipCapabilityResolver::class)->memberAgencyIds($user))
            ->merge($user->ownerProfiles()->pluck('agency_id'))
            ->filter()->map(fn ($id) => (int) $id)->unique()->values()->all();
        $staffAgencyId = $user->staffAgencyId();
        $bien = fn (callable $condition) => fn (Builder $p) => $condition($p->withoutGlobalScope(SoftDeletingScope::class));

        return $query->where(function (Builder $q) use ($user, $conducteurAgencyIds, $staffAgencyId, $bien) {
            // 1.
            $q->where(fn (Builder $c) => $c->where($q->qualifyColumn('conducted_by'), $user->id)
                ->whereHas('property', $bien(fn (Builder $p) => $p->where(fn (Builder $a) => $a
                    ->whereNull('agency_id')->orWhereIn('agency_id', $conducteurAgencyIds)))))
                // 2.
                ->orWhereHas('property', $bien(fn (Builder $p) => BailleurDuBien::restreindre($p, $user)))
                // 3.
                ->orWhereHas('tenant', fn (Builder $t) => $t->where('user_id', $user->id));
            // 4.
            if ($staffAgencyId !== null) {
                $q->orWhereHas('property', $bien(fn (Builder $p) => $p->where('agency_id', $staffAgencyId)));
            }
        });
    }

    public static function peut(User $user, Inventory $inventory): bool
    {
        if ($user->isSuperAdmin()) {
            return true;
        }

        $property = self::bien($inventory);
        $agencyId = $property?->agency_id;

        return ($property !== null && (
            // 1.
            BasePolicy::auteurEncoreMembre($user, $inventory->conducted_by, $agencyId)
            || ($agencyId !== null && (int) $inventory->conducted_by === (int) $user->id
                && BailleurDuBien::tientUnProfil($user, (int) $agencyId))
            // 2.
            || BailleurDuBien::est($user, $property->user_id, $agencyId)
            // 4.
            || AgenceDuLecteur::personnel($user, $agencyId)
        ))
            // 3.
            || ($inventory->tenant !== null && (int) $inventory->tenant->user_id === (int) $user->id);
    }

    /**
     * Le bien de l'état des lieux, corbeille comprise. La relation déjà chargée sert telle quelle
     * (aucune requête dans une page qui l'a chargée) ; une relation chargée à `null` — un bien en
     * corbeille, sous la portée `SoftDeletes` — se relit. Le bien relu n'est PAS posé sur la
     * relation : `update` et le reste du modèle la lisent comme avant.
     */
    private static function bien(Inventory $inventory): ?Property
    {
        if ($inventory->property_id === null) {
            return null;
        }

        return ($inventory->relationLoaded('property') ? $inventory->property : null)
            ?? Property::withTrashed()->find($inventory->property_id);
    }
}
