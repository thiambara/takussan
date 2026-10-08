<?php

namespace App\Support\Export;

/**
 * TCK-601 (verif-601 m3) — une cellule de CSV qu'un tableur ne lit pas comme une formule.
 *
 * Une cellule qui commence par `=`, `+`, `-`, `@`, une tabulation ou un retour chariot est exécutée
 * par Excel ou LibreOffice à l'ouverture (`=HYPERLINK(…)`). Le registre des demandes de droits
 * recopie le nom saisi par l'utilisateur, à destination du super-admin : la cellule est préfixée
 * d'une apostrophe, que le tableur affiche comme du texte.
 *
 * Un NOMBRE reste un nombre : `-1500` ou `+3.5` ne sont pas neutralisés, un montant négatif
 * s'exporte tel quel.
 */
final class CsvCell
{
    private const TRIGGERS = ['=', '+', '-', '@', "\t", "\r"];

    public static function neutralize(mixed $value): mixed
    {
        if (! is_string($value) || $value === '' || is_numeric($value)) {
            return $value;
        }

        return in_array($value[0], self::TRIGGERS, true) ? "'".$value : $value;
    }

    /**
     * @param  array<int, mixed>  $line
     * @return array<int, mixed>
     */
    public static function line(array $line): array
    {
        return array_map(self::neutralize(...), $line);
    }
}
