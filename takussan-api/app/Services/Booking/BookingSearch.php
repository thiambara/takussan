<?php

namespace App\Services\Booking;

use App\Models\Booking;
use App\Support\CaseInsensitive;
use Illuminate\Database\Eloquent\Builder;

/**
 * TCK-2593 — `filter[search]` de la liste des réservations : la référence de la réservation, le
 * prénom, le nom et le téléphone du client, le titre du bien.
 *
 * Une condition SQL posée sous la portée de l'index, jamais Meilisearch (`Booking` n'est pas
 * `Searchable`) : l'agence reste la frontière, la recherche ne fait que restreindre.
 *
 * - **Texte** : chaque mot (au plus {@see self::MOTS}) doit trouver l'un des champs. La casse se
 *   replie par `CaseInsensitive` (ADR-0025 : `lower()` nu ne replie que l'ASCII sous
 *   `--locale=C`) ; les accents ne se replient pas (ADR-0020 §2) — la règle de TCK-2630. `%` et
 *   `_` sont pris au pied de la lettre.
 * - **Téléphone** : une saisie faite de chiffres et de séparateurs (`77 123 45 67`, `+221 78…`),
 *   d'au moins {@see self::CHIFFRES} chiffres, se compare aux seuls chiffres du numéro de la fiche
 *   — le numéro est rangé normalisé (`+221…`), la saisie, elle, a ses espaces.
 * - Moins de 2 caractères après `trim` : la recherche est ignorée. Une saisie hors UTF-8 ne
 *   trouve rien (jamais la liste entière en silence).
 */
final class BookingSearch
{
    private const MOTS = 6;

    private const CHIFFRES = 4;

    /** @param  Builder<Booking>  $query */
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
            $query->whereHas('customer', fn (Builder $c) => $c
                ->whereRaw("regexp_replace(coalesce(customers.phone, ''), '\\D', '', 'g') like ?", ['%'.$chiffres.'%']));

            return;
        }

        $mots = array_slice(preg_split('/\s+/u', $saisie, -1, PREG_SPLIT_NO_EMPTY) ?: [], 0, self::MOTS);
        foreach ($mots as $mot) {
            $motif = '%'.addcslashes(CaseInsensitive::fold($mot), '\\%_').'%';
            $query->where(fn (Builder $q) => $q
                ->whereRaw(CaseInsensitive::sql('bookings.reference_number').' like ?', [$motif])
                ->orWhereHas('customer', fn (Builder $c) => $c
                    ->whereRaw(CaseInsensitive::sql('customers.first_name').' like ?', [$motif])
                    ->orWhereRaw(CaseInsensitive::sql('customers.last_name').' like ?', [$motif]))
                ->orWhereHas('property', fn (Builder $p) => $p
                    ->whereRaw(CaseInsensitive::sql('properties.title').' like ?', [$motif])));
        }
    }
}
