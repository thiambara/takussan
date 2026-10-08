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
 *  - L'index porte sur la forme CANONIQUE du numéro (`App\Support\CanonicalPhone::sql`,
 *    vérification adverse m5), pas sur la chaîne brute : un numéro vérifié hérité hors
 *    E.164 (`780143710+221`) et sa forme E.164 sont le même numéro. L'expression
 *    ci-dessous est écrite en littéral — une migration ne suit pas le code — et
 *    `CanonicalPhoneTest` vérifie que les requêtes l'empruntent.
 *
 * Deux relevés à faire avant de migrer une base peuplée.
 *
 * 1. Les numéros vérifiés hors E.164, à corriger ou à laisser à la forme canonique :
 *
 *     SELECT id, phone FROM users
 *      WHERE phone_verified_at IS NOT NULL AND deleted_at IS NULL
 *        AND phone !~ '^\+[1-9][0-9]{7,14}$';
 *
 * 2. Les doublons, comptés sur la forme canonique (sinon la création de l'index
 *    échoue, et le dit) :
 *
 *     SELECT <expression de l'index>, count(*) FROM users
 *      WHERE phone_verified_at IS NOT NULL AND deleted_at IS NULL
 *      GROUP BY 1 HAVING count(*) > 1;
 *
 * `down()` rétablit `NOT NULL` sur `email` : il ÉCHOUE, bruyamment, tant qu'un
 * compte sans e-mail existe — le retour en arrière ne supprime pas de comptes.
 */
return new class extends Migration
{
    /** `App\Support\CanonicalPhone::sql('phone')` au jour de cette migration. */
    private const CANONICAL_PHONE = "regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(phone, '[[:space:]().-]', '', 'g'), '^00', '+'), '^([0-9]+)\\+([0-9]{1,3})\$', '+\\2\\1'), '^(221[0-9]{9})\$', '+\\1'), '^([0-9]{9})\$', '+221\\1')";

    public function up(): void
    {
        DB::statement('ALTER TABLE users ALTER COLUMN email DROP NOT NULL');
        DB::statement(
            'CREATE UNIQUE INDEX users_phone_verified_unique ON users (('.self::CANONICAL_PHONE.')) '
            .'WHERE phone_verified_at IS NOT NULL AND deleted_at IS NULL'
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS users_phone_verified_unique');
        DB::statement('ALTER TABLE users ALTER COLUMN email SET NOT NULL');
    }
};
