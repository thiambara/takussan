<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2672 — « Demander une correction » (le refus d'un bien en attente) porte un code de motif :
 * `photos`, `price`, `address`, `description`, `other` (`RejectPropertyRequest::REASON_CODES`), à
 * côté du texte libre `rejection_reason`. Une chaîne et un contrôle applicatif, jamais un `enum`
 * SQL (ADR-0007). Nullable : les refus antérieurs, et le verrou plateforme, n'en portent pas.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('properties', function (Blueprint $table): void {
            $table->string('rejection_reason_code', 20)->nullable()->after('rejection_reason');
        });
    }

    public function down(): void
    {
        Schema::table('properties', function (Blueprint $table): void {
            $table->dropColumn('rejection_reason_code');
        });
    }
};
