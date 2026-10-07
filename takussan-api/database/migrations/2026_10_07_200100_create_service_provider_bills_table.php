<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-594 (ADR-0039 §8) — la facture d'intervention, pièce REÇUE d'un prestataire.
 *
 * `sp_bills_one_open_per_request` : une demande n'a qu'une facture ouverte. C'est ce qui permet à
 * l'observateur de créer la facture par `insertOrIgnore`, sans exception attendue (piège PostgreSQL
 * n° 1).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_provider_bills', function (Blueprint $table) {
            $table->id();
            $table->foreignId('maintenance_request_id')->constrained('maintenance_requests', 'id', 'sp_bills_request_fk')->cascadeOnDelete();
            $table->foreignId('agency_id')->nullable()->constrained('agencies', 'id', 'sp_bills_agency_fk')->nullOnDelete();
            $table->foreignId('property_id')->nullable()->constrained('properties', 'id', 'sp_bills_property_fk')->nullOnDelete();
            $table->foreignId('provider_id')->constrained('users', 'id', 'sp_bills_provider_fk')->restrictOnDelete();
            $table->string('reference_number')->unique('sp_bills_reference_unique');
            $table->string('provider_reference')->nullable();
            $table->decimal('amount', 14, 2);
            $table->string('currency', 3)->default('XOF');
            $table->boolean('exceeds_quote')->default(false);
            $table->string('status', 30)->default('pending_validation');
            $table->foreignId('validated_by_id')->nullable()->constrained('users', 'id', 'sp_bills_validated_by_fk')->nullOnDelete();
            $table->timestamp('validated_at')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->boolean('rechargeable_to_landlord')->default(true);
            $table->foreignId('imputed_payout_id')->nullable()->constrained('payouts', 'id', 'sp_bills_imputed_payout_fk')->nullOnDelete();
            $table->timestamps();

            $table->index(['agency_id', 'status'], 'sp_bills_agency_status_idx');
            $table->index('provider_id', 'sp_bills_provider_idx');
        });

        DB::statement("CREATE UNIQUE INDEX sp_bills_one_open_per_request ON service_provider_bills (maintenance_request_id) WHERE status NOT IN ('rejected', 'cancelled')");
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS sp_bills_one_open_per_request');
        Schema::dropIfExists('service_provider_bills');
    }
};
