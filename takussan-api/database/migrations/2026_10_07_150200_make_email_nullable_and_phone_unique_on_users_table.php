<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * TCK-589 (ADR-0033) — le téléphone vérifié devient un identifiant de connexion.
 *
 *  - `email` devient nullable : un compte créé par téléphone n'en a pas. L'index
 *    `users_email_lower_unique` (ADR-0025) reste valide — PostgreSQL ne compare
 *    pas deux NULL.
 *  - `users_phone_verified_unique` : un numéro n'est VÉRIFIÉ que sur un compte
 *    vivant à la fois. Index partiel : un numéro non vérifié ne prouve rien
 *    (contrainte 2) et peut figurer sur plusieurs comptes. L'index est le dernier
 *    recours : `PhoneVerificationService::markVerified` teste AVANT d'écrire (une
 *    violation abandonnerait la transaction entière, piège PostgreSQL n° 1).
 *
 * Relevé des doublons à faire avant de migrer une base peuplée (sinon la création
 * de l'index échoue, et le dit) :
 *
 *     SELECT phone, count(*) FROM users
 *      WHERE phone_verified_at IS NOT NULL AND deleted_at IS NULL
 *      GROUP BY phone HAVING count(*) > 1;
 *
 * `down()` rétablit `NOT NULL` sur `email` : il ÉCHOUE, bruyamment, tant qu'un
 * compte sans e-mail existe — le retour en arrière ne supprime pas de comptes.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE users ALTER COLUMN email DROP NOT NULL');
        DB::statement(
            'CREATE UNIQUE INDEX users_phone_verified_unique ON users (phone) '
            .'WHERE phone_verified_at IS NOT NULL AND deleted_at IS NULL'
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS users_phone_verified_unique');
        DB::statement('ALTER TABLE users ALTER COLUMN email SET NOT NULL');
    }
};
