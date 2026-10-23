<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use SplFileInfo;

/**
 * P194.01 — refuse le fichier de 0 octet, et lui seul.
 *
 * `min:1` jugeait la taille en kilo-octets (`getSize() / 1024`) : il refusait tout fichier de moins
 * de 1 024 octets — une note `.txt`, un petit CSV, une photo PNG de quelques centaines d'octets —,
 * alors qu'il ne visait que le fichier vide (TCK-601, AC5). Le message reprend celui d'un
 * téléversement échoué (`validation.uploaded`) : un fichier vide n'apporte rien à stocker.
 */
class FichierNonVide implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if ($value instanceof SplFileInfo && $value->getSize() === 0) {
            $fail('validation.uploaded')->translate();
        }
    }
}
