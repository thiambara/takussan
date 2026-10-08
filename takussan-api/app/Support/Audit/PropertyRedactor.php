<?php

namespace App\Support\Audit;

use Illuminate\Support\Collection;

/**
 * TCK-601 (ADR-0044 §2) — `properties` d'une ligne du journal, sans valeur sensible.
 *
 * Extrait de `CrossTenantAuditController` (TCK-144), qui était seul à expurger : l'audit d'agence et
 * les deux exports rendaient `properties` tel quel. C'est une défense en PROFONDEUR — le mécanisme
 * principal est qu'aucun écrivain n'y met de valeur sensible (liste blanche des modèles `Auditable`).
 *
 * Deux familles de motifs :
 *   · les secrets, reconnus par SOUS-CHAÎNE (`password`, `token`…), comme depuis TCK-144 ;
 *   · les identifiants personnels, reconnus par SEGMENT (`rib`, `rib_pro`, `owner_rib`, mais pas
 *     `attributes` ni `distribution`, qui contiennent `rib`).
 * La clé reste, sa valeur devient `[REDACTED]`.
 */
final class PropertyRedactor
{
    public const REDACTED = '[REDACTED]';

    /** @var list<string> */
    private const SECRET_SUBSTRINGS = [
        'password', 'token', 'secret', 'api_key', 'apikey', 'private_key', 'recovery',
        'two_factor', '2fa', 'credit_card', 'card_number', 'cvv', 'authorization',
    ];

    /** @var list<string> */
    private const IDENTIFIER_SEGMENTS = ['rib', 'iban', 'tax_id', 'ninea', 'id_document'];

    public static function redact(mixed $properties): mixed
    {
        if ($properties === null) {
            return null;
        }

        $array = $properties instanceof Collection ? $properties->toArray() : (array) $properties;

        return self::walk($array);
    }

    /**
     * Parcours récursif : une clé sensible remplace sa valeur ENTIÈRE, tableau compris. Un
     * `array_walk_recursive` ne visite que les feuilles — sous `rib => ['old' => …, 'new' => …]`, il
     * jugeait `old` et `new`, jamais `rib`, et rendait les deux valeurs en clair.
     *
     * @param  array<mixed>  $array
     * @return array<mixed>
     */
    private static function walk(array $array): array
    {
        foreach ($array as $key => $value) {
            if (is_string($key) && self::isSensitive($key)) {
                $array[$key] = self::REDACTED;
            } elseif (is_array($value)) {
                $array[$key] = self::walk($value);
            }
        }

        return $array;
    }

    public static function isSensitive(string $key): bool
    {
        $lower = strtolower($key);

        foreach (self::SECRET_SUBSTRINGS as $pattern) {
            if (str_contains($lower, $pattern)) {
                return true;
            }
        }

        $wrapped = '_'.preg_replace('/[^a-z0-9]+/', '_', $lower).'_';
        foreach (self::IDENTIFIER_SEGMENTS as $segment) {
            if (str_contains($wrapped, '_'.$segment.'_')) {
                return true;
            }
        }

        return false;
    }
}
