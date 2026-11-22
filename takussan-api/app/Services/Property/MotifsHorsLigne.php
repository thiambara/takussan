<?php

namespace App\Services\Property;

use App\Models\Property;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * TCK-2678 (ADR-0097 § 5) — `offline_reasons` (`include=offlineReasons`), et À QUI il se sert.
 *
 * Le motif d'un bien hors ligne (« bien de test », « agence inactive »…) se lit par le personnel de
 * l'agence du bien, sous son profil ACTIF (`staffAgencyId()`, comme `PropertyPolicy::view`), et par
 * le bailleur du bien ({@see BailleurDuBien}) ; l'opérateur de la plateforme aussi. Jamais par un
 * client, un autre bailleur, ni le public (décision du team-lead, 2026-11-13). C'est la seule porte :
 * la fiche et la liste passent par {@see self::pour()}.
 *
 * Pourquoi une garde de plus que `view` : la portée de la liste (`PropertyListScope`) rend aussi les
 * biens que l'appelant a SAISIS dans une agence où il garde un profil actif, quel que soit son profil
 * actif — un agent de X qui agit sous son profil bailleur de Y y voit ses saisies de X, dont il ne
 * lit pas le motif dans ce contexte.
 */
final class MotifsHorsLigne
{
    /**
     * Les motifs des biens de `$ids` que `$user` peut lire, par identifiant ; un bien absent du
     * résultat ne porte pas `offline_reasons`. Deux requêtes pour la garde et le statut, plus une par
     * condition, quel que soit le nombre de biens.
     *
     * @param  list<int>  $ids
     * @return array<int, list<string>>
     */
    public function pour(?User $user, array $ids): array
    {
        $lisibles = $this->lisibles($user, $ids);

        return $lisibles === [] ? [] : Property::offlineReasonsAmong($lisibles);
    }

    /**
     * @param  list<int>  $ids
     * @return list<int>
     */
    public function lisibles(?User $user, array $ids): array
    {
        if ($user === null || $ids === []) {
            return [];
        }
        if ($user->isSuperAdmin()) {
            return array_values(array_map('intval', $ids));
        }

        $personnelDe = $user->staffAgencyId();

        return Property::query()
            ->whereIn('properties.id', $ids)
            ->where(function (Builder $q) use ($user, $personnelDe) {
                $q->where(fn (Builder $bailleur) => BailleurDuBien::restreindre($bailleur, $user, 'properties.user_id', 'properties.agency_id'));
                if ($personnelDe !== null) {
                    $q->orWhere('properties.agency_id', $personnelDe);
                }
            })
            ->pluck('properties.id')
            ->map(fn ($id) => (int) $id)
            ->values()
            ->all();
    }
}
