<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2970 (ADR-0130 §§ 3 et 4) — le marqueur de la question « Tenu ? » : posée une heure après l'échéance
 * d'un engagement `open` qui a un bénéficiaire, une fois par échéance. Il tombe quand `due_at` change
 * (`Commitment::booted`), avec les autres marqueurs du signal planifié.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('commitments', function (Blueprint $table) {
            $table->timestamp('check_requested_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('commitments', function (Blueprint $table) {
            $table->dropColumn('check_requested_at');
        });
    }
};
