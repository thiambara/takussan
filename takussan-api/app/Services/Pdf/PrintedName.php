<?php

namespace App\Services\Pdf;

/**
 * TCK-2718 — le nom qu'un acte imprime pour une personne (locataire, garant) : le prénom et le nom ;
 * à défaut l'e-mail ; à défaut le téléphone ; à défaut « — ». Depuis TCK-2605, un compte ouvert par
 * e-mail naît sans prénom, comme celui ouvert par téléphone, et la fiche qui en naît aussi : le
 * contrat et la quittance imprimaient une case vide.
 *
 * Lit des attributs, jamais une relation : une copie restaurée par {@see PrintedIdentity::restore()}
 * imprime ce qui a été figé. Un nom présent s'imprime à l'octet près comme avant.
 */
final class PrintedName
{
    public static function of(?object $person): string
    {
        if ($person === null) {
            return '—';
        }

        $name = trim(((string) ($person->first_name ?? '')).' '.((string) ($person->last_name ?? '')));
        foreach ([$name, (string) ($person->email ?? ''), (string) ($person->phone ?? '')] as $candidate) {
            if (trim($candidate) !== '') {
                return $candidate;
            }
        }

        return '—';
    }
}
