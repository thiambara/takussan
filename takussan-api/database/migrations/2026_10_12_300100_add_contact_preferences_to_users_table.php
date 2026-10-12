<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-633 (lot C) — les préférences de contact d'un compte : WhatsApp sur chaque numéro, un
 * second numéro VÉRIFIÉ, et l'acceptation datée des CGU (première publication).
 *
 * `users_secondary_phone_verified_unique` : un second numéro n'est vérifié que sur un compte
 * vivant à la fois. Index partiel sur la colonne BRUTE : son seul écrivain
 * (`PhoneVerificationService::markSecondaryVerified`) l'écrit déjà sous la forme canonique
 * (`CanonicalPhone::fold`), et il TESTE avant d'écrire (piège PostgreSQL n° 1) — l'index n'est
 * que le dernier recours. Nom explicite (37 caractères ≤ 63).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Nullable, sans défaut : `null` = la question n'a jamais reçu de réponse, que
            // l'écran de publication pose alors ; `false` = « non ». Un booléen à défaut faux
            // confondait les deux (vérification adverse du lot C). Le second numéro, lui, ne
            // se vérifie qu'avec sa case : il a toujours une réponse.
            $table->boolean('phone_whatsapp')->nullable();
            $table->string('secondary_phone', 30)->nullable();
            $table->timestamp('secondary_phone_verified_at')->nullable();
            $table->boolean('secondary_phone_whatsapp')->default(false);
            $table->timestamp('terms_accepted_at')->nullable();
            $table->string('terms_version', 40)->nullable();
        });

        DB::statement(
            'CREATE UNIQUE INDEX users_secondary_phone_verified_unique ON users (secondary_phone) '
            .'WHERE secondary_phone_verified_at IS NOT NULL AND deleted_at IS NULL'
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS users_secondary_phone_verified_unique');

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'phone_whatsapp', 'secondary_phone', 'secondary_phone_verified_at',
                'secondary_phone_whatsapp', 'terms_accepted_at', 'terms_version',
            ]);
        });
    }
};
