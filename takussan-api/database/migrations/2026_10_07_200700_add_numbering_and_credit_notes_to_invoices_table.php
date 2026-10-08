<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-594 (ADR-0039 §7) — numérotation continue par `(agency_id, kind, année)` et avoirs.
 *
 * L'unicité GLOBALE de `reference_number` ferait collisionner `FA-2026-00001` d'une agence à l'autre :
 * elle devient `(agency_id, reference_number)`, plus un index partiel pour les factures sans agence
 * (PostgreSQL tient deux `NULL` pour distincts). Les `INV-…` existantes ne sont pas renumérotées.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->string('kind', 20)->default('invoice')->after('status');
            $table->foreignId('credited_invoice_id')->nullable()->after('kind')
                ->constrained('invoices', 'id', 'invoices_credited_invoice_fk')->nullOnDelete();
            $table->unsignedSmallInteger('sequence_year')->nullable()->after('credited_invoice_id');
            $table->unsignedInteger('sequence_number')->nullable()->after('sequence_year');

            $table->dropUnique('invoices_reference_number_unique');
            $table->unique(['agency_id', 'reference_number'], 'invoices_agency_reference_unique');
            $table->unique(['agency_id', 'kind', 'sequence_year', 'sequence_number'], 'invoices_agency_kind_seq_unique');
            $table->index('credited_invoice_id', 'invoices_credited_invoice_idx');
        });

        DB::statement('CREATE UNIQUE INDEX invoices_reference_no_agency_unique ON invoices (reference_number) WHERE agency_id IS NULL');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS invoices_reference_no_agency_unique');

        Schema::table('invoices', function (Blueprint $table) {
            $table->dropIndex('invoices_credited_invoice_idx');
            $table->dropUnique('invoices_agency_kind_seq_unique');
            $table->dropUnique('invoices_agency_reference_unique');
            $table->dropForeign('invoices_credited_invoice_fk');
            $table->dropColumn(['kind', 'credited_invoice_id', 'sequence_year', 'sequence_number']);
            $table->unique('reference_number');
        });
    }
};
