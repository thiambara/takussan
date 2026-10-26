<?php

namespace Database\Seeders\Support;

/**
 * TCK-2379 — un PDF d'une page, écrit sans réseau ni moteur de rendu : la pièce qu'un titulaire
 * dépose (registre du commerce, NINEA, pièce d'identité) quand l'application n'a pas de gabarit
 * pour la produire. Le contrat de bail, lui, passe par le rendu de l'application
 * (`LeaseSignatureService::freezeRenewal()`).
 */
final class SeedPdf
{
    /** @param  list<string>  $lignes */
    public static function page(string $titre, array $lignes): string
    {
        $texte = 'BT /F1 16 Tf 56 780 Td ('.self::echapper($titre).') Tj /F1 11 Tf';
        foreach ($lignes as $ligne) {
            $texte .= ' 0 -22 Td ('.self::echapper($ligne).') Tj';
        }
        $texte .= ' ET';

        $objets = [
            '<< /Type /Catalog /Pages 2 0 R >>',
            '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
            '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
            '<< /Length '.strlen($texte)." >>\nstream\n".$texte."\nendstream",
        ];

        $pdf = "%PDF-1.4\n";
        $positions = [];
        foreach ($objets as $i => $corps) {
            $positions[] = strlen($pdf);
            $pdf .= ($i + 1)." 0 obj\n".$corps."\nendobj\n";
        }
        $xref = strlen($pdf);
        $pdf .= "xref\n0 ".(count($objets) + 1)."\n0000000000 65535 f \n";
        foreach ($positions as $position) {
            $pdf .= sprintf("%010d 00000 n \n", $position);
        }

        return $pdf.'trailer << /Size '.(count($objets) + 1)." /Root 1 0 R >>\nstartxref\n".$xref."\n%%EOF\n";
    }

    /** Helvetica en WinAnsi : les accents du français passent, les parenthèses s'échappent. */
    private static function echapper(string $texte): string
    {
        return strtr((string) mb_convert_encoding($texte, 'Windows-1252', 'UTF-8'), ['\\' => '\\\\', '(' => '\\(', ')' => '\\)']);
    }
}
