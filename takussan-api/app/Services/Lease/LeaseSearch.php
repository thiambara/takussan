<?php

namespace App\Services\Lease;

use App\Models\Lease;
use App\Services\Booking\BookingSearch;
use App\Support\CaseInsensitive;
use Illuminate\Database\Eloquent\Builder;

/**
 * TCK-2642 — `filter[search]` de la liste des baux : la référence du bail, le prénom, le nom et le
 * téléphone du locataire, le titre et la référence du bien.
 *
 * La règle de {@see BookingSearch} (TCK-2593), reprise pour les baux :
 *
 * - une condition SQL posée SOUS la portée de l'index (`Lease::scopeVisibleTo`), jamais
 *   Meilisearch (`Lease` n'est pas `Searchable`) : la recherche ne fait que restreindre ;
 * - **texte** : chaque mot (au plus {@see self::MOTS}) doit trouver l'un des champs. La casse se
 *   replie par `CaseInsensitive` (ADR-0025) ; les accents ne se replient pas (ADR-0020 §2, décision
 *   reconduite pour ce lot) ; `%` et `_` sont pris au pied de la lettre ;
 * - **téléphone** : une saisie faite de chiffres et de séparateurs, d'au moins {@see self::CHIFFRES}
 *   chiffres, se compare aux seuls chiffres du numéro de la fiche du locataire ;
 * - moins de 2 caractères après `trim` : ignorée ; hors UTF-8 : rien.
 */
final class LeaseSearch
{
    private const MOTS = 6;

    private const CHIFFRES = 4;

    /** @param  Builder<Lease>  $query */
    public static function apply(Builder $query, string $saisie): void
    {
        $saisie = trim($saisie);
        if (! mb_check_encoding($saisie, 'UTF-8')) {
            $query->whereRaw('1 = 0');

            return;
        }
        if (mb_strlen($saisie) < 2) {
            return;
        }

        $chiffres = preg_replace('/\D+/', '', $saisie) ?? '';
        if (preg_match('/^[\d\s+().\-]+$/', $saisie) === 1 && strlen($chiffres) >= self::CHIFFRES) {
            $query->whereHas('tenant', fn (Builder $c) => $c
                ->whereRaw("regexp_replace(coalesce(customers.phone, ''), '\\D', '', 'g') like ?", ['%'.$chiffres.'%']));

            return;
        }

        $mots = array_slice(preg_split('/\s+/u', $saisie, -1, PREG_SPLIT_NO_EMPTY) ?: [], 0, self::MOTS);
        foreach ($mots as $mot) {
            $motif = '%'.addcslashes(CaseInsensitive::fold($mot), '\\%_').'%';
            $query->where(fn (Builder $q) => $q
                ->whereRaw(CaseInsensitive::sql('leases.reference_number').' like ?', [$motif])
                ->orWhereHas('tenant', fn (Builder $c) => $c
                    ->whereRaw(CaseInsensitive::sql('customers.first_name').' like ?', [$motif])
                    ->orWhereRaw(CaseInsensitive::sql('customers.last_name').' like ?', [$motif]))
                ->orWhereHas('property', fn (Builder $p) => $p
                    ->whereRaw(CaseInsensitive::sql('properties.title').' like ?', [$motif])
                    ->orWhereRaw(CaseInsensitive::sql('properties.reference_number').' like ?', [$motif])));
        }
    }
}
