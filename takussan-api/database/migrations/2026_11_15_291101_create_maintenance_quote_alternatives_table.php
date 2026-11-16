<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2911 (ADR-0120 § 3) — les devis consultés et non retenus d'une intervention : le personnel de
 * l'agence les enregistre, le bailleur les lit à côté du devis recommandé. Un prestataire du compte
 * OU un nom libre. Pas d'`agency_id` : la ligne se lit toujours par sa demande.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('maintenance_quote_alternatives', function (Blueprint $table) {
            $table->id();
            $table->foreignId('maintenance_request_id')->constrained('maintenance_requests')->cascadeOnDelete();
            $table->foreignId('provider_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('provider_name', 150)->nullable();
            $table->decimal('amount', 14, 2);
            $table->string('currency', 3)->default('XOF');
            $table->foreignId('created_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            // Lues par leur demande, au détail.
            $table->index('maintenance_request_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('maintenance_quote_alternatives');
    }
};
