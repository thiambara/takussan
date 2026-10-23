<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-1919 (P157.06, décision du porteur : marquer, ne pas sauter) — la ligne d'un relevé qui
 * reprend une transaction déjà importée pour l'agence (même référence, date, montant et sens) pointe
 * vers la première ligne qui l'a portée. Colonne additive et nullable : aucune ligne existante n'est
 * réécrite. Supprimer la ligne d'origine (relevé supprimé) efface la marque.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bank_statement_lines', function (Blueprint $table) {
            $table->foreignId('duplicate_of_line_id')
                ->nullable()
                ->after('counterparty')
                ->constrained('bank_statement_lines', 'id', 'bsl_duplicate_of_line_fk')
                ->nullOnDelete();
            $table->index('duplicate_of_line_id', 'bsl_duplicate_of_line_idx');
        });
    }

    public function down(): void
    {
        Schema::table('bank_statement_lines', function (Blueprint $table) {
            $table->dropForeign('bsl_duplicate_of_line_fk');
            $table->dropIndex('bsl_duplicate_of_line_idx');
            $table->dropColumn('duplicate_of_line_id');
        });
    }
};
