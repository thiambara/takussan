<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2578 (ADR-0101 § 2) — la note `visit_report` cite SA visite, et il n'y en a qu'une par
 * visite : une modification du compte rendu réécrit cette note, n'en crée pas une seconde. Sans
 * lien, rien ne distinguait les comptes rendus de deux visites d'un même client.
 *
 * L'unicité est un index PARTIEL (notes vivantes de nature `visit_report`) : les autres notes ne
 * portent pas de visite, et une note supprimée ne bloque pas sa remplaçante. `nullOnDelete` : la
 * visite supprimée laisse la note au fil du client.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customer_notes', function (Blueprint $table) {
            $table->foreignId('property_visit_id')->nullable()
                ->constrained('property_visits', 'id', 'customer_notes_visit_fk')
                ->nullOnDelete();
        });

        DB::statement(
            'CREATE UNIQUE INDEX customer_notes_visit_report_unique ON customer_notes (property_visit_id) '
            ."WHERE kind = 'visit_report' AND deleted_at IS NULL AND property_visit_id IS NOT NULL"
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS customer_notes_visit_report_unique');

        Schema::table('customer_notes', function (Blueprint $table) {
            $table->dropForeign('customer_notes_visit_fk');
            $table->dropColumn('property_visit_id');
        });
    }
};
