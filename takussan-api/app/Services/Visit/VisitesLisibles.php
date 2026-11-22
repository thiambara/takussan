<?php

namespace App\Services\Visit;

use App\Models\PropertyVisit;
use App\Models\User;
use App\Rules\PersonnelDeLAgence;
use App\Services\Property\PrimaryPropertyContact;
use Illuminate\Database\Eloquent\Builder;

/**
 * Les visites qu'un lecteur peut lire en liste — la règle de `GET /api/property-visits`, tirée du
 * contrôleur (TCK-2589) pour que le fil de la fiche client n'en lise jamais une de plus.
 *
 * Le visiteur ; l'agent assigné, tant qu'il est du personnel de l'agence du bien ; le propriétaire
 * du bien (bailleur actif de son agence, ou joignable sur un bien sans agence) ; le client de la
 * fiche ; le personnel de l'agence du bien. Le super-admin lit tout.
 */
final class VisitesLisibles
{
    /**
     * @param  list<int>|null  $personnelDe  les agences du personnel actif, quand l'appelant les a déjà lues
     * @return Builder<PropertyVisit>
     */
    public static function pour(User $user, ?array $personnelDe = null): Builder
    {
        $base = PropertyVisit::query();
        if ($user->isSuperAdmin()) {
            return $base;
        }

        // Vérification adverse (M7) — le créateur d'un bien d'agence n'en est le propriétaire
        // que s'il y est bailleur actif (`PrimaryPropertyContact::estProprietaire`).
        $bailleurDe = PersonnelDeLAgence::agencesOuBailleur($user);
        // Passe 3 (M7′) — l'agent assigné ne lit la visite d'un bien d'agence que tant qu'il
        // est du personnel de cette agence : parti ou suspendu, il la perd, comme dans `view`.
        // Passe 4 (X1) — le compte doit être joignable ; passe 5 (X1′) — et l'agence est celle
        // du profil actif (ADR-0031 §1) : `agencesOuPersonnelActif`, au plus une.
        $personnelDe ??= PersonnelDeLAgence::agencesOuPersonnelActif($user);
        // P217.05 (TCK-2237) — sur un bien SANS agence, le créateur n'est propriétaire que
        // joignable, comme dans `view` (`PrimaryPropertyContact::estProprietaire`).
        $proprietaireSansAgence = PrimaryPropertyContact::joignable($user);

        return $base->where(function ($q) use ($user, $bailleurDe, $personnelDe, $proprietaireSansAgence) {
            $q->where('visitor_id', $user->id)
                ->orWhere(fn ($a) => $a->where('agent_id', $user->id)
                    ->whereHas('property', fn ($p) => $p->whereNull('agency_id')->orWhereIn('agency_id', $personnelDe)))
                ->orWhereHas('property', fn ($p) => $p->where('user_id', $user->id)
                    ->where(fn ($a) => $a->when($proprietaireSansAgence, fn ($s) => $s->whereNull('agency_id'))
                        ->orWhereIn('agency_id', $bailleurDe)))
                ->orWhereHas('customer', fn ($c) => $c->where('user_id', $user->id));

            if ($personnelDe !== []) {
                $q->orWhereHas('property', fn ($p) => $p->whereIn('agency_id', $personnelDe));
            }
        });
    }
}
