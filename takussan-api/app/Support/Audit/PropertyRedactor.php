<?php

namespace App\Support\Audit;

use Illuminate\Support\Collection;
use Illuminate\Support\Str;

/**
 * TCK-601 (ADR-0044 §2) — `properties` d'une ligne du journal, sans valeur sensible.
 *
 * Extrait de `CrossTenantAuditController` (TCK-144), qui était seul à expurger : l'audit d'agence et
 * les deux exports rendaient `properties` tel quel. C'est une défense en PROFONDEUR — le mécanisme
 * principal est qu'aucun écrivain n'y met de valeur sensible (liste blanche des modèles `Auditable`).
 *
 * Trois familles de motifs :
 *   · les secrets, reconnus par SOUS-CHAÎNE (`password`, `token`…), comme depuis TCK-144 ;
 *   · les identifiants personnels, reconnus par SEGMENT (`rib`, `rib_pro`, `owner_rib`, mais pas
 *     `attributes` ni `distribution`, qui contiennent `rib`) ;
 *   · l'adresse et le numéro, reconnus par DERNIER segment (TCK-692).
 * La clé est jugée telle quelle ET en snake_case (verif-601 n1) : `ownerRib`, `taxId`, `bankIban`
 * perdaient leur frontière de segment une fois en minuscules. Une chaîne qui porte un objet ou une
 * liste JSON est décodée, expurgée et réencodée.
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

    /**
     * TCK-953 (ADR-0070 § 9) — `id_number` : la pièce du client et de la caution. TCK-954 —
     * `income` : le revenu mensuel de la caution et du bailleur.
     *
     * @var list<string>
     */
    private const IDENTIFIER_SEGMENTS = ['rib', 'iban', 'tax_id', 'ninea', 'id_document', 'id_number', 'income'];

    /**
     * TCK-692 — l'adresse et le numéro, reconnus par DERNIER segment : `email`, `target_email`,
     * `secondary_phone`, mais pas `email_verified_at` ni `notifications_email_enabled`, qui
     * qualifient le contact sans le porter.
     *
     * @var list<string>
     */
    private const CONTACT_LAST_SEGMENTS = ['email', 'phone'];

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
            } elseif (is_string($value)) {
                $array[$key] = self::walkJson($value);
            }
        }

        return $array;
    }

    /** Une charge JSON recopiée en chaîne (`'payload' => '{"rib":…}'`) ; toute autre chaîne reste telle quelle. */
    private static function walkJson(string $value): string
    {
        if ($value === '' || ($value[0] !== '{' && $value[0] !== '[')) {
            return $value;
        }

        $decoded = json_decode($value, true);

        return is_array($decoded)
            ? (string) json_encode(self::walk($decoded), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
            : $value;
    }

    public static function isSensitive(string $key): bool
    {
        // Les deux formes : `Str::snake('RIB')` rend `r_i_b`, la forme en minuscules garde `rib`.
        foreach (array_unique([strtolower($key), Str::snake($key)]) as $form) {
            if (self::matches($form)) {
                return true;
            }
        }

        return false;
    }

    private static function matches(string $lower): bool
    {
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

        foreach (self::CONTACT_LAST_SEGMENTS as $segment) {
            if (str_ends_with($wrapped, '_'.$segment.'_')) {
                return true;
            }
        }

        return false;
    }
}
