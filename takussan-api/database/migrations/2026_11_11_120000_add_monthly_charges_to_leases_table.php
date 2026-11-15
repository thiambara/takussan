<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2679 (ADR-0042, amendement du 2026-11-10 ; ADR-0100 § 6) — les charges du bail, terme imprimé
 * au contrat et appelé par l'échéancier à côté du loyer.
 *
 * Nullable, SANS défaut : un bail existant garde une colonne nulle, son contrat n'imprime pas de
 * ligne de charges, et l'empreinte d'un contrat figé reste celle que les parties ont signée.
 * Aucune échéance de charges n'est créée pour les baux déjà actifs.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leases', function (Blueprint $table) {
            $table->decimal('monthly_charges', 14, 2)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('leases', function (Blueprint $table) {
            $table->dropColumn('monthly_charges');
        });
    }
};
