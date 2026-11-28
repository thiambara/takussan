<?php

namespace App\Services\Lecture;

use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use App\Policies\MaintenanceRequestPolicy;
use App\Services\Maintenance\ProviderEligibility;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Services\Property\BailleurDuBien;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\SoftDeletingScope;

/**
 * TCK-3006 (ADR-0138) — qui peut lire une intervention, pour la liste (`GET /api/maintenance-requests`,
 * et tout ce qui lit `MaintenanceRequest::scopeVisibleTo` : calendrier, résumé, activité des espaces,
 * salles de messagerie) et pour la fiche (`MaintenanceRequestPolicy::view`). Deux faces côte à côte ;
 * `tests/Feature/Lecture/ListeEtFicheParityTest.php` les tient ensemble.
 *
 * Le super-admin lit tout. Sinon :
 *  1. le DEMANDEUR, sauf sur un bien d'une agence dont il est du personnel parti (P233.03, TCK-2290 —
 *     ADR-0031, amendement du 2026-10-25, D2) : le locataire et le client demandeurs gardent tout ;
 *  2. le prestataire assigné, tant qu'il est assignable dans l'agence du bien (collaboration ou
 *     profil de personnel actifs, TCK-592) ;
 *  3. le donneur d'ordre ({@see MaintenanceRequestPolicy::isPrincipalFor()}) : le bailleur du bien
 *     ({@see BailleurDuBien}, TCK-2179), ou le personnel de l'agence du bien, celle de son profil actif.
 *
 * Les branches 1 et 2 servent aussi les gestes (`update`, `contribute`, `actorsOf`) : la policy les
 * lit ici ({@see self::estDemandeur()}, {@see self::estPrestataireAssigne()}).
 *
 * Le bien supprimé en douceur ferme ses interventions (`PropertyObserver`, P130.03) : les branches 2
 * et 3 lisent le bien hors corbeille, et seul le demandeur garde la ligne. La borne du demandeur
 * (branche 1) lit l'agence du bien CORBEILLE COMPRISE (ADR-0138 § 4, vérification adverse de
 * TCK-3006) : le membre parti, refusé tant que le bien était actif, retrouvait la fiche et la liste
 * dès sa suppression. La liste ne l'appelle pas : seule la fiche relit ce bien.
 */
final class InterventionsLisibles
{
    /**
     * @param  Builder<MaintenanceRequest>  $query
     * @return Builder<MaintenanceRequest>
     */
    public static function restreindre(Builder $query, User $user): Builder
    {
        return self::restreindreDans($query, $user, $user->staffAgencyId());
    }

    /**
     * La même règle, l'agence du personnel donnée au lieu d'être lue sur le profil actif : le lien
     * d'agenda (`CalendarFeedService`) n'a pas de requête, donc pas de profil actif, et porte son agence.
     *
     * @param  Builder<MaintenanceRequest>  $query
     * @return Builder<MaintenanceRequest>
     */
    public static function restreindreDans(Builder $query, User $user, ?int $staffAgencyId): Builder
    {
        if ($user->isSuperAdmin()) {
            return $query;
        }

        $assignableAgencyIds = app(ProviderEligibility::class)->agencyIdsWhereAssignable($user);
        $agencesQuittees = app(MembershipCapabilityResolver::class)->agencesDuPersonnelParti($user);

        return $query->where(function (Builder $q) use ($user, $assignableAgencyIds, $staffAgencyId, $agencesQuittees): void {
            // 1.
            $q->where(fn (Builder $requested) => $requested
                ->where($q->qualifyColumn('requester_id'), $user->id)
                ->when($agencesQuittees !== [], fn (Builder $r) => $r
                    ->whereDoesntHave('property', fn (Builder $p) => $p
                        ->withoutGlobalScope(SoftDeletingScope::class)->whereIn('agency_id', $agencesQuittees))))
                // 2.
                ->orWhere(fn (Builder $assigned) => $assigned
                    ->where($q->qualifyColumn('assigned_to'), $user->id)
                    ->whereHas('property', fn (Builder $p) => $p->whereIn('agency_id', $assignableAgencyIds)))
                // 3. — le bailleur du bien…
                ->orWhereHas('property', fn (Builder $p) => BailleurDuBien::restreindre($p, $user));
            // …ou le personnel de son agence.
            if ($staffAgencyId !== null) {
                $q->orWhereHas('property', fn (Builder $p) => $p->where('agency_id', $staffAgencyId));
            }
        });
    }

    public static function peut(User $user, MaintenanceRequest $request): bool
    {
        return $user->isSuperAdmin()
            // 1.
            || self::estDemandeur($user, $request)
            // 2.
            || self::estPrestataireAssigne($user, $request)
            // 3.
            || MaintenanceRequestPolicy::isPrincipalFor($user, $request->property);
    }

    /** Branche 1 : le demandeur, hors des agences dont il est du personnel parti. */
    public static function estDemandeur(User $user, MaintenanceRequest $request): bool
    {
        if ($request->requester_id === null || (int) $request->requester_id !== (int) $user->id) {
            return false;
        }

        $agencyId = self::bien($request)?->agency_id;

        return $agencyId === null
            || ! in_array((int) $agencyId, app(MembershipCapabilityResolver::class)->agencesDuPersonnelParti($user), true);
    }

    /** Branche 2 : le prestataire assigné, tant qu'il est assignable dans l'agence du bien. */
    public static function estPrestataireAssigne(User $user, MaintenanceRequest $request): bool
    {
        return $request->assigned_to !== null
            && (int) $request->assigned_to === (int) $user->id
            && app(ProviderEligibility::class)->isAssignable($user, $request->property);
    }

    /** Le bien, corbeille comprise : la relation chargée s'il y en a une, sinon relu en base. */
    private static function bien(MaintenanceRequest $request): ?Property
    {
        if ($request->property_id === null) {
            return null;
        }

        return ($request->relationLoaded('property') ? $request->property : null)
            ?? Property::withTrashed()->find($request->property_id);
    }
}
