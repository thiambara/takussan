<?php

use App\Support\CaseInsensitive;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-591 — les critères de recherche d'un prospect, et les deux index du détecteur de doublons.
 *
 * Vocabulaire aligné sur `PropertySearchService` (type de contrat, budget, types, villes, quartiers,
 * chambres) : un prospect se convertira en recherche sauvegardée sans traduction (TCK-599).
 * `seeking_contract_type` est un `string` contrôlé par l'application (ADR-0007, pas d'`enum()`).
 *
 * L'index d'e-mail est une EXPRESSION : la requête du détecteur écrit exactement
 * `LOWER(email COLLATE "und-x-icu")` (ADR-0025), sans quoi elle ne l'emprunterait pas.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->string('seeking_contract_type', 20)->nullable();
            $table->decimal('budget_min', 15, 2)->nullable();
            $table->decimal('budget_max', 15, 2)->nullable();
            $table->jsonb('seeking_property_types')->nullable();
            $table->jsonb('seeking_cities')->nullable();
            $table->jsonb('seeking_neighborhoods')->nullable();
            $table->unsignedSmallInteger('min_bedrooms')->nullable();

            $table->index(['agency_id', 'phone'], 'customers_agency_phone_idx');
        });

        DB::statement(sprintf(
            'CREATE INDEX customers_agency_email_ci_idx ON customers (agency_id, (%s))',
            CaseInsensitive::sql('email'),
        ));
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS customers_agency_email_ci_idx');

        Schema::table('customers', function (Blueprint $table) {
            $table->dropIndex('customers_agency_phone_idx');
            $table->dropColumn([
                'seeking_contract_type', 'budget_min', 'budget_max',
                'seeking_property_types', 'seeking_cities', 'seeking_neighborhoods',
                'min_bedrooms',
            ]);
        });
    }
};
