<?php

namespace App\Services\Accounting\StatementParser;

/**
 * TCK-593 — le compte des lignes qu'un pilote a SAUTÉES pendant l'analyse d'un relevé.
 *
 * Le parseur est un générateur : il ne peut rien « rendre » d'autre que les lignes lues. Ce
 * compteur, porté par le `ParserContext`, est ce qu'il rend au job — qui l'écrit sur le relevé
 * (`skipped_lines_count`) au lieu de laisser la ligne disparaître dans un journal.
 */
final class ParseTally
{
    public int $skipped = 0;

    public function skip(): void
    {
        $this->skipped++;
    }
}
