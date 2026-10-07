<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-593 — aucune perte silencieuse à la lecture d'un relevé.
 *
 * - `csv_mapping` : le mapping EFFECTIF figé à l'import. Modifier ensuite celui de l'agence ne
 *   ré-interprète aucun relevé passé.
 * - `skipped_lines_count` : les lignes sautées — illisibles, ou à date ou montant vide — sont
 *   comptées et exposées au lieu de disparaître.
 *
 * Le statut `failed` s'ajoute à `BankStatementStatus` sans migration : la colonne est une chaîne
 * (ADR-0007, pas d'`enum()` SQL).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bank_statements', function (Blueprint $table) {
            $table->jsonb('csv_mapping')->nullable()->after('account_iban_masked');
            $table->unsignedInteger('skipped_lines_count')->default(0)->after('lines_count');
        });
    }

    public function down(): void
    {
        Schema::table('bank_statements', function (Blueprint $table) {
            $table->dropColumn(['csv_mapping', 'skipped_lines_count']);
        });
    }
};
