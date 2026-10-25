<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * TCK-2054 (ADR-0073 § 2 et § 3) — LE point de calcul et de pose d'un verrou consultatif
 * transactionnel PostgreSQL.
 *
 * La clé est la chaîne `<espace de nom>:<partie>:<partie>…`, ramenée aux 8 premiers octets de son
 * SHA-256, lus comme un entier signé de 64 bits : le `bigint` qu'attend `pg_advisory_xact_lock`.
 * En 32 bits (`crc32`), deux clés distinctes partagent un entier avec une probabilité qui passe
 * 50 % vers 77 000 clés ; en 64 bits, ce risque devient négligeable. Une clé calculée en PHP se
 * teste sans base, ce que `hashtextextended()` (fonction interne de PostgreSQL) ne permet pas.
 *
 * Toujours la forme transactionnelle, toujours dans une transaction ouverte : hors transaction,
 * l'instruction se valide seule et le verrou tombe aussitôt. `acquire()` le refuse donc.
 * Le verrou se prend en dernier, après les verrous de ligne, un seul par transaction (règle 4).
 *
 * Les deux verrous antérieurs (`SuperAdminCooptationService`, `IntegrationController::store`)
 * gardent leur `crc32` tant qu'on ne les touche pas (ADR-0073 § 4).
 */
final class AdvisoryLock
{
    public static function key(string $namespace, string ...$parts): int
    {
        $digest = hash('sha256', implode(':', [$namespace, ...$parts]), true);

        /** @var array{1: int} $value */
        $value = unpack('J', substr($digest, 0, 8));

        return $value[1];
    }

    public static function acquire(string $namespace, string ...$parts): void
    {
        if (DB::transactionLevel() === 0) {
            throw new \LogicException('Un verrou consultatif se prend dans une transaction ouverte (ADR-0073 § 3, règle 2).');
        }

        DB::selectOne('select pg_advisory_xact_lock(?::bigint)', [self::key($namespace, ...$parts)]);
    }
}
