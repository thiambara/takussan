<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-595 (ADR-0049 §3) — le grand livre des commissions d'agence.
 *
 * Une ligne par bénéficiaire et par bail, figée à l'activation : la recalculer depuis les parts
 * courantes réécrirait un mois clos dès qu'une part change ou qu'un agent quitte l'agence.
 * L'unicité `(lease_id, beneficiary_id)` porte l'idempotence (`insertOrIgnore`) ; l'index
 * `(agency_id, beneficiary_id, earned_at)` sert le relevé d'un agent et la tuile de la période.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('commission_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('agency_id')->constrained('agencies', 'id', 'commission_entries_agency_fk')->cascadeOnDelete();
            $table->foreignId('lease_id')->constrained('leases', 'id', 'commission_entries_lease_fk')->cascadeOnDelete();
            $table->foreignId('beneficiary_id')->constrained('users', 'id', 'commission_entries_beneficiary_fk')->cascadeOnDelete();
            $table->string('origin', 20);
            $table->decimal('base_amount', 14, 2);
            $table->decimal('share_percent', 5, 2);
            $table->decimal('amount', 14, 2);
            $table->string('currency', 3)->default('XOF');
            $table->string('status', 20)->default('due');
            $table->timestamp('earned_at');
            $table->timestamp('paid_at')->nullable();
            $table->foreignId('paid_by_id')->nullable()->constrained('users', 'id', 'commission_entries_paid_by_fk')->nullOnDelete();
            $table->timestamp('cancelled_at')->nullable();
            $table->foreignId('cancelled_by_id')->nullable()->constrained('users', 'id', 'commission_entries_cancelled_by_fk')->nullOnDelete();
            $table->jsonb('metadata')->nullable();
            $table->timestamps();

            $table->unique(['lease_id', 'beneficiary_id'], 'commission_entries_lease_benef_uq');
            $table->index(['agency_id', 'beneficiary_id', 'earned_at'], 'commission_entries_agency_benef_idx');
            $table->index('beneficiary_id', 'commission_entries_beneficiary_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('commission_entries');
    }
};
