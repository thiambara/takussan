<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-592 (P12) — un devis est une liste de lignes, une date de validité et une durée.
 *
 * `quote_amount` reste la colonne lue partout (montant décimal, principe n°3) ; il est désormais
 * CALCULÉ depuis `quote_lines` au moment de la soumission. Les lignes gardent leurs nombres en
 * chaînes décimales dans le jsonb : un flottant JSON n'a pas d'arithmétique exacte.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('maintenance_requests', function (Blueprint $table): void {
            $table->jsonb('quote_lines')->nullable()->after('quote_currency');
            $table->date('quote_valid_until')->nullable()->after('quote_lines');
            $table->unsignedSmallInteger('quote_estimated_duration_days')->nullable()->after('quote_valid_until');
        });
    }

    public function down(): void
    {
        Schema::table('maintenance_requests', function (Blueprint $table): void {
            $table->dropColumn(['quote_lines', 'quote_valid_until', 'quote_estimated_duration_days']);
        });
    }
};
