<?php

namespace App\Http\Filters;

use Illuminate\Database\Eloquent\Builder;
use Spatie\QueryBuilder\Filters\FiltersExact;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;

/**
 * Le filtre exact d'une colonne d'IDENTIFIANT (`id`, `*_id`) : il refuse en 400 une valeur qui
 * n'est pas un entier, au lieu de la laisser à PostgreSQL.
 *
 * Relevé le 2026-09-24 (vérification de TCK-576) : `filter[property_id]=abc` rendait **500** sur
 * `/api/leases`, `/api/properties`, `/api/invoices`, `/api/maintenance-requests` — et sur tout
 * `filter[<x>_id]` exact du dépôt. PostgreSQL refuse la conversion (`SQLSTATE[22P02] invalid
 * input syntax for type bigint`) là où MySQL et SQLite comparaient en silence ; la requête du
 * client était fautive, la réponse accusait le serveur. Un chiffre de trop pour un `bigint`
 * (`22003`) aussi.
 *
 * Le 400 est celui que spatie rend déjà pour un filtre inconnu : même enveloppe `{message}`
 * (`bootstrap/app.php`). Une valeur vide passe telle quelle : c'est le filtre exact qui en décide.
 */
class ExactIdentifierFilter extends FiltersExact
{
    /** Au-delà, la valeur sort d'un `bigint` signé (9 223 372 036 854 775 807, 19 chiffres). */
    private const CHIFFRES_MAX = 18;

    public function __invoke(Builder $query, mixed $value, string $property): void
    {
        foreach ((array) $value as $identifiant) {
            if (! self::estUnIdentifiant($identifiant)) {
                throw new BadRequestHttpException("Filter value for `{$property}` must be an integer identifier.");
            }
        }

        parent::__invoke($query, $value, $property);
    }

    /** `id` ou `<quelque chose>_id` : les colonnes que ce filtre garde. */
    public static function garde(string $colonne): bool
    {
        $nom = str_contains($colonne, '.') ? substr($colonne, strrpos($colonne, '.') + 1) : $colonne;

        return $nom === 'id' || str_ends_with($nom, '_id');
    }

    private static function estUnIdentifiant(mixed $valeur): bool
    {
        if ($valeur === null || $valeur === '' || is_int($valeur)) {
            return true;
        }

        return is_string($valeur) && preg_match('/^\d{1,'.self::CHIFFRES_MAX.'}$/', $valeur) === 1;
    }
}
