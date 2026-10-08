<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-596 (VERIF-596 passe 2, N1 ; ADR-0042 §1) — deux termes que le bail exécute et que le contrat
 * imprime, mais qui n'étaient lus que dans un réglage global AU JOUR de l'exécution : l'indemnité de
 * départ anticipé (`lease.early_termination_penalty_months`) et le plafond de révision du loyer
 * (`lease.rent_review_max_pct`). Ils sont figés sur le bail quand le contrat l'est. Nuls : bail
 * antérieur, qui retombe sur le réglage.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leases', function (Blueprint $table) {
            $table->unsignedSmallInteger('early_termination_penalty_months')->nullable();
            $table->decimal('rent_review_max_pct', 5, 2)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('leases', function (Blueprint $table) {
            $table->dropColumn(['early_termination_penalty_months', 'rent_review_max_pct']);
        });
    }
};
