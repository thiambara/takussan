<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2911 (ADR-0120 § 1) — l'instant où le prestataire a « Facturé » : la facture naît `draft` à la
 * clôture, et part (`pending_validation`) par son geste. Nullable : les factures antérieures gardent
 * leur statut et n'ont pas d'instant d'envoi — le relevé les date par `created_at`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('service_provider_bills', function (Blueprint $table) {
            $table->timestamp('submitted_at')->nullable()->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('service_provider_bills', function (Blueprint $table) {
            $table->dropColumn('submitted_at');
        });
    }
};
