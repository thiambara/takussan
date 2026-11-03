<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * TCK-2448 — l'identifiant d'un modèle s'envoie tel quel au fournisseur : ni espace, ni caractère de contrôle, ni
 * caractère invisible. Un octet NUL est le plus coûteux : PDO coupe le paramètre à cet octet, `neuf\0junk` trouve
 * donc la ligne `neuf`, passe pour tarifé, et meurt en 500 à l'écriture.
 */
class IdentifiantDeModele implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || preg_match('/^[^\s\p{C}\p{Z}]+$/u', $value) !== 1) {
            $fail('validation.regex')->translate();
        }
    }
}
