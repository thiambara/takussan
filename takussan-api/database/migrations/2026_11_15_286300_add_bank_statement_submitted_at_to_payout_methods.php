<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2863 — le relevé d'identité bancaire d'un compte « à confirmer » : sa date d'envoi met la
 * destination « en revue ». Informatif seulement : rien n'est vérifié par lui — seule une ligne de
 * `payout_method_verifications` (le geste d'une agence) l'est (ADR-0039 §6).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payout_methods', function (Blueprint $table) {
            $table->timestamp('bank_statement_submitted_at')->nullable()->after('is_default');
        });
    }

    public function down(): void
    {
        Schema::table('payout_methods', function (Blueprint $table) {
            $table->dropColumn('bank_statement_submitted_at');
        });
    }
};
