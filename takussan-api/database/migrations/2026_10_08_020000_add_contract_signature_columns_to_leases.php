<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-596 §4B (ADR-0042 §1) — l'empreinte du contrat FIGÉ que les parties signent, et l'heure de
 * la demande. `contract_sha256` nul : aucun contrat figé (brouillon, ou défigé par une modification).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leases', function (Blueprint $table) {
            $table->string('contract_sha256', 64)->nullable();
            $table->timestamp('signature_requested_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('leases', function (Blueprint $table) {
            $table->dropColumn(['contract_sha256', 'signature_requested_at']);
        });
    }
};
