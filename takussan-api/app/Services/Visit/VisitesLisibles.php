<?php

namespace App\Services\Visit;

use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Rules\PersonnelDeLAgence;
use App\Services\Property\PrimaryPropertyContact;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\SoftDeletingScope;

/**
 * Qui peut lire une visite — TCK-2589 l'avait tirée du contrôleur pour la liste (`GET
 * /api/property-visits`, le fil de la fiche client, l'activité des espaces) ; TCK-3006 (ADR-0138) y
 * écrit à côté la face de la fiche (`PropertyVisitPolicy::view`). Deux faces côte à côte, branche par
 * branche ; `tests/Feature/Lecture/ListeEtFicheParityTest.php` les tient ensemble.
 *
 * Le super-admin lit tout. Sinon :
 *  1. le visiteur ;
 *  2. l'agent assigné, tant que le bien est hors agence ou qu'il est du personnel actif (joignable,
 *     profil actif) de son agence (TCK-590, passes 3 à 5) ;
 *  3. le propriétaire du bien ({@see PrimaryPropertyContact::estProprietaire()} : bailleur actif de
 *     son agence, ou créateur joignable d'un bien sans agence — M7, TCK-2237) ;
 *  4. le client de la fiche rattachée ;
 *  5. le personnel actif de l'agence du bien, celle de son profil actif (ADR-0031 § 1).
 *
 * **Le bien supprimé en douceur se juge sur son agence** (ADR-0138 § 4). `PropertyVisit::property()`
 * ne le charge pas : la fiche jugeait la branche 2 sur un bien `null` — vraie sans condition, et
 * l'agent parti gardait la visite que la liste lui retirait ; la liste retirait aussi la ligne au
 * personnel de l'agence. Les deux faces lisent désormais le bien corbeille comprise
 * ({@see self::bien()}) ; un bien introuvable même là ne laisse que les branches 1 et 4.
 */
final class VisitesLisibles
{
    /**
     * @param  Builder<PropertyVisit>  $query
     * @param  list<int>|null  $personnelDe  les agences du personnel actif, quand l'appelant les a déjà lues
     * @return Builder<PropertyVisit>
     */
    public static function restreindre(Builder $query, User $user, ?array $personnelDe = null): Builder
    {
        if ($user->isSuperAdmin()) {
            return $query;
        }

        $bailleurDe = PersonnelDeLAgence::agencesOuBailleur($user);
        // Au plus une agence : celle du profil actif, si le compte est joignable.
        $personnelDe ??= PersonnelDeLAgence::agencesOuPersonnelActif($user);
        $proprietaireSansAgence = PrimaryPropertyContact::joignable($user);
        $bien = fn (callable $condition) => fn (Builder $p) => $condition($p->withoutGlobalScope(SoftDeletingScope::class));

        return $query->where(function (Builder $q) use ($user, $bailleurDe, $personnelDe, $proprietaireSansAgence, $bien) {
            // 1.
            $q->where($q->qualifyColumn('visitor_id'), $user->id)
                // 2.
                ->orWhere(fn (Builder $a) => $a->where($q->qualifyColumn('agent_id'), $user->id)
                    ->whereHas('property', $bien(fn (Builder $p) => $p->where(fn (Builder $w) => $w
                        ->whereNull('agency_id')->orWhereIn('agency_id', $personnelDe)))))
                // 3.
                ->orWhereHas('property', $bien(fn (Builder $p) => $p->where('user_id', $user->id)
                    ->where(fn (Builder $a) => $a->when($proprietaireSansAgence, fn (Builder $s) => $s->whereNull('agency_id'))
                        ->orWhereIn('agency_id', $bailleurDe))))
                // 4.
                ->orWhereHas('customer', fn (Builder $c) => $c->where('user_id', $user->id));
            // 5.
            if ($personnelDe !== []) {
                $q->orWhereHas('property', $bien(fn (Builder $p) => $p->whereIn('agency_id', $personnelDe)));
            }
        });
    }

    public static function peut(User $user, PropertyVisit $visit): bool
    {
        if ($user->isSuperAdmin()) {
            return true;
        }

        $property = self::bien($visit);

        // 1.
        return (int) $visit->visitor_id === (int) $user->id
            || ($property !== null && (
                // 2.
                ($visit->agent_id !== null && (int) $visit->agent_id === (int) $user->id
                    && ($property->agency_id === null || PersonnelDeLAgence::personnelActifDe($user, $property->agency_id)))
                // 3.
                || PrimaryPropertyContact::estProprietaire($user, $property)
                // 5.
                || PersonnelDeLAgence::personnelActifDe($user, $property->agency_id)
            ))
            // 4.
            || ($visit->customer !== null && (int) $visit->customer->user_id === (int) $user->id);
    }

    /**
     * Le bien de la visite, corbeille comprise. La relation déjà chargée sert telle quelle ; chargée à
     * `null` (un bien en corbeille, sous `SoftDeletes`) ou absente, elle se relit sans être reposée sur
     * le modèle : `update` et la ressource la lisent comme avant.
     */
    private static function bien(PropertyVisit $visit): ?Property
    {
        if ($visit->property_id === null) {
            return null;
        }

        return ($visit->relationLoaded('property') ? $visit->property : null)
            ?? Property::withTrashed()->find($visit->property_id);
    }
}
