<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lease_payments', function (Blueprint $table) {
            $table->dateTime('bank_reconciled_at')->nullable()->after('paid_at');
            $table->unsignedBigInteger('bank_statement_line_id')->nullable()->after('bank_reconciled_at');
            $table->foreign('bank_statement_line_id')->references('id')->on('bank_statement_lines')->nullOnDelete();
        });

        $this->addPartialUnique('lease_payments', 'bank_statement_line_id');
    }

    public function down(): void
    {
        Schema::table('lease_payments', function (Blueprint $table) {
            $table->dropForeign(['bank_statement_line_id']);
            $table->dropColumn(['bank_reconciled_at', 'bank_statement_line_id']);
        });
    }

    private function addPartialUnique(string $table, string $column): void
    {
        // ⚠ Plus de branchement par driver depuis ADR-0020 : il n'y a qu'un moteur.
        // La forme conditionnelle disait « pgsql ou sqlite → index partiel, SINON un
        // unique simple » — et ce « sinon », écrit pour MySQL, n'a jamais été exécuté
        // par un test et ne le sera plus. Un branchement à une seule branche laisse
        // croire qu'il en existe une seconde et invite à la « compléter ».
        //
        // ⚠⚠ Les deux formes n'étaient PAS équivalentes : l'index partiel n'interdit
        // les doublons que sur les lignes NON NULLES, là où un unique simple compte
        // aussi les NULL sur certains moteurs. C'est l'index partiel qui porte
        // l'intention.
        DB::statement("CREATE UNIQUE INDEX {$table}_bank_line_unique ON {$table} ({$column}) WHERE {$column} IS NOT NULL");
    }
};
