<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2909 — les termes du mandat de gestion, portés par la relation bailleur–agence
 * (`owner_profiles`, unique par couple utilisateur–agence) : dates du mandat, moyen et jour de
 * versement (« avant le N du mois », 1 à 28), et le référent de l'agence qui suit le bailleur.
 *
 * Toutes nullables : aucune valeur n'est inventée pour l'existant. Le jour est borné par une
 * contrainte CHECK (un 29, 30 ou 31 n'existe pas tous les mois). Le référent part avec son compte
 * (`nullOnDelete`) ; un référent qui quitte l'agence reste écrit, et la lecture le juge
 * (`InterlocuteurDuBailleur`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('owner_profiles', function (Blueprint $table): void {
            $table->date('mandate_starts_on')->nullable()->after('works_approval_threshold');
            $table->date('mandate_ends_on')->nullable()->after('mandate_starts_on');
            $table->string('payout_method', 32)->nullable()->after('mandate_ends_on');
            $table->unsignedSmallInteger('payout_day')->nullable()->after('payout_method');
            $table->foreignId('referent_agent_id')->nullable()->after('payout_day')
                ->constrained('users')->nullOnDelete();
            $table->index('referent_agent_id');
        });

        DB::statement('ALTER TABLE owner_profiles ADD CONSTRAINT owner_profiles_payout_day_check CHECK (payout_day IS NULL OR payout_day BETWEEN 1 AND 28)');
        DB::statement('ALTER TABLE owner_profiles ADD CONSTRAINT owner_profiles_mandate_dates_check CHECK (mandate_starts_on IS NULL OR mandate_ends_on IS NULL OR mandate_ends_on >= mandate_starts_on)');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE owner_profiles DROP CONSTRAINT IF EXISTS owner_profiles_mandate_dates_check');
        DB::statement('ALTER TABLE owner_profiles DROP CONSTRAINT IF EXISTS owner_profiles_payout_day_check');

        Schema::table('owner_profiles', function (Blueprint $table): void {
            $table->dropForeign(['referent_agent_id']);
            $table->dropIndex(['referent_agent_id']);
            $table->dropColumn(['mandate_starts_on', 'mandate_ends_on', 'payout_method', 'payout_day', 'referent_agent_id']);
        });
    }
};
